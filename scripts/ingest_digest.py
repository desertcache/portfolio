"""Ingest Hill Money Watch digests from a public Drive folder into blog/posts/.

This module is the ingest boundary. Everything crossing it is treated as untrusted:
the Cowork task that writes into Drive is a separate system on a separate schedule,
and its output shape can drift without warning. So the rule here is validate first,
publish second, and fail the workflow rather than publish something unverified.

Design notes for future edits:
  * Parsing and rendering are pure functions over strings. All network and disk I/O
    lives in `main()` and the two `drive_*` helpers. That split is what makes
    test_ingest_digest.py possible without mocking HTTP.
  * Idempotency comes from the filesystem, not from bookkeeping: a digest is
    "already published" iff its target path exists. No state file to corrupt,
    no cursor to drift. Delete a post and it republishes on the next run.
  * posts.json is regenerated from disk every run rather than appended to, so a
    hand-deleted post self-heals instead of leaving a dangling index entry.
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from bs4 import BeautifulSoup  # type: ignore[import-untyped]

DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
FILENAME_RE = re.compile(r"^hill-money-watch-(\d{4}-\d{2}-\d{2})\.html$")
SLUG_SUFFIX = "hill-money-watch"

REPO_ROOT = Path(__file__).resolve().parent.parent
BLOG_DIR = REPO_ROOT / "blog"
POSTS_DIR = BLOG_DIR / "posts"
POSTS_INDEX = BLOG_DIR / "posts.json"
POST_TEMPLATE = BLOG_DIR / "_post.template.html"

# A real digest is never this short. Catches truncated uploads and error pages
# that happen to be valid HTML.
MIN_BODY_CHARS = 400
HTTP_TIMEOUT_S = 30
LOOKBACK_DAYS = 90


class ContractError(RuntimeError):
    """A Drive payload violated the ingest contract in SPEC §3."""


@dataclass(frozen=True)
class DriveFile:
    id: str
    name: str
    post_date: str  # YYYY-MM-DD, parsed from the filename


@dataclass(frozen=True)
class Post:
    slug: str
    date: str
    title: str
    summary: str

    @property
    def href(self) -> str:
        return f"posts/{self.slug}.html"

    def as_index_entry(self) -> dict[str, str]:
        return {
            "slug": self.slug,
            "date": self.date,
            "title": self.title,
            "summary": self.summary,
            "href": self.href,
        }


# --------------------------------------------------------------------------
# Drive I/O
# --------------------------------------------------------------------------

def drive_list_inbox(folder_id: str, api_key: str) -> list[DriveFile]:
    """List recent digest files in the public inbox folder, oldest first.

    Uses an API key rather than OAuth: the folder is shared "anyone with the
    link", which is the documented condition for unauthenticated files.list.

    Two bounds worth understanding:
      * LOOKBACK_DAYS keeps the listing small forever. Republishing is driven by
        target-path existence, so we only ever need files new enough to be
        unpublished. A 90-day window survives a pipeline outage of nearly a
        quarter; anything longer is a backfill, which you'd do by hand anyway.
      * The pagination loop matters even with that window. Drive caps page size,
        and a single un-paginated request silently truncates rather than erroring
        — the exact failure that looks like "the old posts just vanished".
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    query = f"'{folder_id}' in parents and trashed=false and modifiedTime > '{cutoff}'"

    found: list[DriveFile] = []
    page_token: str | None = None
    while True:
        params: dict[str, str] = {
            "q": query,
            "fields": "nextPageToken,files(id,name,mimeType,modifiedTime)",
            "orderBy": "name",
            "pageSize": "100",
            "key": api_key,
        }
        if page_token:
            params["pageToken"] = page_token
        url = f"{DRIVE_FILES_URL}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))

        for entry in payload.get("files", []):
            if match := FILENAME_RE.match(entry["name"]):
                found.append(
                    DriveFile(id=entry["id"], name=entry["name"], post_date=match.group(1))
                )

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return sorted(found, key=lambda f: f.post_date)


def drive_download(file_id: str, api_key: str) -> str:
    """Fetch raw file bytes as UTF-8 text.

    Two paths, tried in order. `alt=media` with an API key is the clean one;
    the `uc?export=download` endpoint is the documented public-file fallback and
    needs no key at all. Keeping both means a key restriction change or a Drive
    API behaviour shift degrades instead of breaking.
    """
    candidates = [
        f"{DRIVE_FILES_URL}/{file_id}?alt=media&key={urllib.parse.quote(api_key)}",
        f"https://drive.google.com/uc?export=download&id={file_id}",
    ]
    last_error: Exception | None = None
    for url in candidates:
        try:
            with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_S) as resp:
                return resp.read().decode("utf-8")
        except Exception as exc:  # noqa: BLE001 — we genuinely want to try the next path
            last_error = exc
    raise RuntimeError(f"could not download Drive file {file_id}: {last_error}")


# --------------------------------------------------------------------------
# Pure: parse + render
# --------------------------------------------------------------------------

def _meta(soup: BeautifulSoup, name: str) -> str:
    tag = soup.find("meta", attrs={"name": name})
    return (tag.get("content") or "").strip() if tag else ""


def demote_body_h1(article) -> int:
    """Rewrite any <h1> inside the digest body to <h2>. Returns how many.

    The template already renders an <h1> from <title>, so an <h1> in the body
    puts two on one page — an outline defect for screen readers and for how
    search engines pick a headline.

    This is repaired rather than rejected, which is a deliberate exception to
    the fail-loud rule everywhere else in this file. The distinction that earns
    it: rejecting a missing hmw-summary is right because there is no correct
    value to substitute — inventing one would ship a guess to a live page. Here
    there is exactly one correct target level, the fix is lossless, and the
    upstream author is an LLM that will drift into `<h1>` intermittently forever.
    Killing a whole day's post over a heading level (and tripping the heartbeat
    alarm) costs more than it protects. The warning keeps the drift visible.
    """
    strays = article.find_all("h1")
    for tag in strays:
        tag.name = "h2"
    return len(strays)


def parse_digest(raw_html: str, expected_date: str) -> tuple[str, str, str]:
    """Validate a raw digest and return (title, summary, body_inner_html).

    Raises ContractError listing *every* problem found, not just the first — one
    failed run should tell you everything that needs fixing.
    """
    soup = BeautifulSoup(raw_html, "html.parser")

    title_el = soup.find("title")
    title = title_el.get_text(strip=True) if title_el else ""
    meta_date = _meta(soup, "hmw-date")
    summary = _meta(soup, "hmw-summary")
    article = soup.find("article", class_="hmw-digest") or soup.find("body")

    problems: list[str] = []
    if not title:
        problems.append("missing or empty <title>")
    if not summary:
        problems.append("missing meta[name=hmw-summary]")
    if meta_date != expected_date:
        problems.append(f"hmw-date {meta_date!r} does not match filename date {expected_date!r}")
    if article is None:
        problems.append("no <article class='hmw-digest'> and no <body>")
    elif len(article.get_text(strip=True)) < MIN_BODY_CHARS:
        problems.append(
            f"body is {len(article.get_text(strip=True))} chars, "
            f"under the {MIN_BODY_CHARS} minimum — looks truncated"
        )
    if problems:
        raise ContractError("; ".join(problems))

    assert article is not None  # narrowed by the checks above
    if demoted := demote_body_h1(article):
        # Side channel only — the return value stays a pure function of the input.
        print(f"::warning::demoted {demoted} stray <h1> in the digest body to <h2>")
    return title, summary, article.decode_contents()


def render_post(template: str, *, title: str, summary: str, date: str, body_html: str) -> str:
    """Wrap a validated digest body in site chrome.

    Note the escaping split: title/summary are attacker-adjacent plain text and get
    escaped; body_html is HTML we validated structurally and pass through. If the
    upstream task ever accepts third-party input, sanitize body_html here.
    """
    # Built by hand rather than with strftime("%B %-d, %Y"): the %-d no-pad flag
    # is glibc-only and raises on Windows, where you run babel locally.
    parsed = datetime.strptime(date, "%Y-%m-%d")
    pretty_date = f"{parsed:%B} {parsed.day}, {parsed.year}"
    substitutions = {
        "{{TITLE}}": html.escape(title),
        "{{SUMMARY}}": html.escape(summary),
        "{{DATE_ISO}}": date,
        "{{DATE_HUMAN}}": pretty_date,
        "{{BODY}}": body_html,
    }
    out = template
    for token, value in substitutions.items():
        out = out.replace(token, value)
    return out


# --------------------------------------------------------------------------
# Index
# --------------------------------------------------------------------------

def rebuild_index() -> list[Post]:
    """Rebuild posts.json by re-reading blog/posts/ — disk is the source of truth."""
    posts: list[Post] = []
    for path in sorted(POSTS_DIR.glob("*.html")):
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
        title_el = soup.find("title")
        posts.append(
            Post(
                slug=path.stem,
                date=_meta(soup, "hmw-date") or path.stem[:10],
                title=title_el.get_text(strip=True) if title_el else path.stem,
                summary=_meta(soup, "hmw-summary"),
            )
        )
    posts.sort(key=lambda p: p.date, reverse=True)
    entries = [p.as_index_entry() for p in posts]

    # Only rewrite when the post list actually changed. The `generated` timestamp
    # differs on every run, so an unconditional write would dirty the working tree
    # every time and produce an empty daily commit.
    if POSTS_INDEX.exists():
        try:
            if json.loads(POSTS_INDEX.read_text(encoding="utf-8")).get("posts") == entries:
                return posts
        except json.JSONDecodeError:
            pass  # corrupt index — fall through and rewrite it

    POSTS_INDEX.write_text(
        json.dumps(
            {
                "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "posts": entries,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return posts


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def emit_output(key: str, value: str) -> None:
    """Write a GitHub Actions step output (no-op when run locally)."""
    if out_file := os.environ.get("GITHUB_OUTPUT"):
        with open(out_file, "a", encoding="utf-8") as fh:
            fh.write(f"{key}={value}\n")


def main() -> int:
    api_key = os.environ.get("GDRIVE_API_KEY", "")
    folder_id = os.environ.get("GDRIVE_FOLDER_ID", "")
    if not api_key or not folder_id:
        print("::error::GDRIVE_API_KEY and GDRIVE_FOLDER_ID must both be set", file=sys.stderr)
        return 2

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    template = POST_TEMPLATE.read_text(encoding="utf-8")

    inbox = drive_list_inbox(folder_id, api_key)
    print(f"drive inbox: {len(inbox)} digest file(s)")

    published: list[str] = []
    failures: list[str] = []

    for item in inbox:
        slug = f"{item.post_date}-{SLUG_SUFFIX}"
        target = POSTS_DIR / f"{slug}.html"
        if target.exists():
            print(f"  skip  {item.name} — already published")
            continue
        try:
            title, summary, body = parse_digest(drive_download(item.id, api_key), item.post_date)
        except ContractError as exc:
            failures.append(f"{item.name}: {exc}")
            print(f"::error::{item.name} violates the ingest contract — {exc}")
            continue
        target.write_text(
            render_post(template, title=title, summary=summary, date=item.post_date, body_html=body),
            encoding="utf-8",
        )
        published.append(slug)
        print(f"  write {target.relative_to(REPO_ROOT)}")

    rebuild_index()

    emit_output("published", str(len(published)))
    emit_output(
        "summary",
        f"publish {len(published)} digest(s): {', '.join(published)}" if published else "no new digests",
    )

    # Contract violations fail the run even if other files published, so a bad
    # digest is never silently dropped. Anything already written still commits.
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

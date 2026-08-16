"""Contract tests for the digest ingest boundary.

These exist so the parser can be changed later without re-deploying to find out
it broke. Run: python -m pytest scripts/

Everything here is a pure function over strings except the rebuild_index tests,
which redirect the module's path constants at a tmp_path — no network, no repo
writes, no HTTP mocking.
"""

import json

import pytest

import ingest_digest
from ingest_digest import ContractError, Post, parse_digest, rebuild_index, render_post

GOOD = """<!doctype html><html><head>
<title>Hill Money Watch — August 11, 2026</title>
<meta name="hmw-date" content="2026-08-11">
<meta name="hmw-summary" content="A summary.">
</head><body><article class="hmw-digest"><p>{}</p></article></body></html>""".format("x " * 400)


# --------------------------------------------------------------------------
# parse_digest — the contract in SPEC §3
# --------------------------------------------------------------------------

def test_accepts_a_well_formed_digest():
    title, summary, body = parse_digest(GOOD, "2026-08-11")
    assert title == "Hill Money Watch — August 11, 2026"
    assert summary == "A summary."
    assert "<p>" in body


def test_rejects_date_mismatch():
    with pytest.raises(ContractError, match="does not match filename date"):
        parse_digest(GOOD, "2026-08-12")


def test_rejects_truncated_body():
    short = GOOD.replace("x " * 400, "oops")
    with pytest.raises(ContractError, match="under the 400 minimum"):
        parse_digest(short, "2026-08-11")


def test_reports_every_problem_at_once():
    with pytest.raises(ContractError) as err:
        parse_digest("<html><head></head><body></body></html>", "2026-08-11")
    assert err.value.args[0].count(";") >= 2


def test_decodes_entities_in_title_and_summary():
    """The task may emit &amp;/&mdash;; downstream must see the character, not the entity."""
    raw = GOOD.replace("A summary.", "Pelosi &amp; Green").replace(
        "August 11, 2026", "August 11, 2026 &mdash; Q3"
    )
    title, summary, _ = parse_digest(raw, "2026-08-11")
    assert summary == "Pelosi & Green"
    assert "—" in title and "&mdash;" not in title


def test_demotes_a_stray_h1_in_the_body():
    """The template renders <h1> from <title>; a body <h1> would make two."""
    raw = GOOD.replace("<p>", "<h1>Headline</h1><p>", 1)
    _, _, body = parse_digest(raw, "2026-08-11")
    assert "<h1>" not in body
    assert "<h2>Headline</h2>" in body


def test_leaves_a_compliant_body_untouched():
    raw = GOOD.replace("<p>", "<h2>Section</h2><p>", 1)
    _, _, body = parse_digest(raw, "2026-08-11")
    assert "<h2>Section</h2>" in body and "<h1>" not in body


def test_preserves_markup_inside_the_body():
    raw = GOOD.replace("<p>", '<h2>Trades</h2><table><tr><td><a href="https://x">src</a>', 1)
    _, _, body = parse_digest(raw, "2026-08-11")
    assert "<h2>Trades</h2>" in body and '<a href="https://x">' in body


# --------------------------------------------------------------------------
# render_post — chrome + escaping
# --------------------------------------------------------------------------

def test_render_escapes_title_but_not_body():
    out = render_post(
        "{{TITLE}}|{{BODY}}|{{DATE_HUMAN}}",
        title="A & B",
        summary="s",
        date="2026-08-11",
        body_html="<p>kept</p>",
    )
    assert "A &amp; B" in out and "<p>kept</p>" in out and "August 11, 2026" in out


def test_render_single_digit_date_is_unpadded_and_portable():
    """strftime('%-d') is glibc-only and raises on Windows. Must not regress to it."""
    out = render_post("{{DATE_HUMAN}}", title="t", summary="s", date="2026-09-05", body_html="")
    assert out == "September 5, 2026"


def test_render_escapes_quotes_so_meta_attributes_survive():
    out = render_post(
        '<meta content="{{SUMMARY}}">', title="t", summary='He said "buy"', date="2026-08-11", body_html=""
    )
    assert out == '<meta content="He said &quot;buy&quot;">'


# --------------------------------------------------------------------------
# rebuild_index — disk is the source of truth
# --------------------------------------------------------------------------

@pytest.fixture
def blog(tmp_path, monkeypatch):
    """Redirect the module's path constants at a throwaway blog/ tree."""
    posts_dir = tmp_path / "posts"
    posts_dir.mkdir()
    monkeypatch.setattr(ingest_digest, "POSTS_DIR", posts_dir)
    monkeypatch.setattr(ingest_digest, "POSTS_INDEX", tmp_path / "posts.json")
    return tmp_path


def _write_post(blog, date, title="T", summary="S"):
    (blog / "posts" / f"{date}-hill-money-watch.html").write_text(
        f'<html><head><title>{title}</title>'
        f'<meta name="hmw-date" content="{date}">'
        f'<meta name="hmw-summary" content="{summary}"></head><body>b</body></html>',
        encoding="utf-8",
    )


def test_index_round_trips_a_rendered_post(blog):
    """render → write → reparse must recover the exact title and summary."""
    template = (
        "<html><head><title>{{TITLE}}</title>"
        '<meta name="hmw-date" content="{{DATE_ISO}}">'
        '<meta name="hmw-summary" content="{{SUMMARY}}"></head>'
        "<body>{{BODY}}</body></html>"
    )
    rendered = render_post(
        template,
        title="Hill Money Watch — August 11, 2026",
        summary='Tuberville & co. said "buy".',
        date="2026-08-11",
        body_html="<p>body</p>",
    )
    (blog / "posts" / "2026-08-11-hill-money-watch.html").write_text(rendered, encoding="utf-8")

    posts = rebuild_index()
    assert posts == [
        Post(
            slug="2026-08-11-hill-money-watch",
            date="2026-08-11",
            title="Hill Money Watch — August 11, 2026",
            summary='Tuberville & co. said "buy".',
        )
    ]
    written = json.loads((blog / "posts.json").read_text(encoding="utf-8"))
    assert written["posts"][0]["href"] == "posts/2026-08-11-hill-money-watch.html"
    assert "generated" in written


def test_index_is_newest_first(blog):
    for d in ("2026-08-10", "2026-08-12", "2026-08-11"):
        _write_post(blog, d)
    assert [p.date for p in rebuild_index()] == ["2026-08-12", "2026-08-11", "2026-08-10"]


def test_index_rewrite_is_a_no_op_when_nothing_changed(blog):
    """The `generated` stamp must not dirty the tree on an unchanged run."""
    _write_post(blog, "2026-08-11")
    rebuild_index()
    first = (blog / "posts.json").read_text(encoding="utf-8")
    rebuild_index()
    assert (blog / "posts.json").read_text(encoding="utf-8") == first


def test_index_self_heals_after_a_post_is_deleted(blog):
    _write_post(blog, "2026-08-11")
    _write_post(blog, "2026-08-12")
    rebuild_index()
    (blog / "posts" / "2026-08-12-hill-money-watch.html").unlink()
    assert [p.date for p in rebuild_index()] == ["2026-08-11"]


def test_index_rewrites_a_corrupt_json_file(blog):
    _write_post(blog, "2026-08-11")
    (blog / "posts.json").write_text("{not json", encoding="utf-8")
    rebuild_index()
    assert json.loads((blog / "posts.json").read_text(encoding="utf-8"))["posts"]

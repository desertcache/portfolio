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
from ingest_digest import (
    ContractError,
    Post,
    local_inbox,
    main,
    parse_digest,
    edition_title,
    rebuild_index,
    render_archive,
    render_feed,
    render_post,
    write_archive,
    write_feed,
)

GOOD = """<!doctype html><html><head>
<title>Hill Money Watch: August 11, 2026</title>
<meta name="hmw-date" content="2026-08-11">
<meta name="hmw-summary" content="A summary.">
</head><body><article class="hmw-digest"><p>{}</p></article></body></html>""".format("x " * 400)


# --------------------------------------------------------------------------
# parse_digest — the contract in SPEC §3
# --------------------------------------------------------------------------

def test_accepts_a_well_formed_digest():
    title, summary, body = parse_digest(GOOD, "2026-08-11")
    assert title == "Hill Money Watch: August 11, 2026"
    assert summary == "A summary."
    assert "<p>" in body


def test_rejects_em_dashes_anywhere_a_reader_sees():
    """Sam's standing style rule: no em dash in anything published under his name.
    The title feeds the homepage card and the archive, the summary the archive rows."""
    raw = (
        GOOD.replace("Hill Money Watch: August 11, 2026", "Hill Money Watch — August 11, 2026")
        .replace("A summary.", "Quiet day &mdash; nothing new.")
        .replace("<p>", "<p>Pelosi bought — again. ", 1)
    )
    with pytest.raises(ContractError, match=r"3 em dashes"):
        parse_digest(raw, "2026-08-11")


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
    """The task may emit &amp;/&ndash;; downstream must see the character, not the entity."""
    raw = GOOD.replace("A summary.", "Pelosi &amp; Green").replace(
        "August 11, 2026", "August 11, 2026 &ndash; Q3"
    )
    title, summary, _ = parse_digest(raw, "2026-08-11")
    assert summary == "Pelosi & Green"
    assert "–" in title and "&ndash;" not in title


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


def test_rejects_a_style_block_stranded_outside_the_article():
    """Head styles are dropped at publish; the post then renders almost-right and ships."""
    raw = GOOD.replace("<head>", "<head><style>.pill-buy{color:green}</style>", 1)
    with pytest.raises(ContractError, match="outside <article"):
        parse_digest(raw, "2026-08-11")


def test_accepts_a_style_block_inside_the_article():
    """Styles inside the article survive publish, which is where they belong."""
    raw = GOOD.replace('<article class="hmw-digest">', '<article class="hmw-digest"><style>.pill-buy{color:green}</style>', 1)
    _, _, body = parse_digest(raw, "2026-08-11")
    assert ".pill-buy{color:green}" in body


def test_counts_every_stranded_style_block():
    raw = GOOD.replace("<head>", "<head><style>a{}</style><style>b{}</style>", 1)
    with pytest.raises(ContractError, match="2 <style> block"):
        parse_digest(raw, "2026-08-11")


def test_a_digest_with_no_styles_at_all_is_fine():
    parse_digest(GOOD, "2026-08-11")  # must not raise


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

ARCHIVE_SHELL = (
    "<main>\n    <header>Hill Money Watch</header>\n\n"
    "    <!-- archive:start -->\n    <p>Loading</p>\n    <!-- archive:end -->\n\n"
    "    <section>Research</section>\n</main>\n"
)


@pytest.fixture
def blog(tmp_path, monkeypatch):
    """Redirect the module's path constants at a throwaway blog/ tree."""
    posts_dir = tmp_path / "posts"
    posts_dir.mkdir()
    monkeypatch.setattr(ingest_digest, "POSTS_DIR", posts_dir)
    monkeypatch.setattr(ingest_digest, "POSTS_INDEX", tmp_path / "posts.json")
    archive = tmp_path / "index.html"
    archive.write_text(ARCHIVE_SHELL, encoding="utf-8")
    monkeypatch.setattr(ingest_digest, "ARCHIVE_PAGE", archive)
    monkeypatch.setattr(ingest_digest, "FEED_PATH", tmp_path / "feed.xml")
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


# --------------------------------------------------------------------------
# local_inbox — filename is the date, with an escape hatch
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# render_archive / write_archive — the archive arrives finished
# --------------------------------------------------------------------------

def _posts(*dates):
    return [Post(slug=f"{d}-hill-money-watch", date=d, title=f"Hill Money Watch: {d}", summary=f"About {d}.") for d in dates]


def test_archive_puts_the_newest_edition_in_the_card_and_numbers_the_rest_down():
    out = render_archive(_posts("2026-10-12", "2026-10-03", "2026-09-23"))
    assert out.startswith("<!-- archive:start -->") and out.endswith("<!-- archive:end -->")
    card, rest = out.split('id="earlier"')
    assert 'href="posts/2026-10-12-hill-money-watch.html"' in card
    assert '<span class="latest-no">No. 3</span>' in card
    assert '<h2 class="latest-title" id="latest-title">2026-10-12</h2>' in card, "the series name is dropped"
    assert rest.index('id="edition-2"') < rest.index('id="edition-1"'), "earlier editions count down"
    assert " hidden" not in rest.split(">")[0]


def test_archive_titles_drop_the_series_name_either_way_it_was_written():
    assert edition_title("Hill Money Watch: October 12, 2026") == "October 12, 2026"
    assert edition_title("Hill Money Watch \u2014 August 15, 2026") == "August 15, 2026"
    assert edition_title("A one-off title") == "A one-off title"
    assert edition_title("Hill Money Watch: ") == "Hill Money Watch: "


def test_archive_escapes_everything_the_digest_wrote():
    """Titles and summaries are upstream-authored: they must not be able to inject markup."""
    post = Post(slug="2026-10-12-hill-money-watch", date="2026-10-12",
                title='Hill Money Watch: <img src=x onerror=alert(1)>', summary='"Quoted" & <b>bold</b>')
    out = render_archive([post])
    assert "<img" not in out and "<b>" not in out
    assert "&lt;img src=x onerror=alert(1)&gt;" in out
    assert "&quot;Quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;" in out


def test_archive_with_one_edition_hides_the_empty_earlier_list():
    out = render_archive(_posts("2026-10-12"))
    assert 'id="earlier" aria-labelledby="earlier-title" hidden>' in out
    assert "archive-row" not in out


def test_archive_with_no_editions_says_so():
    assert "No editions published yet." in render_archive([])


def test_write_archive_replaces_marker_to_marker_and_keeps_the_rest(blog):
    page = blog / "index.html"
    assert write_archive(_posts("2026-10-12", "2026-10-03")) is True
    text = page.read_text(encoding="utf-8")
    assert "Loading" not in text
    assert text.startswith("<main>\n    <header>Hill Money Watch</header>")
    assert text.endswith("    <section>Research</section>\n</main>\n")
    assert text.count("<!-- archive:start -->") == 1 and text.count("<!-- archive:end -->") == 1
    assert write_archive(_posts("2026-10-12", "2026-10-03")) is False, "a second run changes nothing"


def test_write_archive_refuses_a_page_that_lost_its_markers(blog):
    (blog / "index.html").write_text("<main></main>", encoding="utf-8")
    with pytest.raises(RuntimeError, match="markers"):
        write_archive(_posts("2026-10-12"))


def test_publishing_renders_the_new_edition_into_the_archive(publishable, tmp_path):
    assert main(["--file", str(_digest_file(tmp_path))]) == 0
    archive = (publishable / "index.html").read_text(encoding="utf-8")
    assert 'href="posts/2026-08-17-hill-money-watch.html"' in archive
    assert '<h2 class="latest-title" id="latest-title">August 11, 2026</h2>' in archive, "the digest's own title"


# --------------------------------------------------------------------------
# Atom feed
# --------------------------------------------------------------------------

ATOM = "{http://www.w3.org/2005/Atom}"


def test_feed_is_valid_atom_with_one_entry_per_edition_newest_first():
    import xml.etree.ElementTree as ET
    root = ET.fromstring(render_feed(_posts("2026-10-12", "2026-10-03")))
    assert root.tag == f"{ATOM}feed"
    assert root.findtext(f"{ATOM}updated") == "2026-10-12T00:00:00Z", "the feed is as new as its newest edition"
    for required in ("id", "title", "author"):
        assert root.find(f"{ATOM}{required}") is not None, required
    entries = root.findall(f"{ATOM}entry")
    assert [e.findtext(f"{ATOM}published") for e in entries] == ["2026-10-12T00:00:00Z", "2026-10-03T00:00:00Z"]
    first = entries[0]
    url = "https://desertcache.github.io/portfolio/blog/posts/2026-10-12-hill-money-watch.html"
    assert first.find(f"{ATOM}link").get("href") == url, "links are absolute: a feed reader has no page to resolve them against"
    assert first.findtext(f"{ATOM}id") == url
    assert first.findtext(f"{ATOM}title") == "Hill Money Watch: 2026-10-12"
    assert first.findtext(f"{ATOM}summary") == "About 2026-10-12."


def test_feed_escapes_what_the_digest_wrote_and_drops_what_xml_cannot_hold():
    import xml.etree.ElementTree as ET
    post = Post(slug="2026-10-12-hill-money-watch", date="2026-10-12",
                title="Hill Money Watch: <b>bold</b>", summary='"Quoted" & <script>x</script>\x0b')
    root = ET.fromstring(render_feed([post]))  # raises if the escaping left it malformed
    entry = root.find(f"{ATOM}entry")
    assert entry.findtext(f"{ATOM}title") == "Hill Money Watch: <b>bold</b>", "markup arrives as text, not tags"
    assert entry.findtext(f"{ATOM}summary") == '"Quoted" & <script>x</script>'


def test_feed_with_no_editions_is_still_a_valid_feed():
    import xml.etree.ElementTree as ET
    root = ET.fromstring(render_feed([]))
    assert root.findall(f"{ATOM}entry") == []
    assert root.findtext(f"{ATOM}updated"), "Atom requires <updated> even on an empty feed"


def test_write_feed_rewrites_only_when_the_editions_change(blog):
    assert write_feed(_posts("2026-10-03")) is True
    assert write_feed(_posts("2026-10-03")) is False, "a run with nothing new leaves the file alone"
    assert write_feed(_posts("2026-10-12", "2026-10-03")) is True
    assert "2026-10-12-hill-money-watch.html" in (blog / "feed.xml").read_text(encoding="utf-8")


def test_publishing_adds_the_new_edition_to_the_feed(publishable, tmp_path):
    assert main(["--file", str(_digest_file(tmp_path))]) == 0
    feed = (publishable / "feed.xml").read_text(encoding="utf-8")
    assert "<title>Hill Money Watch: August 11, 2026</title>" in feed
    assert "posts/2026-08-17-hill-money-watch.html" in feed


def test_local_inbox_reads_the_date_out_of_the_filename(tmp_path):
    path = tmp_path / "hill-money-watch-2026-08-17.html"
    path.write_text(GOOD, encoding="utf-8")
    (pending,) = local_inbox([path], None)
    assert pending.post_date == "2026-08-17"
    assert pending.read() == GOOD


def test_local_inbox_rejects_an_undated_filename_and_names_the_fix(tmp_path):
    """A browser download renamed to 'digest.html' must fail loudly, not guess a date."""
    path = tmp_path / "digest.html"
    path.write_text(GOOD, encoding="utf-8")
    with pytest.raises(ContractError, match="--date"):
        local_inbox([path], None)


def test_local_inbox_date_override_rescues_a_renamed_download(tmp_path):
    """Chrome appends ' (1)' on a re-download; --date makes that file publishable."""
    path = tmp_path / "hill-money-watch-2026-08-17 (1).html"
    path.write_text(GOOD, encoding="utf-8")
    (pending,) = local_inbox([path], "2026-08-17")
    assert pending.post_date == "2026-08-17"


def test_local_inbox_rejects_a_missing_file(tmp_path):
    with pytest.raises(ContractError, match="does not exist"):
        local_inbox([tmp_path / "hill-money-watch-2026-08-17.html"], None)


def test_local_inbox_rejects_a_malformed_date_override(tmp_path):
    path = tmp_path / "digest.html"
    path.write_text(GOOD, encoding="utf-8")
    with pytest.raises(ContractError, match="YYYY-MM-DD"):
        local_inbox([path], "08/17/2026")


# --------------------------------------------------------------------------
# main --file — the hand-publish path
# --------------------------------------------------------------------------

@pytest.fixture
def publishable(blog, monkeypatch, tmp_path):
    """A redirected blog/ plus a real template, so main(--file) can round-trip."""
    template = tmp_path / "_post.template.html"
    template.write_text(
        "<html><head><title>{{TITLE}}</title>"
        '<meta name="hmw-date" content="{{DATE_ISO}}">'
        '<meta name="hmw-summary" content="{{SUMMARY}}"></head>'
        "<body><h1>{{TITLE}}</h1><time>{{DATE_HUMAN}}</time>{{BODY}}</body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(ingest_digest, "POST_TEMPLATE", template)
    return blog


def _digest_file(tmp_path, date="2026-08-17", body=None):
    path = tmp_path / f"hill-money-watch-{date}.html"
    path.write_text(body if body is not None else GOOD.replace("2026-08-11", date), encoding="utf-8")
    return path


def test_file_mode_publishes_and_indexes(publishable, tmp_path, capsys):
    src = _digest_file(tmp_path)
    assert main(["--file", str(src)]) == 0

    written = publishable / "posts" / "2026-08-17-hill-money-watch.html"
    assert written.exists()
    assert "<p>x x" in written.read_text(encoding="utf-8")
    index = json.loads((publishable / "posts.json").read_text(encoding="utf-8"))
    assert index["posts"][0]["slug"] == "2026-08-17-hill-money-watch"
    assert "publish" in capsys.readouterr().out


def test_file_mode_needs_no_drive_credentials(publishable, tmp_path, monkeypatch):
    """The whole point: a local publish must not touch Drive env vars."""
    monkeypatch.delenv("GDRIVE_API_KEY", raising=False)
    monkeypatch.delenv("GDRIVE_FOLDER_ID", raising=False)
    assert main(["--file", str(_digest_file(tmp_path))]) == 0


def test_file_mode_is_idempotent(publishable, tmp_path):
    src = _digest_file(tmp_path)
    main(["--file", str(src)])
    target = publishable / "posts" / "2026-08-17-hill-money-watch.html"
    target.write_text("EDITED BY HAND", encoding="utf-8")

    assert main(["--file", str(src)]) == 0
    assert target.read_text(encoding="utf-8") == "EDITED BY HAND"


def test_force_republishes_over_an_existing_post(publishable, tmp_path):
    """Regenerating a corrected digest must be able to overwrite yesterday's."""
    src = _digest_file(tmp_path)
    main(["--file", str(src)])
    target = publishable / "posts" / "2026-08-17-hill-money-watch.html"
    target.write_text("STALE", encoding="utf-8")

    assert main(["--file", str(src), "--force"]) == 0
    assert "STALE" not in target.read_text(encoding="utf-8")


def test_file_mode_fails_on_a_contract_violation_without_writing(publishable, tmp_path):
    bad = _digest_file(tmp_path, body=GOOD.replace('name="hmw-summary"', 'name="nope"'))
    assert main(["--file", str(bad)]) == 1
    assert not (publishable / "posts" / "2026-08-17-hill-money-watch.html").exists()


def test_check_validates_without_writing(publishable, tmp_path, capsys):
    src = _digest_file(tmp_path)
    assert main(["--file", str(src), "--check"]) == 0
    assert not (publishable / "posts" / "2026-08-17-hill-money-watch.html").exists()
    assert not (publishable / "posts.json").exists()
    assert "ok" in capsys.readouterr().out.lower()


def test_check_reports_a_violation_without_writing(publishable, tmp_path):
    bad = _digest_file(tmp_path, body=GOOD.replace('name="hmw-summary"', 'name="nope"'))
    assert main(["--file", str(bad), "--check"]) == 1
    assert not (publishable / "posts" / "2026-08-17-hill-money-watch.html").exists()


def test_publishes_several_files_in_one_run(publishable, tmp_path):
    a = _digest_file(tmp_path, "2026-08-17")
    b = _digest_file(tmp_path, "2026-08-18")
    assert main(["--file", str(a), "--file", str(b)]) == 0
    index = json.loads((publishable / "posts.json").read_text(encoding="utf-8"))
    assert [p["date"] for p in index["posts"]] == ["2026-08-18", "2026-08-17"]


def test_a_bad_file_does_not_block_a_good_one(publishable, tmp_path):
    """One malformed digest must not cost the other its publication."""
    good = _digest_file(tmp_path, "2026-08-17")
    bad = _digest_file(tmp_path, "2026-08-18", body=GOOD.replace('name="hmw-summary"', 'name="nope"'))
    assert main(["--file", str(good), "--file", str(bad)]) == 1
    assert (publishable / "posts" / "2026-08-17-hill-money-watch.html").exists()
    assert not (publishable / "posts" / "2026-08-18-hill-money-watch.html").exists()


def test_date_override_refuses_more_than_one_file(tmp_path):
    """One date across two digests would collapse them onto a single slug."""
    a = _digest_file(tmp_path, "2026-08-17")
    b = _digest_file(tmp_path, "2026-08-18")
    with pytest.raises(ContractError, match="single --file"):
        local_inbox([a, b], "2026-08-17")


def test_date_without_a_file_is_rejected(publishable):
    """--date is meaningless against the Drive inbox; say so instead of ignoring it."""
    assert main(["--date", "2026-08-17"]) == 2


# --------------------------------------------------------------------------
# Console encoding — a real crash a capsys test alone could not have caught
# --------------------------------------------------------------------------

class _Cp1252Stdout:
    encoding = "cp1252"


def test_console_folds_what_a_cp1252_terminal_cannot_encode(monkeypatch):
    """Windows consoles default to cp1252; an arrow in a title used to kill the run."""
    monkeypatch.setattr(ingest_digest.sys, "stdout", _Cp1252Stdout())
    assert ingest_digest._console("Pelosi -> INTC") == "Pelosi -> INTC"
    assert ingest_digest._console("Pelosi → INTC") == "Pelosi ? INTC"
    # An em dash IS representable in cp1252, so a real digest title survives intact.
    assert ingest_digest._console("Hill Money Watch — Aug 17") == "Hill Money Watch — Aug 17"


def test_our_own_console_literals_stay_cp1252_safe(publishable, tmp_path, capsys):
    """Every print in this module must survive a cp1252 console. Covers all four paths."""
    src = _digest_file(tmp_path)
    main(["--file", str(src), "--check"])  # ok line
    main(["--file", str(src)])  # write + summary line
    main(["--file", str(src)])  # skip line
    bad = _digest_file(tmp_path, "2026-08-18", body=GOOD.replace('name="hmw-summary"', 'name="x"'))
    main(["--file", str(bad)])  # contract-violation line
    capsys.readouterr().out.encode("cp1252")  # raises if a literal regresses


def test_drive_mode_still_guards_on_missing_credentials(monkeypatch):
    """No --file means the old Drive path, which must keep failing closed."""
    monkeypatch.delenv("GDRIVE_API_KEY", raising=False)
    monkeypatch.delenv("GDRIVE_FOLDER_ID", raising=False)
    assert main([]) == 2

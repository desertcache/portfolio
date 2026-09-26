"""Render the scoreboard table on blog/research/delivery-ipo-ledger.html.

The table is plain HTML so every number reads without JavaScript; the page's
script only highlights the selected row. It is written between the
`scoreboard:start` / `scoreboard:end` comments, so re-running is safe. After
refreshing blog/research/delivery-ipo-ledger.json:

    py scripts/ledger_scoreboard.py
"""
from __future__ import annotations

import datetime as dt
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "blog" / "research" / "delivery-ipo-ledger.html"
DATA = ROOT / "blog" / "research" / "delivery-ipo-ledger.json"
START = "<!-- scoreboard:start"
END = "<!-- scoreboard:end -->"
MINUS = "−"
DOT = "·"
INDENT = " " * 8

HEAD = (
    "<thead><tr>"
    '<th scope="col">Company</th>'
    '<th scope="col">Went public</th>'
    '<th scope="col" class="num">IPO price</th>'
    '<th scope="col" class="num">Day-one close</th>'
    '<th scope="col" class="num">Peak close</th>'
    '<th scope="col" class="num">Last or final close</th>'
    '<th scope="col" class="num">vs IPO price</th>'
    '<th scope="col" class="num">Worst drawdown</th>'
    '<th scope="col">Status</th>'
    "</tr></thead>"
)


def fmt_date(iso: str) -> str:
    d = dt.date.fromisoformat(iso)
    return f"{d:%b} {d.day}, {d.year}"


def fmt_price(s: dict, v: float) -> str:
    """Same rules as fmtPrice in delivery-ipo-ledger.js."""
    n = f"{v:,.2f}" if v >= 1 else f"{v:.3g}"
    return f"{n}p" if s["unit"] == "p" else f"{s['sym']}{n}"


def fmt_pct(r: float) -> str:
    """Same rules as fmtPct in delivery-ipo-ledger.js."""
    a = abs(r) * 100
    text = f"{a:.2f}" if 99.9 < a < 100 else f"{a:.0f}" if a >= 1000 else f"{a:.1f}"
    if float(text) == 0:
        return "0.0%"
    return ("+" if r >= 0 else MINUS) + text + "%"


def sub(text: str) -> str:
    return f'<span class="led-sub">{html.escape(text)}</span>'


def row(s: dict) -> str:
    st = s["stats"]
    e = html.escape
    day_one = fmt_pct(st["firstClose"] / s["ipoPrice"] - 1)
    if st["first"] != s["ipoDate"]:
        day_one += f" {DOT} {fmt_date(st['first'])}"
    cells = [
        f'<td><a href="#{e(s["id"])}">{e(s["name"])}</a>{sub(s["ticker"] + " " + DOT + " " + s["exchange"])}</td>',
        f'<td>{fmt_date(s["ipoDate"])}{sub("SPAC merger" if s["route"] == "SPAC" else "IPO")}</td>',
        f'<td class="num">{e(fmt_price(s, s["ipoPrice"]))}</td>',
        f'<td class="num">{e(fmt_price(s, st["firstClose"]))}{sub(day_one)}</td>',
        f'<td class="num">{e(fmt_price(s, st["hi"]))}{sub(fmt_date(st["hiDate"]))}</td>',
        f'<td class="num">{e(fmt_price(s, st["last"]))}{sub(fmt_date(st["lastDate"]))}</td>',
        f'<td class="num {"led-up" if st["ret"] >= 0 else "led-dn"}">{fmt_pct(st["ret"])}</td>',
        f'<td class="num">{fmt_pct(st["mdd"])}</td>',
        f'<td><span class="led-tag" data-status="{e(s["status"])}">{e(s["statusText"])}</span></td>',
    ]
    return f'{INDENT}  <tr data-id="{e(s["id"])}">' + "".join(cells) + "</tr>"


def render(data: list[dict]) -> str:
    rows = "\n".join(row(s) for s in sorted(data, key=lambda s: s["ipoDate"]))
    return (
        f'{INDENT}<table class="led-table">\n'
        f"{INDENT}  {HEAD}\n"
        f"{INDENT}  <tbody>\n{rows}\n{INDENT}  </tbody>\n"
        f"{INDENT}</table>\n"
    )


def main() -> int:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    page = PAGE.read_text(encoding="utf-8")
    start = page.index(START)
    body_from = page.index("\n", start) + 1
    end = page.index(END)
    body_to = page.rindex("\n", 0, end) + 1
    updated = page[:body_from] + render(data) + page[body_to:]
    if updated == page:
        print("scoreboard already current")
        return 0
    PAGE.write_text(updated, encoding="utf-8", newline="\n")
    print(f"scoreboard written: {len(data)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

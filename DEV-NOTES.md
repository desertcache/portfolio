# Dev notes — desertcache/portfolio

## The homepage has no build step (v5, 2026-09)

`index.html` is the content. It's plain, static HTML: every word, number, and
case study is in the file, so it paints before any script runs, works with
JavaScript off, and link previews and crawlers see the real page. React, the
Babel precompile, `app-v4.*`, `data-v4.js`, and `alive.js` are gone. The old
footgun ("edit the .jsx, forget to rebuild, your change silently doesn't
ship") no longer exists: edit, reload, commit.

The mental model is progressive enhancement, in three layers:

| Layer | Files | Job |
|---|---|---|
| Content | `index.html` | Everything a reader needs. Readable top to bottom with no CSS or JS. |
| Look | `css/site.css` | Tokens, layout, components, motion. One file, sectioned in page order. |
| Behaviour | `js/*.js` (ES modules) | Extras layered on top: the topo shader, reveals, count-ups, modal case studies, copy-email, the orb. |

`js/main.js` imports each feature and runs it inside its own try/catch, so
one failure (say, a GPU driver rejecting the shader) can't break the rest.

### Editing content

- **Text, numbers, links:** edit `index.html` directly.
- **A work card:** each project is an `<article class="card">` in `#work`
  plus a `<dialog class="cs" id="cs-ID">` right after the grid. The card's
  link (`href="#cs-ID" data-cs="ID"`) opens the dialog; the dialog's
  prev/next links point at its neighbours. Keep the ids in sync.
- **Count-up numbers:** add `data-count` to any element whose text is a
  single number (`94%`, `6,846`, `800+`). The HTML keeps the real value;
  the animation is decoration.
- **Reveal on scroll:** add `class="reveal"`. CSS only hides it when JS is
  running (`html.js`), and a 4-second safety net in `<head>` un-hides
  everything if `js/main.js` never arrives.

### Theme

The inline script in `<head>` picks light/dark before first paint (saved
`sb-theme`, else the OS setting). Colours are tokens in `:root` and
`:root[data-theme="dark"]` at the top of `css/site.css`; no component has its
own dark-mode rule. The Lab section is always dark: it re-points the same
tokens to the `--lab-*` values.

### The hero shader (`js/topo.js`)

A WebGL fragment shader draws contour lines over procedural terrain; the
cursor raises a hill. It caps the drawing buffer at ~2.2 megapixels, drops to
~30fps when idle, stops when the hero is off screen or the tab is hidden, and
draws one still frame under `prefers-reduced-motion`. No WebGL means no
canvas, just paper. Colours come from `--topo-*` tokens (hex only).

### Checks

```powershell
npm install        # once, in this directory
npm test           # unit tests for js/lib.js (Node's built-in runner)
npm run check      # type-checks js/ via JSDoc + TypeScript, no build output
```

Pure logic lives in `js/lib.js` precisely so it can be tested without a
browser. If a new helper doesn't touch the DOM, put it there and test it.

### Images

- `assets/headshot-600.*` and `headshot-96.*` are square crops of the
  original headshot (WebP with a JPEG fallback via `<picture>`).
- `assets/og.png` is the link-preview image. Its source is
  `scripts/og-card.html`, which renders the real shader with a pinned seed;
  the steps to regenerate are in that file's header comment.
- `favicon.svg` and `assets/apple-touch-icon.png` share the contour mark
  used in the nav.

### The blog is on the same system (2026-09-23)

`blog/index.html`, `blog/_post.template.html`, and every rendered post load
`css/site.css` plus `blog/blog.css`, and run `js/blog.js`. Same nav, footer,
theme toggle, tokens, and focus rings as the homepage; `styles-v4.css` is
gone.

| File | Job |
|---|---|
| `blog/blog.css` | Only what a long read adds: the reading column (`--measure`), the wide lane tables may grow into (`--wide`), the digest's classes, the archive. Sectioned like `site.css`. |
| `js/blog.js` | Entry point for every blog page: theme, frosted nav + read-progress, the archive list, links to the editions either side, reading time. Same one-try/catch-per-feature pattern as `js/main.js`. |
| `js/editions.js` | The pure helpers behind it (`validPosts`, `postNeighbors`, `editionTitle`, `readingMinutes`), tested in `tests/editions.test.mjs`. A separate file on purpose: a visitor can hold a cached `lib.js` from before these existed, and a missing named export stops a module from loading at all. `lib.js`'s `latestPost` reuses `validPosts`, so the homepage card and the archive can't disagree about which posts are valid. |

Things worth knowing before touching the blog:

- **Posts are rendered once, at publish.** Changing the template changes no
  existing post until each is republished: `py scripts/ingest_digest.py --file
  blog/hill-money-watch-DATE.html --force` (repeat `--file` for several). The
  digest drafts are gitignored; if one is missing, it can be rebuilt from the
  rendered post (the post's `.post-body` is the digest's `<article>`, and
  `<title>`/`meta[hmw-date]`/`meta[hmw-summary]` round-trip byte for byte).
- **`blog.css` owns the digest's look.** Digests still carry an inline
  `<style>` so a draft reads when opened by itself, but on the site the
  `.post-body …` rules win on specificity. Older digests' inline rules use v4
  token names (`--paper-2`, `--rule`, `--rule-2`); `blog.css` aliases those to
  v5 values so nothing falls through. The class vocabulary digests may use:
  `hmw-note`, `hmw-meta`, `hmw-lag`, `hmw-sources`, `hmw-table` (plus
  `hmw-trades` / `hmw-tape` / `hmw-status` to keep numeric columns on one
  line), and `pill` + `pill-buy` / `pill-sell` / `pill-roll` / `pill-none`.
- **Bump the `?v=` on the `blog.css` link** (template + `blog/index.html`)
  whenever a change needs HTML and CSS to agree, then republish the posts.
  GitHub Pages lets browsers cache for 10 minutes, and new markup against a
  stale stylesheet renders unstyled.
- **The archive list is rendered by JS** from `blog/posts.json`. With JS off
  (or if `js/blog.js` never arrives), a fallback line points at the homepage.

## skincare.html is precompiled too (2026-08-15)

The skincare protocol page is written in Tailwind utility classes, but it does
**not** load the Tailwind play CDN. `skincare.css` is a static 19KB sheet built
from `skincare.src.css` + `tailwind.skincare.config.js`. After editing any
**class** in `skincare.html`, or anything in `skincare.src.css`, rebuild:

```powershell
npm run build:skincare
# or npm run build  (same thing: skincare is the only build left)
```

Why not the CDN: `cdn.tailwindcss.com` ships ~400KB of JS that JIT-compiles on
every page load (visible flash of unstyled content), and it serves **no CORS
header**, so `integrity`/`crossorigin` can't be used — adding SRI there makes
the script fail to load outright. A static sheet costs a build step and removes
the third-party script entirely.

Two things about that build worth knowing before you touch it:

- The palette lives in CSS custom properties as **rgb channel triplets**
  (`--sk-ink: 24 22 19`), wired into the Tailwind config as
  `rgb(var(--sk-ink) / <alpha-value>)`. That form is what keeps opacity
  modifiers (`bg-paper/50`, `bg-ochre-light/40`, `bg-opacity-90`) generating
  correct CSS. Plain `var(--x)` would silently break all of them.
- Rules in `skincare.src.css` sit **outside** any layer directive on purpose.
  Tailwind content-scans layered CSS and can drop selectors that never appear
  in the HTML — and `[data-theme="dark"]` / `.theme-fade` only ever exist at
  runtime. (When grepping the built file: the minifier unquotes attribute
  selectors to `[data-theme=dark]` and collapses `::after` to `:after`.)

The page carries its own miniature theme toggle. Same `sb-theme` localStorage
key as every other page, so the light/dark choice follows you around the site.

## The blog does not update itself (2026-08-15, updated 2026-09-23)

There is **no automation**. Editions are written and published by the
`hill-money-watch` Claude Code skill, which writes a draft digest to
`blog/hill-money-watch-YYYY-MM-DD.html` and runs `scripts/ingest_digest.py
--file` on it; that renders the post into `blog/posts/` and rebuilds
`blog/posts.json`, which the homepage card and the archive read. A push to
`main` is the deploy.

The two GitHub Actions workflows built on the `hill-money-watch-blog` branch
(`ingest-digest.yml`, `digest-heartbeat.yml`) were deliberately left out of
the merge, and the Google Drive relay they served is retired. They still live
on that branch if a scheduled design is ever revived.

## Research pages live in `blog/research/` (2026-09-25)

Long-form research posts are standalone pages, not Hill Money Watch editions.
They sit in `blog/research/`, **outside `blog/posts/` and `posts.json` on
purpose**: `ingest_digest.py` rebuilds `posts.json` from `blog/posts/*.html`,
and everything that reads it (the archive's Latest-edition card, the edition
numbering, the homepage Dispatch card) assumes every entry is an edition. The
archive links research pages from a static "Research" list below the editions.

The first one is `delivery-ipo-ledger.html` (15 delivery IPOs, offer price to
latest close):

| File | Role |
|------|------|
| `blog/research/delivery-ipo-ledger.html` | The post. Same chrome as an edition (nav, theme, footer, read time via `js/blog.js`). Its `<main>` has no `data-index`, so `blog.js` skips the archive and edition-nav features. |
| `blog/research/delivery-ipo-ledger.css` | Page-only styles on the site tokens. Classes are `led-*` (layout) and `lx-*` (inside the SVG charts) so nothing collides with `site.css`. |
| `blog/research/delivery-ipo-ledger.js` | The charts. A plain `defer` script, deliberately outside `js/` so `tsc` never sees the D3 global. Draws only the parts a page has, which is how the OG card reuses it. |
| `blog/research/delivery-ipo-ledger.json` | Daily closes and per-company facts (~170 KB). |
| `blog/research/vendor/d3-7.9.0.min.js` | D3, vendored so the page loads no third-party script. Hash `sha384-CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i`, checked against both cdnjs and jsDelivr. |
| `scripts/ledger_scoreboard.py` | Writes the scoreboard table (plain HTML, readable without JS) between the `scoreboard:start/end` comments. Idempotent. |
| `scripts/og-delivery-ipo-ledger.html` | Source for `assets/og-delivery-ipo-ledger.png` (1200×630 link preview). |

To refresh the prices: rebuild the JSON (same fields), run
`py scripts/ledger_scoreboard.py`, re-shoot the OG card, and bump the `?v=` on
the page's CSS and JS links.

The second is `pdrn-and-spicules.html` (topical PDRN and spicules, 2026-09-25):
a static page with no script of its own. Its two figures are plain HTML/CSS in
`pdrn-and-spicules.css` (`rs-*` classes; positions are CSS custom properties,
log or linear, computed by hand and noted in the markup), so they reflow on a
phone. Every study is linked in its Sources section; the link preview is
`assets/og-pdrn-and-spicules.png` from `scripts/og-pdrn-and-spicules.html`.

## Other invariants

- All asset paths RELATIVE (no leading `/`) — site lives at /portfolio/ sub-path, no CNAME.
- `.nojekyll` must stay (serves `arcade/` module folder verbatim).
- `mockups/` is untracked on purpose — never `git add -A`.
- Play pages (arcade.html, starship.html) are self-contained (inline CSS) and use the
  hotter accent `#e34a2b`; the homepage accent stays `#b9442b`. skincare.html is the
  exception — it tracks the homepage accent and is the only page with a built CSS file.
- starship.html embeds https://desertcache.github.io/starship/ click-to-load only
  (a live Three.js iframe would burn GPU from page load otherwise).
- The homepage's section ids (`#work`, `#lab`, `#about`, `#contact`) are
  linked from the other pages' navs. Rename one and those links break.

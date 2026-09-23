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

### `styles-v4.css` now serves only the blog

`blog/index.html`, the post template, and every post still link
`../styles-v4.css`. The homepage no longer uses it. It still carries the old
homepage rules, which are dead weight for the blog but harmless; trimming it,
or moving the blog onto `css/site.css`, is a follow-up.

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

## The blog does not update itself (2026-08-15)

`blog/` ships with an empty `posts.json` and **no automation**. The two GitHub
Actions workflows built on the `hill-money-watch-blog` branch
(`ingest-digest.yml`, `digest-heartbeat.yml`) were deliberately left out of the
merge — both are weekday crons that can only fail until the Drive secrets and
the Cowork task exist, and the ingest transport is being reconsidered anyway.
They still live on that branch if the Drive-relay design is revived.

`scripts/ingest_digest.py` (+ its tests) IS merged and is transport-agnostic
enough to reuse — it's the parser and index builder, not the fetcher.

So: new posts land in `blog/posts/` by whatever means, and `posts.json` has to
be rebuilt for the homepage teaser and archive to see them. Nothing does that
on a schedule right now.

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

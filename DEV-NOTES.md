# Dev notes — desertcache/portfolio

## The homepage is precompiled (2026-07-13)

`index.html` loads **production** React UMD + `app-v4.js` (plain JS). It no longer
ships `@babel/standalone` or dev React (~3MB + in-browser transpile, gone).

**`app-v4.jsx` is still the source of truth.** `app-v4.js` is generated from it.
After ANY edit to `app-v4.jsx`, regenerate before committing:

```powershell
# one-time, IN THIS DIRECTORY (node_modules stays untracked):
#   npm install
npm run build:app     # == npx babel app-v4.jsx -o app-v4.js
```

(`babel.config.json` pins the CLASSIC runtime — React.createElement against the
UMD global. Without it Babel emits `import ... from "react/jsx-dev-runtime"` and
the page dies with "Cannot use import statement outside a module". Babel resolves
the preset relative to the config file, so the npm install must be in this
directory — a scratch dir elsewhere will throw ERR_MODULE_NOT_FOUND.)

If you forget, your edit silently won't ship (the page loads app-v4.js, not the jsx).

## skincare.html is precompiled too (2026-08-15)

The skincare protocol page is written in Tailwind utility classes, but it does
**not** load the Tailwind play CDN. `skincare.css` is a static 19KB sheet built
from `skincare.src.css` + `tailwind.skincare.config.js`. After editing any
**class** in `skincare.html`, or anything in `skincare.src.css`, rebuild:

```powershell
npm run build:skincare
# or npm run build  — does app + skincare together
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

The page carries its own miniature theme toggle rather than loading `alive.js`,
which gates its boot on `.receipt` from the homepage. Same `sb-theme`
localStorage key, so the light/dark choice follows you between pages.

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
- `alive.js` (theme toggle, ember, stars, transit, count-up, warp key) is
  plain JS — edit and ship directly, NO precompile step. Only app-v4.jsx
  needs babel.

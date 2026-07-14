# Dev notes — desertcache/portfolio

## The homepage is precompiled (2026-07-13)

`index.html` loads **production** React UMD + `app-v4.js` (plain JS). It no longer
ships `@babel/standalone` or dev React (~3MB + in-browser transpile, gone).

**`app-v4.jsx` is still the source of truth.** `app-v4.js` is generated from it.
After ANY edit to `app-v4.jsx`, regenerate before committing:

```powershell
# one-time, IN THIS DIRECTORY (node_modules stays untracked):
#   npm i @babel/core @babel/cli @babel/preset-react
npx babel app-v4.jsx -o app-v4.js
```

(`babel.config.json` pins the CLASSIC runtime — React.createElement against the
UMD global. Without it Babel emits `import ... from "react/jsx-dev-runtime"` and
the page dies with "Cannot use import statement outside a module". Babel resolves
the preset relative to the config file, so the npm install must be in this
directory — a scratch dir elsewhere will throw ERR_MODULE_NOT_FOUND.)

If you forget, your edit silently won't ship (the page loads app-v4.js, not the jsx).

## Other invariants

- All asset paths RELATIVE (no leading `/`) — site lives at /portfolio/ sub-path, no CNAME.
- `.nojekyll` must stay (serves `arcade/` module folder verbatim).
- `mockups/` is untracked on purpose — never `git add -A`.
- Play pages (arcade.html, starship.html) are self-contained (inline CSS) and use the
  hotter accent `#e34a2b`; the homepage accent stays `#b9442b`.
- starship.html embeds https://desertcache.github.io/starship/ click-to-load only
  (a live Three.js iframe would burn GPU from page load otherwise).

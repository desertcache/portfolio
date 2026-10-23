# Samuel Bates · portfolio

The portfolio of Samuel Bates, AI Solutions Manager at DoorDash.
**[desertcache.github.io/portfolio →](https://desertcache.github.io/portfolio/)**

![Most AI dies in the demo. I build the kind that ships.](assets/og.png)

Static HTML, CSS and a little JavaScript. No framework, and no build step for
the homepage: every word is in the HTML, so the page reads with scripts off,
and the JavaScript only adds motion and the interactive parts.

## What's in it

- **The homepage.** The featured program (an AI copilot taken live with an
  outsourced support team, drawn as a system diagram that assembles itself as
  you read the steps beside it), six case studies that open out of their cards,
  the background, how I build with Claude Code, and a toolkit whose tools link
  to the work that used them.
- **The Lab.** [Starship Explorer](https://github.com/desertcache/starship), a
  procedural Three.js ship built by a fleet of Claude Code agents. The Arcade:
  twelve games on one small canvas engine, including a lander that teaches
  itself to fly in your browser (a hand-written network trained with PPO, no
  pretrained weights). [Samantha UI](https://github.com/desertcache/samantha-ui),
  a GLSL orb. And the [Answer Finder](https://github.com/desertcache/ask) in the
  bar at the bottom of the page: a 4 MB embedding model on your own device that
  matches questions to answers I approved, so it can't make anything up.
- **Hill Money Watch.** A digest of congressional stock-trade disclosures,
  written by a Claude Code skill and published through a script that rejects
  any draft breaking its contract (`scripts/ingest_digest.py`).
- **Research pages.** Fifteen delivery IPOs from offer price to today (D3), and
  what the evidence says about topical PDRN.

## How it's built

- **Progressive enhancement, in three layers.** `index.html` is the content,
  `css/site.css` the look (tokens, then components in page order), `js/*.js`
  the behaviour: ES modules, each feature started in its own `try`/`catch` so
  one failure can't take down the rest.
- **The map is real.** The hero's contour lines and the footer's skyline are
  Camelback Mountain, from USGS elevation data. `scripts/build_terrain.py` bakes
  it into a 12-bit heightmap, and a WebGL shader draws USGS-style contours from
  it, with the real elevation under your pointer.
- **The drawings are generated.** The cacti, wildflowers and animals come from
  Python (`scripts/draw_desert.py`, `scripts/draw_fauna.py`) as SVG sprites. The
  roadrunner's legs are solved by two-bone IK, and it runs as far as you scroll.
- **Logic you can test lives apart from the DOM**, in small modules Node tests
  directly. The JavaScript is type-checked through JSDoc with TypeScript
  (`npm run check`), with no build output.

## The bar it's held to

- **Tests.** `npm test` runs the Node suite: copy rules (no em dash anywhere a
  reader looks, every link resolves), the terrain maths, the wildlife gaits,
  the pinball physics, the lander's learner. `python -m pytest scripts` covers
  the generators and the publishing contract.
- **Accessibility.** axe-core (WCAG 2.2 AA and best practices) passes on every
  page, in light and dark. Reduced motion is respected everywhere, and every
  page reads with JavaScript off (the games and demos need it to run).
- **Speed.** Last measured October 2026 with Lighthouse 12: the homepage scores
  90 or better on mobile and 99 to 100 on desktop (runs vary by a point or
  two), every other page 92 to 98 on mobile and 99
  to 100 on desktop, and accessibility and best practices score 100 throughout.
  Fonts are self-hosted, offscreen animation pauses, and the WebGL map holds
  still on machines that would draw it on the CPU.
- **Paper.** The homepage prints whole and legible in either theme.

## Run it locally

```bash
npx http-server -c-1          # from this folder, then open http://localhost:8080
npm install                   # once: TypeScript and Tailwind, for the checks only
npm test && npm run check
python -m pytest scripts      # needs numpy, Pillow and beautifulsoup4
```

The 404 page uses absolute `/portfolio/` paths, as GitHub Pages serves it at
whatever URL was missing; serve the parent folder to try it.

## Where things are

| Path | What |
|---|---|
| `index.html`, `css/site.css`, `js/` | The homepage, its stylesheet and its modules |
| `work/` | Long-form write-ups of the work |
| `arcade.html`, `arcade/` | The Arcade: engine, games, explainers |
| `blog/` | Hill Money Watch and the research pages |
| `assets/` | Generated sprites, the heightmap, fonts, images |
| `scripts/` | Generators and the publishing script, with their tests |
| `tests/` | The Node test suite |
| `DEV-NOTES.md` | How everything works, and what not to break |

Before changing anything, read [DEV-NOTES.md](DEV-NOTES.md): it explains each
system and the invariants the tests enforce.

# The Last Invention

A 25-slide talk on AI and the intelligence explosion, in five acts, built as one web page. A WebGL2
particle engine with bloom and warp transitions, canvas charts drawn from published data, and a score
synthesized live with the Web Audio API. No libraries, no image files, no sound files.

Claude Opus 5.5 wrote, designed and coded all of it in one Claude Code session, from a one-paragraph prompt.

Watch it: https://desertcache.github.io/portfolio/last-invention/

## Keys

`→` or a click: next. `←`: back. `F` full screen, `M` sound, `N` speaker notes, `O` all slides.
A presentation clicker that sends Page Down works too.

## Files

| File | What it does |
|---|---|
| `src/engine.js` | The particle universe: one set of up to 100,000 particles, WebGL2, morphs between shapes, camera, bloom, warp, grain |
| `src/formations.js` | The shapes: particle text, the exponential curve, the loop, the datacenter grid, the helix, the robots, the sun, the galaxy |
| `src/charts.js` | The 2D charts: the time zoom, training compute on log then linear axes, METR time horizons with a projection, the loop, world GDP |
| `src/slides.js` | What the particles do on each slide |
| `src/deck.js` | Navigation, steps, notes, the slide overview, keyboard and touch |
| `src/audio.js` | The generative score |
| `src/deck.css`, `src/index.src.html` | The slides themselves |
| `portfolio.css` | The site's own fonts in place of Google Fonts, and the link back to the portfolio |
| `build.js` | Inlines everything into `last-invention/index.html` |

## Build

```
node scripts/last-invention/build.js
```

`npm test` fails if the page is older than its source.

## Data

Sources are named on the slides: Epoch AI (training compute, algorithmic efficiency), METR (task time
horizons), the four companies' capital-spending guidance for 2026, The Planetary Society (Apollo),
AI Impacts (the 2023 expert survey), J. Steinhardt's 2021 forecasting contest, R. Hanson (2000),
T. Davidson (2021), the Protein Data Bank, the AlphaFold database and UNESCO. Recent figures carry wide
error bars and are marked approximate where they are.

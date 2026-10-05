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
  single number (`42%`, `4,321`, `800+`). The HTML keeps the real value;
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

### The look: v5.3 "Sedona" (2026-09-26)

The palette is the desert itself: red rock, cactus greens and flowers by
day, an Arizona sunset after dark. v5.0's cream paper, terracotta and
serif read as Anthropic's brand; v5.1 fixed that with chalk and palo-verde
green; v5.3 brings the red back as Sedona rock, on purpose, with guardrails.

- **Colour by role.** By day: Sedona-dust paper (`#f3ebe6`), dusk ink
  (`#1c1624`, a saguaro's purple-black against the sunset), and
  **red rock** as the signal (`--accent` `#a8401d`: buttons, marks, big
  numbers, map slopes). Juniper green is the support colour (`--support`)
  and prickly-pear fruit magenta (`--bloom`) is kept for rare pops; gold
  lives in the drawings and the map's summits, not in the interface. After
  dark it is Sonoran dusk: deep violet (`#150f24`), the rock in its last
  light (`#ff7a45`), and headline words lit amber into pink.
- **Guardrails, so it never drifts back to the Anthropic look.** The red
  has the same hue as Anthropic's clay but is far deeper and more saturated
  (lightness .39 against .60); keep it iron oxide, never lighten it toward
  clay. Keep the ink cool (never a warm charcoal), the type sans (never a
  serif), and let juniper, gold and magenta carry the supporting roles.
- **The hero map is hypsometric:** juniper flats, red-rock slopes, a gold
  summit by day; violet flats, sunlit slopes and gold peaks at dusk
  (`--topo-low/mid/high`), because peaks hold the light longest.
- **Type.** Archivo for everything you read: expanded (`semi-expanded`,
  weight 750–800) for display, normal width for text. Martian Mono
  (`semi-condensed`) for labels and data. Both come from one Google Fonts
  `<link>` that every page repeats; change one, change them all
  (`grep -rl "Archivo:ital" --include=*.html`).
- **Emphasis.** An `<em>` in a headline catches the sunset: the word is
  filled with `--em-sunset` through `background-clip: text` (red rock into
  prickly-pear berry by day, amber into orange into pink at dusk and in the
  Lab), and as the heading arrives the light crosses it in reading order.
  The gradient is 250% as wide as the word: its first 40% is the word at
  rest and the ink after it is where the light starts, so the motion is one
  `background-position` transition. Without `background-clip: text` the word
  is plain red rock; with reduced motion it arrives lit. There is one
  emphasis rule in `site.css`. (v5.4 retired the gold highlighter band,
  `--hi`: it read as a yellow marker.) Selected text is a red-rock wash
  (`--select`) with ink on top.
- **Semantic colours are separate from the brand.** Gains use `--ok`,
  losses use `--neg` (a crimson, kept apart from the rock red). With a red
  brand, a *selection* drawn in the accent would read as "down", so the IPO
  ledger draws its selected company in ink (`--led-sel`).
- `--serif` is now an alias of `--display`, kept so older digests and pages
  that still name it keep resolving.

### The desert drawings and the Lab's sunset (v5.3)

- **The drawings** (saguaros, prickly pear in fruit and flower, barrel
  cactus, ocotillo, a palo verde in bloom, the Sedona buttes) are one SVG
  sprite, `assets/desert.svg`, generated by `scripts/draw_desert.py` (tests:
  `scripts/test_draw_desert.py`). Change the drawing in the script and
  re-run; don't hand-edit the sprite.
- **Styling crosses into the sprite through custom properties**, which
  inherit into a `<use>`: `--illo-line`, `--illo-paper` (the fill behind an
  outline, set to the section background so a pad in front hides the pad
  behind it), `--illo-fruit`, `--illo-flower`, `--illo-ember`, and
  `--illo-w` (stroke width in the drawing's own units, so small drawings
  need a bigger number). Set every colour to one dark value and a drawing
  becomes a silhouette; that is all the Lab does.
- **They draw themselves on.** `--draw` is a registered custom property
  (`@property`), 0 to 1; every stroked path has `pathLength="1"`, so one
  transition animates them all, and fruit and flowers bloom in last. No JS,
  no `@property`, or reduced motion: they are simply there, fully drawn.
- **Placement.** At 1280px and wider they stand beside each section heading
  and bleed into the page margin (`.head-illo`); narrower, they shrink and
  stand on the eyebrow line, top right. If you change a heading's length,
  check 1280 and 1440 for collisions.
- **The Lab is always the sunset room**: a banded sky (`--sun-1…6`), the
  sun going down behind the real Camelback range (the footer's
  `skyline.svg`, reused as a mask), and the drawings in silhouette on the
  ground line. The orb's stand-in is a setting sun.
- **The footer at dusk** gets an afterglow behind the skyline
  (`--afterglow`), so the sun has just gone down behind Camelback.

### Wildflowers (v5.4, 2026-09-26)

- **The spring bloom:** Mexican gold poppies, lupine, globemallow,
  brittlebush, Parry's penstemon, a flowering hedgehog cactus, an agave in
  bloom and grass tufts, all from the same generator and sprite.
- **Beds** (`.bed`, plants inside, sized by an inline `--h` in px): along the
  hero's floor (`.hero-bed`, grouped in `.clump`s), in the bottom padding of
  sections (`.bed-left` / `.bed-right`, alternating), and standing on the
  footer's top edge in front of the skyline (`.footer-bed-l/-r`). Beds live
  in padding on purpose, so they can never sit on content; if you shrink a
  section's padding, shrink `--k` with it.
- **The breeze:** every `.flora` sways on its own timing (`--sway-t`,
  `--sway-d`, `--sway-a`), and each plant is its own `<svg>` so the sway is a
  compositor-only transform. Cacti and agaves are `.plant` and stand still.
  Reduced motion stops all of it.
- **Colour:** each flower has a token (`--illo-poppy`, `--illo-lupine`,
  `--illo-mallow`, `--illo-pink`, `--illo-blue`, `--illo-violet`,
  `--illo-cream`, plus `--illo-flower` and `--illo-ember`), day and dusk. Bodies are filled from `--illo-ground` with a breath of
  juniper through `color-mix` (red for the Sedona rocks), behind an
  `@supports` guard: without `color-mix` they fall back to the plain ground
  colour rather than to black.

### The second flush: no bed repeats itself (v5.5, 2026-09-27)

- **Twenty more drawings** in `assets/bloom.svg` (also from
  `scripts/draw_desert.py`, `build_bloom()`): fairy duster, chuparosa,
  desert bluebells, owl's clover, sand verbena, pincushion cactus, desert
  marigold, sacred datura, teddy bear cholla, purple three-awn, creosote and
  soaptree yucca, plus seeded variants of the first flush (the functions take
  a `seed`: same species, different individual) and two colour variants,
  firecracker penstemon and claret cup. `desert.svg` stayed byte-identical.
- **The rule, enforced:** across every bed on the homepage a drawing appears
  at most twice, never twice in one bed, and its second appearance is
  mirrored (`.flip`, the individual `scale` property, so the sway's
  `transform` still applies). `test_no_bed_repeats_itself` fails the build if
  an edit breaks it. When you add a bed, pick drawings that are on the page
  once or not at all.

### Wildlife (v5.4, 2026-09-26; the neighbourhood v5.5, 2026-09-27)

- **Who lives here:** a greater roadrunner on the hero's floor and on the
  Lab's sunset ground (in silhouette), a loose flock crossing the Lab's sky,
  and a red-tailed hawk circling a thermal over Camelback on the hero map
  (wide screens only; on phones the map sits behind the headline). They're
  drawn by `scripts/draw_fauna.py` into `assets/fauna.svg`, in the plants'
  hand and colour properties, so the Lab's silhouette rule covers them too.
- **The roadrunner is a flip-book driven by scroll.** Its symbol holds six
  run poses and two standing ones (tail down, tail flicked); `--frame` (a
  registered `<integer>`, inherited into the `<use>`) picks one. Its
  position is a function of scroll: over the stretch in which its `.trail`
  rises through the screen, its hip goes from `--run-from` to `--run-to`
  (fractions of the trail's width, set in CSS so breakpoints can move
  them). It chases that spot with a 0.12 s lag, so a flick of the wheel reads
  as a dash; scroll up and it turns round; stop and it stands and flicks its
  tail (`tail-flick`, on `[data-state="idle"]`).
- **Why its feet don't skate:** the legs are solved by two-bone IK from a
  stride loop in which a planted foot sweeps back at an even pace, so one
  stride carries the bird exactly `STRIDE / STANCE` units. The generator
  writes that number (and the frame numbers, viewBox and hip) into
  `js/fauna-data.js`, and `js/roadrunner.js` advances `--frame` by distance
  covered, capped at 7 strides a second so fast scrolling reads as a blur of
  legs instead of strobing. Maths in `js/wildlife.js`, tested in
  `tests/wildlife.test.mjs`; drawing checks in `scripts/test_draw_fauna.py`.
  Change a number in the generator and re-run it; never edit the outputs.
- **The neighbourhood** (`assets/critters.svg`, `js/critter-data.js`, from
  `build_critters()`): one animal to a section, each on its own `.trail` in
  the section's bottom padding, behind its flower bed, and each with its own
  gait in `js/trails.js`. A rattlesnake slithers across the Featured Program
  section (a wave travels down its body, stepped by distance like the
  roadrunner's legs) and at rest flicks its tongue and buzzes its rattle. A
  desert hairy scorpion darts across Work (it commits to a spot, dashes,
  freezes; `dart()` in `js/gaits.js`), raises its tail at rest, and glows
  cyan at dusk the way scorpions do under ultraviolet. A Sonoran Desert toad
  hops across Background in whole hops (`hop()`: it can't stop in mid-air)
  and blinks and breathes at rest. A javelina trots into the footer as the
  page ends and roots about. Frame 6 is every animal's resting pose, so the
  registered `--frame` (initial 6) is right for all of them.
- **One engine:** `js/trails.js` drives every animal on a trail (gaits:
  run, dart, hop). `js/roadrunner.js` is now a one-line re-export kept only so
  a cached older `main.js` still finds it; new pure logic went into a new
  module (`gaits.js`) rather than new exports on an old one, for the same
  reason.
- **ViewBoxes start at 0 0.** A `<use>` lays its symbol's viewport at the
  outer `<svg>`'s origin, so a symbol whose viewBox starts elsewhere is drawn
  shifted by that much (v5.4's roadrunner stood 13 units below its own feet).
  The generators now shift the drawing into a `0 0 w h` box, measured from
  the paths themselves (`path_points`), and a test holds every symbol to it.
- **Cost:** everything moves by transform. The flock and the hawk are pure
  CSS (a full-width track translated across, the wingbeat a vertical scale
  through zero); the roadrunner's loop runs only while its trail is on
  screen and something is moving. Reduced motion stops all of it and leaves
  each animal standing in its scene (`--rest`, and `--x` for the birds).

### The hero map is real terrain (v5.2 "Arizona", 2026-09-26)

The contours in the hero are Camelback Mountain and the Phoenix Mountains,
drawn from USGS elevation data, not noise. The cursor still raises a hill,
and the "field notes" card reads out the real coordinates and elevation
under the pointer, the named peak when you're on one, and a true scale bar.

| File | Job |
|---|---|
| `scripts/build_terrain.py` | Fetches AWS Terrain Tiles, checks the named summits against the data (it refuses to build if one is more than 15 m off), and writes the next three files. Run it only to change the map; the site never runs it. Tests: `scripts/test_build_terrain.py`, offline, on synthetic terrain. |
| `assets/terrain/heightmap.webp` | Elevation on a north-up lat/lon grid (16 m texels, ~160 KB), 12 bits packed into red and green: `v = 16*R + G/16`. Lossless; never re-save it through an image editor. |
| `js/terrain-data.js` | Generated: extent, size, elevation range, named peaks. Don't hand-edit. |
| `js/arizona.js` | Pure helpers: which ground the canvas frames (`viewFor`), pixel-to-coordinate mapping, heightmap decoding and sampling, the legend readout, the scale bar, Phoenix time. Tested in `tests/arizona.test.mjs`. |
| `js/topo.js` | WebGL: uploads the heightmap, draws USGS-style contours (20 ft, 100 ft, a bold index line every 500 ft), the cursor hill and the night sky, and keeps the legend current. |

Things worth knowing before touching it:

- **The shader does its own bilinear filtering**, on a NEAREST texture. A GPU
  filtering the two packed bytes itself may round each to 8 bits, which
  terraces the lines.
- **Colour management is off when decoding the heightmap**
  (`createImageBitmap` with `colorSpaceConversion: 'none'`, or
  `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` on the `<img>` fallback). A
  colour profile "correcting" those bytes would move mountains.
- **Framing.** `viewFor` keeps Camelback at a designed spot (upper right on
  desktop, behind the headline on a phone) and zooms in rather than show
  ground the heightmap doesn't have. The view drifts about 100 m on a slow
  loop; `data-seed` on the canvas pins that moment (the OG card uses 0, the
  framing as designed).
- **Elevation readout.** The terrain's value, except within ~90 m of a named
  summit, where it shows the published spot height: the data is smoothed,
  so summits read about 20 ft low, and a local would notice.
- **Cost** is lower than the old procedural shader: one full-screen triangle,
  four texture reads a pixel, the ~2.2-megapixel buffer cap, ~20fps while
  idle, nothing while the hero is off screen or the tab is hidden. Reduced
  motion gets one still frame (the readout still works; the hill doesn't).
  No WebGL, or no heightmap, means no canvas, just paper.
- **Cache safety.** The new helpers went into new files (`arizona.js`,
  `clock.js`, `terrain-data.js`) and `lib.js` kept its exports, including
  the now-unused `coordsFor`, for the same reason `editions.js` exists.
  `coordsFor` can go in any later release.

### The skyline and the clock

- **The footer skyline** is `.footer::before`: `assets/skyline.svg` as a CSS
  mask, filled with `--bg-tint`. It is the real skyline, looking north
  across the city from about 8 km south-southwest of Camelback (eye 60 m up,
  heights doubled), built by the same script from the same data. CSS only,
  so every page with the shared footer has it; phones see a 900px-wide crop
  that keeps Camelback in view.
- **The Phoenix clock** in the contact section is `js/clock.js`
  (`Intl.DateTimeFormat`, `America/Phoenix`), ticking on the minute. With
  JS off, the line still names the time zone.

To change the map (a different peak, extent, or texel size), edit the
constants at the top of `scripts/build_terrain.py` and run it:

```bash
python3 scripts/build_terrain.py   # needs numpy + Pillow; caches tiles in ~/.cache/portfolio-terrain
```

### Checks

```powershell
npm install        # once, in this directory
npm test           # unit tests for js/lib.js, editions.js, arizona.js, wildlife.js, plus the homepage content
                   # checks (tests/homepage-content.test.mjs) (Node's built-in runner)
npm run check      # type-checks js/ via JSDoc + TypeScript, no build output
python -m pytest scripts   # the Python scripts: digest ingest, terrain build, drawings
```

`tests/homepage-content.test.mjs` holds the copy rules that apply to every edit: no em dash anywhere a
reader looks on the homepage or a work sample (text, SVG labels, tab title, link-preview text), every
`#link` and `data-cs` resolves, and each work card has its dialog, in card order, with prev/next links
that go round in one loop. It also holds the card from Anthropic's Claude Code team to its exact words
(quote it, never inflate it) and counts training in people, never leaders. Public copy also has to pass
the job-search repo's `strategy-2026-09/grep-gate.py` (no DoorDash-internal numbers, codenames or vendor
names, and no head counts for the outsourced teams).

Pure logic lives in `js/lib.js` (and its newer siblings, `editions.js`,
`arizona.js` and `wildlife.js`) precisely so it can be tested without a
browser. If a new
helper doesn't touch the DOM, put it in one of those and test it.

### Images

- `assets/headshot-600.*` and `headshot-96.*` are square crops of the
  original headshot (WebP with a JPEG fallback via `<picture>`).
- `assets/claude-code-card.*` (How I build, Fig. 1) is Sam's photo of the
  package from Anthropic's Claude Code team: a 4:3 crop of the original,
  converted from Display P3 to sRGB, every metadata tag stripped, 1200×900,
  WebP with a JPEG fallback, lazy-loaded. It is personal recognition: keep
  it away from anything that says which employer's account it came from.
- `assets/og.png` is the link-preview image. Its source is
  `scripts/og-card.html`, which renders the real hero map (Camelback) with
  the drift pinned; the steps to regenerate are in that file's header
  comment.
- `assets/terrain/heightmap.webp` and `assets/skyline.svg` are generated by
  `scripts/build_terrain.py` (see "The hero map is real terrain").
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

## skincare.html is precompiled too (2026-08-15, reskinned 2026-09-27)

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
  (`--sk-ink: 28 22 36`), wired into the Tailwind config as
  `rgb(var(--sk-ink) / <alpha-value>)`. That form is what keeps opacity
  modifiers (`bg-paper/50`, `bg-ochre-light/40`, `bg-opacity-90`) generating
  correct CSS. Plain `var(--x)` would silently break all of them.
- Rules in `skincare.src.css` sit **outside** any layer directive on purpose.
  Tailwind content-scans layered CSS and can drop selectors that never appear
  in the HTML — and `[data-theme="dark"]` / `.theme-fade` only ever exist at
  runtime. (When grepping the built file: the minifier unquotes attribute
  selectors to `[data-theme=dark]` and collapses `::after` to `:after`.)

Since v5.5 it wears the site's look. `css/site.css` loads first for the nav,
the footer and the tokens; `skincare.css` (with Tailwind's preflight) comes
after, so the document keeps the base it was built on while the nav and
footer, styled by class, are untouched. `js/page.js` runs the site's theme
toggle and nav (same `sb-theme` key as every page). The `--sk-*` palette is
the site's Sedona day and Sonoran dusk (ochre is red rock; sage and slate
keep their meanings, recovery and BHA, and clear 4.5:1 on their tints);
`font-serif` headings take the site's display cut (Archivo semi-expanded,
750) and `font-mono` is Martian Mono set semi-condensed, as everywhere else.
The document header pins under the fixed nav on wide screens only
(`lg:sticky` + `.doc-head`); on a phone it's too tall to pin. The end-note
keeps `pb-28` so the footer's skyline, which rises into the space above the
footer, doesn't cover it.

## The Lab's rooms: arcade.html and starship.html (2026-09-27)

Both wear the site's chrome: the real nav (Lab marked current), the
homepage's section head (eyebrow, a title whose `<em>` catches the sunset,
a lede, a desert drawing) and the footer with the side quests. `css/play.css`
is the room itself: dark in both themes like the Lab, with the sunset's glow
along its floor. `js/page.js` is their script entry (theme toggle, nav).

- `arcade/main.js` owns the cabinet's contents. Keep every hook it reaches
  for: `#arcade-section`, `#gameCanvas`, `#arcade-menu`, `.arcade-btn`,
  `[data-game]`, `#btn-*`, `#game-over-screen`, `#final-score`,
  `#hud-score`, `#current-score`, `.crt-off`. Pac-Man draws its own score
  (`ownHud`), so the page's HUD shows only for the other games.
- The arcade no longer sets `user-scalable=no` (it blocked pinch zoom, an
  accessibility failure); `touch-action: manipulation` on the cabinet stops
  double-tap zoom mid-game instead.
- The starship is a separate app (desertcache/starship), framed only when
  you board; this page is the dock. Touch-only or narrow screens get the
  poster and a note.

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

## Ask about my work: the glass bar (2026-10-04)

A liquid-glass bar fixed to the bottom of the homepage (`#dock` in `index.html`, styles in
section 7 of `css/site.css`, behaviour in `js/ask.js`). It replaced the Lab's "Ask about my work"
row (PR #12), which is gone.

- **Nothing is generated.** The answer finder is [desertcache/ask](https://github.com/desertcache/ask):
  a 3.9 MB embedding model matches a question to answers Sam approved. `js/ask.js` imports that
  repo's `js/embed.js`, `js/match.js` and `js/config.js` and fetches its `data/bank.json` and
  `models/` from `https://desertcache.github.io/ask/` on first focus or hover, never at page load.
  Those modules are a public contract: a change there must stay compatible with this file.
- **The orb is the real Samantha orb**, `desertcache/samantha-ui` in controlled mode
  (`?embed=1&control=1`). This page sets its state by `postMessage({ type: 'orb:state', state })`:
  LISTENING at rest, THINKING while the trace runs, SPEAKING while the answer's words appear. The
  orb answers `{ type: 'orb:ready' }` and only accepts messages from desertcache.github.io or
  localhost. It loads after the page does, for every visitor except reduced motion (still CSS orb).
- **The trace is the real matching work**, paced (~300 ms a step) so it can be read; its summary
  reports the real compute time. Keep it that way: the bar promises nothing is made up.
- **`js/ask.js` keeps its name and its `initAsk` export on purpose.** Pages caches for 10 minutes;
  a cached `main.js` importing a file that no longer exists would take down every module.
- The base reset caps iframes at `max-width: 100%`; the orb's overscanned iframe sets
  `max-width: none`, or the orb renders off-centre in its lens.
- The glass turns to night glass in dark mode and while the Lab is behind it (`.on-night`, set on
  scroll). `.has-dock` pads the footer and lifts the toast above the bar. Hidden in print and while
  a case study is open. `/` focuses it; Esc folds the answers.

## Other invariants

- All asset paths RELATIVE (no leading `/`) — site lives at /portfolio/ sub-path, no CNAME.
- `.nojekyll` must stay (serves `arcade/` module folder verbatim).
- `mockups/` is untracked on purpose — never `git add -A`.
- Play pages (arcade.html, starship.html) and skincare.html still carry the
  v4 look (cream, terracotta, Instrument Serif) in their own inline CSS or
  Tailwind build. They don't use `css/site.css`, so v5.1 didn't reach them;
  moving them over is open work.
- starship.html embeds https://desertcache.github.io/starship/ click-to-load only
  (a live Three.js iframe would burn GPU from page load otherwise).
- The homepage's section ids (`#work`, `#lab`, `#about`, `#contact`) are
  linked from the other pages' navs. Rename one and those links break.

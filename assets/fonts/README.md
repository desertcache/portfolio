# Fonts

Self-hosted since 2026-10-08 (they used to come from Google Fonts, whose stylesheet blocked
first paint on every page). Latin and Latin Extended subsets only, as Google serves them;
the `@font-face` rules at the top of `css/site.css` carry Google's unicode ranges.

| File | Family | Axes | License |
|---|---|---|---|
| `archivo-latin.woff2`, `archivo-latin-ext.woff2` | Archivo | weight 100-900, width 62-125% | SIL OFL 1.1, `OFL-archivo.txt` |
| `archivo-italic-latin.woff2`, `archivo-italic-latin-ext.woff2` | Archivo Italic | same | SIL OFL 1.1, `OFL-archivo.txt` |
| `martian-mono-latin.woff2`, `martian-mono-latin-ext.woff2` | Martian Mono | weight 100-800, width 75-112.5% | SIL OFL 1.1, `OFL-martian-mono.txt` |

Sources: fonts.gstatic.com (Archivo v25, Martian Mono v6); licenses from github.com/google/fonts.
Archivo is by the Archivo Project Authors (Omnibus-Type); Martian Mono by the Martian Mono
Project Authors (Evil Martians).

Every page preloads `archivo-latin.woff2` with `fetchpriority="low"`. Measured on an emulated slow-4G
phone (150 ms RTT, 1.6 Mbps, 4x CPU, gzip): two high-priority preloads delayed first paint by
~230 ms; none left the fonts arriving ~220 ms later; one low-priority preload kept first paint level
and loaded fastest. The real-world gain is the two cold Google origins gone from the critical path.

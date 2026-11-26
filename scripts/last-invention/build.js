// Builds last-invention/index.html: the talk as one self-contained page on the portfolio.
// Run from anywhere:  node scripts/last-invention/build.js
// src/ is the talk exactly as it was made. This build swaps Google Fonts for the site's own
// faces (portfolio.css), adds link previews and icons, and puts a link back to the portfolio
// in the HUD. Everything is inlined, so the page needs nothing but the font files.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SRC = path.join(HERE, 'src');
const OUT = path.join(HERE, '..', '..', 'last-invention', 'index.html');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const countLines = (s) => s.split('\n').length;

const files = fs.readdirSync(SRC).filter((f) => /\.(js|css|html)$/.test(f));
const portfolioCss = fs.readFileSync(path.join(HERE, 'portfolio.css'), 'utf8');
const sourceLines = files.reduce((n, f) => n + countLines(read(f)), 0) + countLines(portfolioCss);

const PAGE_URL = 'https://desertcache.github.io/portfolio/last-invention/';
const TITLE = 'The Last Invention · Samuel Bates';
const DESC = 'A 25-slide talk on AI and the intelligence explosion, in five acts. A field of particles reshapes itself on every slide, the charts draw themselves, and the music is synthesized in the browser. Claude wrote, designed and coded it in one Claude Code session.';
const FONTS = {
  display: '"TLI Display", Archivo, sans-serif',
  text: '"TLI Text", Archivo, sans-serif',
  mono: '"Martian Mono", Consolas, monospace',
  load: '"TLI Display"',
};

function swap(html, find, replacement) {
  const out = html.replace(find, replacement);
  if (out === html) throw new Error(`build: nothing matched ${find}`);
  return out;
}

let html = read('index.src.html');

// head: the artifact-only meta and Google Fonts go; the site's preload, link previews and icons come in
html = swap(html, /<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
html = swap(html, /<meta name="claude:viewport-fit-sides"[^>]*>\r?\n/, '');
html = swap(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${DESC}">`);
html = html.replace(/<link rel="preconnect"[^>]*>\r?\n/g, '');
html = swap(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\r?\n/, '');
html = swap(html, '<meta name="theme-color" content="#03040a">', [
  '<meta name="theme-color" content="#03040a">',
  `<link rel="canonical" href="${PAGE_URL}">`,
  '<!-- Link previews (LinkedIn, Slack, iMessage). og:image must be an absolute URL. -->',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="Samuel Bates">',
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESC}">`,
  `<meta property="og:url" content="${PAGE_URL}">`,
  '<meta property="og:image" content="https://desertcache.github.io/portfolio/assets/og-last-invention.jpg">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:image:alt" content="The words The Last Invention made of glowing particles on a black field">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<link rel="icon" type="image/svg+xml" href="../favicon.svg">',
  '<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">',
  '<link rel="preload" href="../assets/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin fetchpriority="low">',
].join('\n'));

// styles and scripts, inlined
html = swap(html, /<link rel="stylesheet" href="([\w.-]+\.css)" data-inline>/, (m, f) => `<style>\n${read(f)}\n${portfolioCss}\n</style>`);
html = html.replace(/<script src="([\w.-]+\.js)" data-inline><\/script>/g, (m, f) => {
  const js = read(f);
  if (/<\/script/i.test(js)) throw new Error(`${f} contains a closing script tag`);
  return `<script>\n${js}\n</script>`;
});

// the faces and the line count the last slides read, set before the first script runs
html = swap(html, '<!--@@BODY@@-->', `<!--@@BODY@@-->\n<script>window.TLI = { FONTS: ${JSON.stringify(FONTS)} }; window.TLI_BUILD = { lines: ${sourceLines}, built: "${new Date().toISOString().slice(0, 10)}" };</script>`);

// a way home, first in the HUD
html = swap(html, '<div class="hud-act">', '<div class="hud-act"><a class="hud-home" href="../#lab" aria-label="Back to the portfolio">← Samuel Bates</a><span class="sep"></span>');

const [head, body] = html.split('<!--@@BODY@@-->');
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head.trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log(`built ${path.relative(path.join(HERE, '..', '..'), OUT)}: ${(page.length / 1024).toFixed(1)} KB, ${sourceLines} source lines`);

/** Build config for skincare.html only.
 *
 *  skincare.src.css  --(tailwindcss cli)-->  skincare.css
 *
 *  Colors resolve through CSS custom properties (rgb channel triplets defined
 *  in skincare.src.css) so the whole palette re-tints under [data-theme="dark"]
 *  without touching a single utility class in the markup. The
 *  `rgb(... / <alpha-value>)` form is what keeps Tailwind's opacity modifiers
 *  (bg-paper/50, bg-ochre-light/40, bg-opacity-90) generating correct CSS.
 *
 *  Rebuild after editing classes in skincare.html:  npm run build:skincare
 */
module.exports = {
  content: ['./skincare.html'],
  theme: {
    extend: {
      fontFamily: {
        // the site's type (css/site.css): Archivo for reading and, set
        // semi-expanded, for display (what `font-serif` means here since
        // v5.5); Martian Mono for labels and data
        sans: ['Archivo', 'ui-sans-serif', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Archivo', 'ui-sans-serif', 'Helvetica Neue', 'sans-serif'],
        mono: ['Martian Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        paper: 'rgb(var(--sk-paper) / <alpha-value>)',
        surface: 'rgb(var(--sk-surface) / <alpha-value>)',
        // a real color, so `divide-hairline` resolves too — in the source
        // document it silently fell back to Tailwind's cool gray-200
        hairline: 'rgb(var(--sk-hairline) / var(--sk-hairline-a))',
        ink: {
          primary: 'rgb(var(--sk-ink) / <alpha-value>)',
          secondary: 'rgb(var(--sk-ink-2) / <alpha-value>)',
          muted: 'rgb(var(--sk-ink-3) / <alpha-value>)',
        },
        ochre: {
          DEFAULT: 'rgb(var(--sk-ochre) / <alpha-value>)',
          light: 'rgb(var(--sk-ochre-l) / <alpha-value>)',
          border: 'rgb(var(--sk-ochre-b) / <alpha-value>)',
        },
        sage: {
          DEFAULT: 'rgb(var(--sk-sage) / <alpha-value>)',
          light: 'rgb(var(--sk-sage-l) / <alpha-value>)',
          border: 'rgb(var(--sk-sage-b) / <alpha-value>)',
        },
        slate: {
          DEFAULT: 'rgb(var(--sk-slate) / <alpha-value>)',
          light: 'rgb(var(--sk-slate-l) / <alpha-value>)',
          border: 'rgb(var(--sk-slate-b) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};

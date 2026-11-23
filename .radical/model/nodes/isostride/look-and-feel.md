---
id: "4657ac26-ce37-4d24-a2cf-0e02511d9e0a"
type: "adr"
label: "Look and feel"
alternatives: |
  1. A component library (shadcn, Radix themes, MUI): a modern look quickly, but a dependency on the budget and a second styling system beside the tokens.
  2. Fonts from Google Fonts at run time: zero bytes shipped, but every visit tells a third party about the runner (Data stays local).
  3. System fonts only: no files, but a different look on every platform and weaker tabular numbers.
consequences: |
  • The look is one stylesheet of tokens and classes; a theme change is a token change.
  • public/fonts carries the OFL licence text; the fonts add 84 KB of static assets, outside the script budget.
  • Charts keep their aria names and classes, so the E2E tests and the dataviz rules (one axis per chart, series colours in fixed order, text in text tokens) are unchanged.
context: "The runner found the screens dated: \"nie wyglada na nowoczesny ... chodzi mi o wyglad, kolory, sposobu prezentacji wykresu\", then \"jest lepiej ale ciagle nie top class\". Every colour must stay a theme token (fitness function on untokenized colours), the app sends nothing over the network, and each route has a 200 KB script budget."
date: "2026-11-19"
decision: "One visual system in app/globals.css: a neutral surface scale (bg, surface, surface-2, surface-3) with hairline lines instead of boxes in boxes, ink buttons for the primary action, one accent for selection and links, the four series colours reserved for data. Type: Geist Sans and Geist Mono, SIL OFL, bundled under public/fonts (latin and latin-ext, 84 KB) and declared with @font-face, so no font is fetched from the network; numbers tabular, mono on axes and readouts. The shell: a sidebar with stroked icons, the data folder and the search, no top bar. Figures in one strip card; tables with numbers right-aligned and uppercase small headers. Charts: a gradient wash under each line, smooth monotone-cubic paths on the run lanes with the ticks inside the plot, one cursor card for all lanes, recessive grid and axis tokens, a halo under the route on a dotted grid. Analysis changes as figures with a verdict chip."
status: "accepted"
---

The visual system of the screens: tokens, bundled fonts, shell, figures, charts.

# Making ArchSketch eye-catching (UI, color, and star-worthiness)

Goal: a UI distinctive enough that a single screenshot makes people click, and a
first 30 seconds pleasurable enough that they star and share. Grounded in the
current code (`src/index.css` theme tokens, `Controls.tsx`, `CostPanel.tsx`,
`Diagram.tsx`).

Honest framing first: GitHub stars for a tool like this come from (1) one
irresistible screenshot/GIF, (2) instant "aha" in the first 10 seconds of the
live demo, (3) something worth sharing (links, images, presets). The UI work
below is prioritized against those three, not polish for its own sake.

---

## A. Color scheme

The "field notes on graph paper" concept is genuinely distinctive — the problem
isn't the concept, it's the execution being washed out. `--color-pad #9fb892`,
`--color-sheet #e4ebd4`, and `--color-panel #d5dec6` are all mid-value greens
sitting close together, so the screenshot reads as a flat olive rectangle. The
highlighter yellow and ballpoint blue are doing all the work.

### A1. Recommended: warm paper, green demoted to accent

Real field notebooks are cream/manila, not green. Separating "paper" from
"accent" instantly raises contrast and warmth:

```css
--color-pad:    #cdbf9b;  /* desk / kraft backing */
--color-sheet:  #f4efdd;  /* the sheet — warm cream, clearly lighter than pad */
--color-panel:  #e9e2c8;  /* side panel */
--color-ink:    #1c1a12;
--color-muted:  #55503d;
--color-rule:   #b9ad8a;
--color-ballpoint: #1d4ed8;  /* slightly punchier blue */
--color-mark:   #f5c518;     /* keep — it's the brand */
--color-node:   #fbf8ec;
```

Nodes pop off the sheet, the yellow band-badge and marker chips scream, and the
ballpoint blue edges finally look like ink on paper. Lowest-risk, biggest
visual upgrade.

### A2. Alternative: lean into the green harder (keep identity, fix values)

If the green stays: darken the pad (`#7a9468`), lighten the sheet (`#eef2dd`),
and make node cards near-white. The issue is value separation, not hue.

### A3. Blueprint dark mode (do this second, not instead)

A dark "blueprint" theme is the single most screenshot-able thing you can add:
deep navy paper (`#0d1826`), lighter drafting-sheet panel (`#122238`), grid
lines in faint cyan, node cards in `#16283f` with chalk-white ink, edges in
`#7fb4ff`, highlighter yellow kept as-is (it glows on navy). Blueprint is
thematically perfect for an architecture-sketching tool — it's not just dark
mode, it's a second personality. Toggle in the corner styled as `PAPER /
BLUEPRINT`. Social posts of dark-UI screenshots consistently outperform light
ones.

Implementation is cheap because everything already flows through the `@theme`
tokens: add a `[data-theme=blueprint]` block that redefines them, persist in
localStorage + a `t=` URL param so shared links keep the look.

### A4. Band color temperature

`BAND LARGE` is always yellow. Let the badge (and maybe the sheet's grid tint)
shift with scale: hobby = green, small/medium = yellow, large = orange, xlarge
= red-orange. Dragging the users slider then produces a visible "heat"
progression — great in GIFs, and it communicates "you are entering serious
territory" without words.

---

## B. Make the diagram the hero

In the current screenshot, the diagram — the entire point of the tool —
occupies maybe 20% of the pixels, surrounded by empty pad. The cost number and
prose push it up against a hard ceiling.

1. **Full-height canvas, overlay panels.** Let the ReactFlow canvas fill the
   whole right side edge-to-edge. Float the cost as a compact "price tag" card
   pinned bottom-left of the canvas (`$3,822–$8,190 / mo` + band badge), and
   move "Why this shape" / Math / Assumptions into a slide-up drawer or a
   toggleable margin note. First impression becomes "big living diagram" rather
   than "form with a picture".
2. **Fill dead space with drafting annotations.** The empty sheet around the
   graph is an opportunity: 1–2 hand-written-style margin notes (e.g. an arrow
   to the queue with "writes don't block the request path") drawn in ballpoint
   blue, rotated 1–2°. The `explain.ts` lines already contain the text — pick
   the top one and render it as an annotation instead of only prose below.
   Sparingly: max one or two, or it becomes noise.
3. **Title the sheet.** A small drafting-style title block in a corner of the
   canvas ("ARCHSKETCH · 426.6K USERS · BAND LARGE · $5,460/MO") like the
   corner stamp on real blueprints. Costs 20 lines, photographs beautifully,
   and every screenshot then carries the numbers with it.

---

## C. Motion and micro-delight

The tool's magic moment is dragging the users slider and watching the
architecture react. Right now nodes teleport and the cost text just changes.

1. **Animate the cost number** — rolling/count-up digits (~250ms). The cost is
   the emotional payload of the tool; make it feel alive. No library needed
   (requestAnimationFrame + tabular-nums so width doesn't jitter).
2. **Nodes enter/exit with intent** — new nodes drop in with a 150ms
   scale+fade (you already flash them); removed nodes fade out instead of
   vanishing. ReactFlow positions can be transitioned with CSS on
   `.react-flow__node`.
3. **Animated dashes on the async edge** — the dashed queue edge with
   `animation: dash-flow` says "fire-and-forget" instantly and adds life to an
   otherwise static sheet. Keep read/write edges static so the motion means
   something. (Respect the existing `prefers-reduced-motion` block — already
   handled globally.)
4. **Band-badge stamp** — when the band changes, the badge does a quick
   rubber-stamp scale-in (1.15 → 1.0). It marks threshold crossings, which is
   the teaching moment.
5. **Slider feel** — the default range input looks OS-generic inside a styled
   sheet. A custom track (ruled line + ballpoint dot thumb, yellow fill on the
   active side) makes the primary control feel designed. This is the control
   every user touches first.

---

## D. Shareability — what actually converts to stars

1. **Preset scenario chips** (top of controls): `SIDE PROJECT · HN LAUNCH ·
   SERIES A · INSTAGRAM-SCALE`. One click tells a story, and stories are what
   people screenshot and post. Presets are just `ArchitectureInput` values in
   `src/data/` — trivial to add, disproportionate payoff. This is my #1
   non-visual suggestion.
2. **Export as PNG.** "Copy as Mermaid" is for engineers; a `DOWNLOAD PNG`
   button (html-to-image on the flow pane, title block included) is for
   Twitter/LinkedIn. Every exported image with the ArchSketch corner stamp is
   an ad. This is the virality feature.
3. **Share link button** — the URL state already exists (`urlState.ts`), but
   nobody knows. A `SHARE` button that copies the URL (+ a toast "sketch
   copied") turns silent state into a feature.
4. **OG image for the repo/demo** — a proper social-card screenshot (blueprint
   theme, big diagram, cost stamp) so links unfurl attractively in
   Slack/Twitter. Plus README: animated GIF of the slider sweep at the very
   top, demo link, one-line pitch ("drag a slider, watch the architecture and
   AWS bill grow").

---

## E. Smaller polish

- **Legend placement**: the READS/WRITES/ASYNC legend floats over the canvas
  top-left where big diagrams will collide with it; dock it in the bottom
  corner as part of the title block (B3).
- **Cost sensitivity teaser**: under the price, a one-liner like "biggest line:
  App VMs ($2,940)" — pulled from `cost.items` — gives the cost panel a hook
  without opening Assumptions.
- **Focus/hover states**: inputs get a `focus-visible` yellow outline
  (marker-highlight ring) instead of the browser default blue — consistent
  with the theme and better keyboard a11y.
- **Favicon + name lockup**: a 32px yellow highlighter-swipe favicon and the
  same mark in the README. Zero-effort brand consistency.
- **Banner tone**: "Not capacity planning." is charming — keep that voice
  everywhere (button microcopy: `COPIED ✓` → `STOLEN ONTO CLIPBOARD` may be too
  much, but "Reset" → `TEAR OFF SHEET` is on-brand). Personality in microcopy
  is what people quote in HN comments.

---

## Suggested order

| Step | Item | Size |
|---|---|---|
| 1 | Palette fix (A1 or A2) | S |
| 2 | Preset scenario chips (D1) | S |
| 3 | Cost count-up + node enter/exit + async dash animation (C1–C3) | S–M |
| 4 | Diagram-as-hero layout + title block (B1, B3) | M |
| 5 | PNG export + Share button (D2, D3) | M |
| 6 | Blueprint dark theme (A3) | M |
| 7 | Custom slider, stamp animation, margin annotations, polish (C4–C5, B2, E) | S each |
| 8 | README GIF + OG card (D4) | S, do last with final visuals |

Constraint check: no new canvas library (ReactFlow stays), presets live in
`src/data/`, theme stays token-driven in `index.css`, URL sharing builds on the
existing `urlState.ts`. html-to-image (~10KB) would be the only new dependency,
for PNG export.

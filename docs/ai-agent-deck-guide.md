# Authoring HTML decks for Slidewright — guide for AI agents

This is a precise spec for generating `.html` slide decks that import cleanly, edit
correctly, and render **identically** in Slidewright's editor, in Presentation, and in
the exported PDF. Follow it literally.

> TL;DR: One self-contained `.html` file. A `<head><style>` with all CSS. A `<body>`
> with one `<section class="slide">` per slide. **Design every slide for a fixed
> 1280×720 px canvas. Use `px` (or `%`). Never use `vh`/`vw`. No `<script>`, no external
> fonts, no external assets.**

---

## 1. The rendering model (why the rules below matter)

Slidewright treats every slide as a **fixed logical canvas of 1280×720 px (16:9)**.
- The **editor** renders one slide inside a 1280×720 frame.
- **Presentation** renders the deck on a 1280×720 stage and **uniformly scales** it to fill
  the screen (letterbox). It does **not** reflow.
- **PDF export** prints one fixed **1280×720** page per slide.

So: *what you lay out in 1280×720 is exactly what the user sees and prints.* There is no
responsive reflow — design for that single fixed box.

**Resolution is flexible, but the aspect ratio is not.** 1280×720 is the recommended default
(it equals the native PowerPoint 16:9 canvas at 96 dpi: 13.333″×7.5″) and the lightest grid.
You may author at any **16:9** size — e.g. **1920×1080** — as long as you stay consistent: pick
one canvas and lay out *every* slide on it. Slidewright auto-detects a fixed 16:9 deck and adopts
its size on import. To make the size explicit and survive round-trips, declare it once in `<head>`:

```html
<meta name="slidewright:canvas" content="1920x1080">
```

Do **not** mix sizes between slides, and never use a non-16:9 canvas (4:3, A4, …) — it gets
normalized to the default and your layout will shift.

---

## 2. File structure (required)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My deck</title>
  <style>
    /* ALL global CSS goes here */
  </style>
</head>
<body>
  <section class="slide"><!-- slide 1 content --></section>
  <section class="slide"><!-- slide 2 content --></section>
  <!-- ...one <section class="slide"> per slide... -->
</body>
</html>
```

Rules:
- **Each slide = `<section class="slide">`.** This class is the canonical marker the
  importer looks for. (A `<div class="deck">` wrapper around the sections is optional and
  also recognized, but not required.)
- Do **not** add an `active` class yourself — navigation is handled automatically.
- You **may** give a slide a stable `id` (e.g. `id="slide-3"`); it is preserved and you
  can target it in CSS (`#slide-3 .title { ... }`). Use a valid token (letter first, no
  spaces).
- Put **all CSS in one global `<style>` in `<head>`.** (A `<style>` placed *inside* a
  single `<section class="slide">` is allowed and stays scoped to that slide only.)

---

## 3. Sizing & layout — the single most important rule

**Design for 1280×720 px. Use `px` and `%`. NEVER use viewport units.**

- ❌ Banned: `vh`, `vw`, `vmin`, `vmax`, `svh`, `dvh`, `cqw`, … and `width:100vw;height:100vh`.
  Viewport units resolve against the *browser window*, not the 1280×720 canvas, so a slide
  that looks right in the editor will **shift/misalign in Presentation and PDF**. This is
  the #1 cause of "the bottom of the slide moves." (Slidewright warns on import if it
  detects `vh`/`vw`.)
- ✅ Use `px` for sizes, gaps, font-sizes, and absolute offsets.
- ✅ Use `%` for proportions relative to a parent that is itself sized in px.
- The slide box is the positioning context. To place a free element, use
  `position:absolute; left/top/width/height` in **px** (origin = top-left of the slide).
- Keep each slide's content **within 720 px tall.** Overflow is clipped. (There is a manual
  "Fit" that scales an overflowing slide down, but it's better to fit by design.)
- Don't rely on the slide auto-growing to its content; treat 720 px as a hard height.

Recommended slide skeleton:

```css
.slide{
  position:absolute; inset:0;        /* fill the 1280×720 canvas */
  box-sizing:border-box;
  padding:64px 84px;                 /* px, not vh/vw */
  display:flex; flex-direction:column;
  /* background goes here (see §4) */
}
```

To pin something to the bottom, use flex (`margin-top:auto` on the last block, or
`justify-content:space-between`) or `position:absolute; bottom:48px` — all in px. Because
the box is exactly 720 px tall everywhere, the bottom stays put.

---

## 4. Backgrounds

- Put a slide's background on **`.slide`** (or per-id, e.g. `#slide-2{background:…}`).
- A `background` on `body`/`html` also works: Slidewright relocates the body background
  onto the slide stage. But putting it on `.slide` is cleaner and unambiguous.
- Gradients are fine (`linear-gradient`, `radial-gradient`).
- If you set both a `background-color` and a `background-image` (gradient), remember the
  image paints **on top of** the color.

---

## 5. Fonts, images, scripts — hard constraints

- **No `<script>`.** Scripts are stripped on import and never exported (safety). Don't rely
  on JS for layout, animation, or slide logic.
- **No external fonts.** `@import` to Google Fonts and `<link>` web-fonts are removed
  (privacy). Use a **system font stack**, e.g.:
  ```css
  font-family:-apple-system,"Segoe UI","SF Pro Text","Helvetica Neue",Arial,sans-serif;
  /* or a serif stack: Charter,"Iowan Old Style",Palatino,Georgia,serif */
  ```
- **No external assets.** Don't reference network URLs for images/CSS. **Inline images as
  `data:` URIs (base64).** Inline SVG is great and lightweight.
- Avoid `position:fixed` for content (it's fine, it gets trapped in the slide stage, but
  `absolute` within the slide is clearer).
- `!important` is honored, but don't sprinkle it — it makes the deck harder to restyle.

---

## 6. What the editor lets the user do (author so it stays editable)

- Text in normal elements is directly editable. Keep text in real elements (`<h1>`, `<p>`,
  `<li>`…), not baked into images.
- Boxes/cards the user may recolor: give them a plain `background` (solid or gradient) on
  the element itself, so the fill control works predictably.
- Each top-level visual element should be a distinct node (not one giant nested blob), so it
  can be selected, moved, recolored, duplicated.

---

## 7. Export behavior (so you know the target)

- **Presentation / exported HTML**: deck on a 1280×720 stage, uniformly scaled to the
  screen; arrow keys / on-screen arrows navigate; first slide active.
- **PDF**: one 1280×720 page per slide, exact 16:9. Viewport units would break here too —
  another reason to stick to px/%.
- A small HTML comment crediting Slidewright is added to exports (harmless, invisible).

---

## 8. Minimal valid template (copy, then fill in)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Deck title</title>
  <style>
    :root{ --bg:#0e1116; --fg:#f2efe9; --accent:#b45309; }
    html,body{ margin:0; }
    .slide{
      position:absolute; inset:0; box-sizing:border-box;
      padding:64px 84px; display:flex; flex-direction:column;
      font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;
      color:var(--fg);
      background:radial-gradient(circle at 78% 12%,#243246 0%,var(--bg) 60%);
    }
    .slide h1{ font-size:54px; line-height:1.05; margin:0 0 16px; }
    .slide p, .slide li{ font-size:22px; line-height:1.5; }
    .card{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.14);
           border-radius:14px; padding:24px; }
    .footer{ margin-top:auto; font-size:16px; opacity:.7; }   /* sticks to the bottom */
  </style>
</head>
<body>
  <section class="slide">
    <h1>Title slide</h1>
    <p>Subtitle in plain text so it stays editable.</p>
    <div class="footer">Bottom strip — fixed at 720&nbsp;px, never drifts.</div>
  </section>

  <section class="slide">
    <h1>Second slide</h1>
    <div class="card"><p>A card the user can recolor.</p></div>
    <div class="footer">Footer</div>
  </section>
</body>
</html>
```

---

## 9. Design quality — make it look bespoke (non-negotiable)

Conformance gets a deck to import and render correctly. **These rules make it look good.** A deck
must feel hand-made for *this* topic, not template-generated. Commit to one bold aesthetic
direction (editorial, brutalist, refined-minimal, retro-futuristic, …) and carry it across the deck.

❌ **Never**
- Inter, Roboto, Arial, Space Grotesk (and other generic "AI-deck" fonts).
- Purple gradient on white.
- The default 8px SaaS `border-radius`.
- A generic, template-looking palette.

✅ **Always**
- A characterful **display font + a separate body font** (system stacks only — see §5). Good
  system serifs: Charter, "Iowan Old Style", Palatino, Georgia. A monospace stack works well as a
  technical accent.
- One **dominant palette + a single sharp accent** (e.g. amber `#b45309` for data callouts).
- **Visual depth**: subtle noise texture, gradient mesh, layered transparencies, dramatic shadows
  — not flat solid fills.
- **Spatial tension**: asymmetry, overlap, grid-breaking, generous negative space (or controlled
  density). Avoid the dead-centered, evenly-padded template look.
- Small radius (4px) or 0 for editorial; 12–16px only when the direction is playful/soft.

(Motion: the export/Presentation runtime handles slide-to-slide transitions; honor
`prefers-reduced-motion` if you add any CSS transition. Do **not** add entrance animations on the
slide *content* — they don't survive PDF and break editor/PDF parity. Slides are static frames.)

---

## 10. Slide layout catalog (12 reusable patterns)

Build slides from these patterns. All are pure positioned `px`/flex blocks on the fixed canvas —
no responsive grid needed. Vary them; don't repeat the same one back-to-back.

| # | Layout | Typical use |
|---|--------|-------------|
| 1 | Cover | Deck title |
| 2 | Agenda / TOC | Section index |
| 3 | Two columns | Comparison, text + image |
| 4 | Stats grid | KPIs, key numbers |
| 5 | Bento features | 3–6 features in an asymmetric grid |
| 6 | A/B compare | Options, before/after |
| 7 | Timeline | Roadmap, history |
| 8 | Chart | Data viz — **author it as inline `<svg>`** (the tool preserves SVG but has no chart generator; never use an external chart lib or `<canvas>`+JS) |
| 9 | Quote | One emphasized quotation |
| 10 | Full-bleed image | Hero photo with overlaid text (the bleed is decorative; keep the *readable* text inside the canvas) |
| 11 | List | Long structured bullets |
| 12 | Closing / CTA | Call to action, contacts |

---

## 11. Design tokens & incremental edits

- **Keep design tokens in one `:root` block** inside the single `<head><style>` (colors, fonts,
  spacing as CSS custom properties), and reference them everywhere (`var(--accent)`). This gives the
  "separate theme from content" benefit — you can restyle the whole deck by editing a handful of
  variables — **without** an external `theme.css` (which would break the self-contained file).
- **Editing one slide:** each `<section class="slide">` is independent. To change slide 4 only,
  rewrite that one section (and, if needed, add `#slide-4`-scoped rules in the global style); leave
  the other sections byte-for-byte untouched. Don't renumber or reflow the rest.

---

## 12. Anti-patterns imported from other slide tools (do NOT do these here)

Other "slides with Claude" workflows assume a different model. These break Slidewright:

- ❌ **External `theme.css` / `assets/` folder.** Everything is one self-contained `.html`: CSS
  inline in `<head>`, images as `data:`/inline SVG. External files won't load from `file://`.
- ❌ **Hand-written scaling/navigation `<script>`** (the `transform:scale` resizer, arrow-key
  handler, slide show/hide logic). Slidewright **injects its own trusted runtime on export** and
  strips author scripts on import — so don't write it, and don't rely on it surviving. Just emit
  plain `<section class="slide">`; scaling + arrow/button nav come for free.
- ❌ **`display:none` to hide inactive slides.** Don't manage visibility at all — the tool/export
  does it (and `display:none` interferes with overflow fitting). No `active` class either.
- ❌ **PPTX pipelines** (`html2pptx`, LibreOffice, `python-pptx`, `extract-pptx.py`), **Vercel
  deploy**, **Playwright PDF**. Out of scope: Slidewright is 100% local, HTML in → HTML + PDF out
  (PDF via the browser's own print engine). The PDF button replaces all of that.

---

## 13. Agent checklist before returning the file

- [ ] One `.html` file, valid `<!DOCTYPE html>`, all CSS in one `<head><style>`.
- [ ] Every slide is `<section class="slide">`. No manual `active`, no show/hide logic.
- [ ] **Zero** `vh`/`vw`/`vmin`/`vmax` anywhere. Sizes in `px`/`%`.
- [ ] One consistent **16:9** canvas (1280×720 default, or declared via `<meta name="slidewright:canvas">`); same size on every slide.
- [ ] Every slide's content fits within the canvas height (nothing meant to overflow).
- [ ] No `<script>` (no hand-written scaler/nav). No external fonts/`@import`. No external asset URLs or `theme.css` (images inlined as `data:`/SVG; tokens in `:root`).
- [ ] Bottom/edge elements pinned with flex or `position:absolute … px` (not viewport units).
- [ ] System-font stack only — characterful display + body font; one dominant palette + one sharp accent; no Inter/Roboto/Arial, no purple-on-white, no 8px radius.
- [ ] Charts authored as inline `<svg>` (no chart libs / `<canvas>`).
- [ ] Text lives in real text elements (editable), not inside images.

# Slidewright — Slide Format Specification (canonical)

> **Status: CONFIRMED (canonical).** This is the single source of truth for the deck
> format. It serves two purposes: (1) the **authoring contract** for creating decks
> correctly from the start (humans and AI agents), and (2) the **target** the
> import/conversion normalizes any deck *to*. Normative keywords: **MUST / SHOULD / MAY /
> MUST NOT**. Decisions D1–D4 (§15) are settled.
>
> Companion: `ai-agent-deck-guide.md` (friendly quick version) points here for the rules.
>
> **Standalone navigation** (exported `.html`, no Slidewright needed): keyboard arrows
> `← →` (+ PageUp/Down, Space, Home/End) and on-screen **‹ / ›** buttons (mouse). No
> click-to-advance (it would break text selection). The nav runtime is baked into the file.

---

## 1. Canvas & coordinate system

- A deck is a sequence of **slides**. Every slide is a **fixed canvas of 1280 × 720 px**
  — i.e. **16:9**, identical to PowerPoint widescreen (13.333″ × 7.5″ @ 96 DPI).
- Origin `(0,0)` is the **top-left** of the slide; **X** grows right, **Y** grows down.
- All geometry is authored in this **fixed pixel space**. At display time the whole canvas
  is scaled **uniformly** (same factor on X and Y, proportions locked) to fit the screen /
  editor pane / PDF page. **There is no reflow and no per-screen adaptation** — a deck looks
  identical on any display, like a `.pptx`.
- Consequence: the **absolute pixel value is irrelevant on screen** (only the 16:9 ratio
  matters); 1280×720 is the canonical authoring size and the unit basis for everything below.

## 2. File & document structure

- A deck **MUST** be a single, self-contained `.html` file, UTF-8, starting with
  `<!DOCTYPE html>`.
- `<head>` **MUST** contain all global CSS in one `<style>`. It **SHOULD** contain a
  `<title>` (the deck title) and `<html lang="…">`.
- `<body>` **MUST** contain one `<section class="slide">` per slide, in order. A single
  wrapping `<div class="deck"> … </div>` around the sections is **OPTIONAL** (also accepted).
- Authors **MUST NOT** add the `active` class (slide visibility is tool-managed).
- A slide **MAY** carry a stable `id` (a valid token: letter first, no spaces) so CSS can
  target it per-id (`#slide-3 .title { … }`). The id is preserved on import/export.
- Slides **MUST NOT** be nested inside other slides.
- The document **MUST NOT** contain `<script>` (see §9).

## 3. The slide element (the fixed box)

- Each `<section class="slide">` is rendered as a **fixed 1280×720 box, anchored at the
  top-left**, with no transform. The tool **enforces** this (it overrides any `width`,
  `height`, `position`, `top/left`, `transform` the deck sets on the slide root). Authors
  **SHOULD NOT** set those on `.slide` — they will be ignored.
- All of a slide's content **MUST** fit within 1280×720. Content beyond the box is
  **clipped** (never shrunk/reflowed to fit). Author within the box.
- A slide's background **SHOULD** be set on `.slide` (or per-id). See §6.

## 4. Units — the core rule

- Authors **MUST** use **`px`** for sizes, positions, font-sizes, gaps, radii, borders, etc.
- **`%`** **MAY** be used relative to a parent that is itself sized in px.
- **`rem` / `em`** **MAY** be used (they scale with the canvas), but **`px` is preferred**
  for predictability.
- Authors **MUST NOT** use **viewport- or container-relative units**:
  `vw, vh, vmin, vmax, svw, svh, lvw, lvh, dvw, dvh, vi, vb, cqw, cqh, cqi, cqb, cqmin, cqmax`.
  Rationale: the canvas is scaled as a whole; viewport units resolve against the *device*,
  not the canvas, so they break the "identical on every screen" guarantee and **do not work
  in the PDF export** (which has no scaling container). This is the #1 cause of slides that
  "shift" between editor and projection.
- `position:fixed` **SHOULD NOT** be used for content (use `position:absolute`).

## 5. Layout & positioning

- Both **flow layout** (flex / grid, in px) and **absolute positioning** are supported.
- A **free element** is `position:absolute` with `left/top/width/height` in **px**, relative
  to the slide's top-left.
- To pin something to an edge, use flex (`margin-top:auto`, `justify-content:space-between`)
  or `position:absolute; bottom:Npx / right:Npx` — all in px. Because the box is exactly
  720×1280, edges are stable.
- Use `z-index` for stacking order of overlapping elements.

## 6. Backgrounds & color

- A slide background **SHOULD** be declared on `.slide` (or `#slide-N`). Solid colors and
  CSS gradients (`linear-gradient`, `radial-gradient`) are fine.
- A background set on `body`/`html` is **relocated onto the slide** by the tool (works), but
  declaring it on `.slide` is clearer and **preferred**.
- Remember: a `background-image` (incl. gradients) paints **on top of** `background-color`.
- Avoid unnecessary `!important` on backgrounds. (The editor's fill control can override it,
  but clean CSS keeps the deck easy to restyle.)

## 7. Typography / fonts

- Authors **MUST** use **system font stacks**. External web fonts (`@import` to Google
  Fonts, `<link>` stylesheet fonts) are **stripped on import** (privacy + portability).
- Recommended stacks:
  - Sans: `-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif`
  - Serif: `Charter,"Iowan Old Style",Palatino,Georgia,serif`
  - Mono: `ui-monospace,Menlo,"SF Mono",Consolas,monospace`
- Font sizes in `px` (or `rem`).

## 8. Images & media

- Images **MUST** be embedded as `data:` URIs (base64) or inline `<svg>`. External URLs
  (`http(s)://…`, relative file paths) **MUST NOT** be used: they are not portable, not
  fetched offline, and may be stripped.
- Give images an explicit px size (or place them in a fixed-size box with `object-fit`) for
  predictable layout.
- Inline SVG is encouraged for icons/diagrams (lightweight, recolorable via `currentColor`).

## 9. Scripts & interactivity

- The document **MUST NOT** contain `<script>`, inline event handlers (`on*=`), or
  `javascript:` URLs. They are removed on import and never exported. **Slides are static.**

## 10. Animations / transitions

- A slide is a **static snapshot**. The tool controls slide visibility during a
  presentation, so any `transition`/`transform`/keyframe **entrance/build animation** on the
  slide root is **neutralized**. Authors **SHOULD NOT** rely on animations or builds.
- Purely decorative element-level CSS is allowed but will not "play".

## 11. Editability (author so the tool can edit cleanly)

- Put text in **real text elements** (`<h1>`, `<p>`, `<li>`, …), **not baked into images**,
  so it stays editable.
- Use **one distinct node per distinct visual element** (so each is selectable, movable,
  recolorable, duplicable). Avoid one monolithic nested blob.
- For a box/card the user may recolor, give it a plain `background` on the element itself.

## 12. Decorative bleed vs content overflow

- Decorative elements (a graphic that intentionally bleeds off an edge) **MAY** extend
  beyond the canvas **only** if `position:absolute`/`fixed` — the overflow check ignores
  those subtrees.
- **Actual content** (text, cards, in-flow elements) **MUST** stay within 1280×720.

## 13. Per-slide vs global CSS

- Global styles go in the `<head>` `<style>`.
- A `<style>` placed **inside a single `<section class="slide">`** is allowed and stays
  **scoped to that slide** (it does not leak to the others).

## 14. Conversion contract (normalize any input → this spec)

The importer/converter turns a non-conforming deck into a conforming one. Target = §1–§13.
Mapping per non-conformance:

| Input non-conformance | Conversion |
|---|---|
| 16:9 deck of a different px size (1920×1080, 960×540) | **Uniform rescale** to 1280×720 — handled as the deck's **canvas dimension**, not a transform (no distortion). |
| Non-16:9 aspect (e.g. 4:3) | **Letterbox**: uniform scale to fit 1280×720, neutral bars fill the remainder. *(see D1)* |
| `vh/vw/…` units | Resolve against the authored canvas and **rewrite to px**. |
| Content taller than 720 px | **Reflow / scale down** to fit *(hard case — later phase)*. |
| External fonts (`@import`/`<link>`) | **Strip** → fall back to a system stack. |
| `<script>` / inline handlers | **Strip**. |
| Background on `body`/`html` | **Move** onto `.slide`/stage. |
| Missing `class="slide"` on sections | **Tag** sections as slides (or open as document mode). |

This table is the contract the conversion phase implements. The "easy half" (size/aspect,
units, fonts, scripts, bg) is mechanical; the "hard half" (content taller than 720 → reflow)
is the genuinely difficult part and is scheduled last.

## 15. Decisions (confirmed)

- **D1 — Aspect ratios. ✅ 16:9 only.** The canonical canvas is **16:9 (1280×720)**.
  4:3 / other aspects are **letterboxed** (uniform scale + neutral bars), never stretched.
  No native 4:3 canvas mode.
- **D2 — Static only. ✅** Slides are **static**: no animations/builds, no JS.
- **D3 — rem/em. ✅ Allowed**, with **`px` preferred** for predictability.
- **D4 — Letterbox bars. ✅ Black** (matches the presentation letterbox).

## 16. Minimal conforming template

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
      /* the tool fixes the box to 1280×720; style only the look here */
      box-sizing:border-box; padding:64px 84px;
      display:flex; flex-direction:column;
      font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;
      color:var(--fg);
      background:radial-gradient(circle at 78% 12%,#243246 0%,var(--bg) 60%);
    }
    .slide h1{ font-size:54px; line-height:1.05; margin:0 0 16px; }
    .slide p, .slide li{ font-size:22px; line-height:1.5; }
    .card{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.14);
           border-radius:14px; padding:24px; }
    .footer{ margin-top:auto; font-size:16px; opacity:.7; } /* pinned to the 720px bottom */
  </style>
</head>
<body>
  <section class="slide">
    <h1>Title</h1>
    <p>Subtitle in real text (stays editable).</p>
    <div class="footer">Bottom strip — fixed at 720&nbsp;px, never drifts.</div>
  </section>
  <section class="slide" id="slide-2">
    <h1>Second slide</h1>
    <div class="card"><p>A recolorable card.</p></div>
  </section>
</body>
</html>
```

## 17. Conformance checklist

- [ ] One self-contained `.html`; all CSS in one `<head><style>`.
- [ ] Every slide is `<section class="slide">`; no manual `active`; no nested slides.
- [ ] Designed for **1280×720**; all content fits within the box.
- [ ] **Zero** `vh/vw/vmin/vmax/cq*` units; sizes in `px` (or `%`/`rem`).
- [ ] No `<script>`, no `on*=` handlers; no external fonts; no external asset URLs (images
      inlined as `data:`/SVG).
- [ ] Edges pinned with flex or `position:absolute … px`.
- [ ] System-font stacks only; text in real text elements (not images).
- [ ] Decorative bleed only via `position:absolute/fixed`.

<p align="center">
  <img src="assets/social-preview.png" alt="Slidewright — local visual editor for HTML slide decks" width="760" />
</p>

<h1 align="center">Slidewright</h1>

<p align="center">
  <b>Edit HTML slide decks like PowerPoint — 100% local. No cloud, no sign-up, no upload.</b>
</p>

<p align="center">
  <a href="https://valeriodolci.github.io/slidewright/"><b>▶ Try it live</b></a> ·
  <a href="https://github.com/ValerioDolci/slidewright/releases/latest/download/slidewright.html"><b>⬇ Download (1 file)</b></a> ·
  <a href="README.it.md">Italiano</a>
</p>

<p align="center">
  <a href="https://github.com/ValerioDolci/slidewright/releases/latest"><img src="https://img.shields.io/github/v/release/ValerioDolci/slidewright?color=b45309&label=release" alt="latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-b45309" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/runtime%20deps-0-b45309" alt="zero runtime dependencies" />
  <img src="https://img.shields.io/badge/data-stays%20on%20your%20machine-b45309" alt="local-first" />
</p>

<!--
  TODO Valerio: registra la GIF demo (10-15s) e salvala in assets/demo.gif, poi
  scommenta il blocco qui sotto. Storyboard in docs/launch/gif-storyboard.md.
<p align="center"><img src="assets/demo.gif" alt="Slidewright in action" width="760" /></p>
-->

---

## Why Slidewright?

You ask an AI to "make me a slide deck" and it hands you a single `.html` file.
It looks great — until you need to fix a typo, move a box, or export a clean PDF.
Your options today are: re-prompt the AI and hope, or hand-edit raw HTML.

**Slidewright is the missing visual editor for those decks.** Open the `.html`,
drag things around like in PowerPoint, type over the text, export a pristine
HTML or a pixel-perfect 16:9 PDF. Everything runs in your browser, on your
machine — the deck never leaves your laptop.

- 🔒 **Local-first.** No server, no account, no telemetry, no Google Fonts. The file stays with you.
- 🪶 **Zero runtime dependencies.** One self-contained HTML file (~140 KB). Double-click and go.
- 🎯 **Real editing, not a viewer.** Move/resize/rotate, recolor, crop images to shapes, undo/redo.
- 🖨 **Clean export.** Standalone navigable HTML + dependency-free PDF (1 slide = 1 page, true 16:9).
- 🤝 **Two shells, one engine.** Runs as a web app *and* as a VS Code extension.

## Try it in 30 seconds

1. **[Open the live editor](https://valeriodolci.github.io/slidewright/)** (nothing is uploaded — it runs in your tab), **or**
2. **[Download `slidewright.html`](https://github.com/ValerioDolci/slidewright/releases/latest/download/slidewright.html)** and double-click it — it runs straight from `file://`.

Drag a `deck.html` onto the window (or hit **Open**) and start editing.

## Usage

### Development (modular sources)
```bash
npm install
npm run dev        # http://localhost:5173
```

### Distribution (1 file, double-click, no server)
```bash
npm run build:single   # → dist/index.html standalone (JS+CSS inlined)
```
Open `dist/index.html` with a double-click: the editor runs from `file://`.

`npm run build` instead produces the multi-file output in `dist/` (for debugging).

### VS Code extension (slidewright)

The same editor also runs as a VS Code extension (same `core`/`ui`, different
shell). Open an `.html` file with **"Open With… → Slidewright"** (opt-in: the text
editor stays the default). Saving = a VS Code document (native dirty/⌘S/undo); the
agent chat uses **Copilot via `vscode.lm`** (no keys, no CORS) with a fallback to
openai-compatible providers called from the extension host.

```bash
npm run build:vscode          # bundles the webview into extension/media/
cd extension
npx @vscode/vsce package --no-dependencies   # → slidewright-<version>.vsix
code --install-extension slidewright-0.1.0.vsix
```

## What it does

| Layer | Feature |
|---|---|
| **L1 — Reorder** | Sidebar thumbnails, drag & drop (SortableJS), duplicate / delete / new |
| **L2 — Text** | Double-click an element → inline `contenteditable` |
| **L3 — Graphics** | Click → selection with move/resize/rotate handles; properties panel (font, size, weight, colour, alignment, background, radius, opacity, padding, z-index); add text / shapes / icons / image (crop to shape); **undo/redo**; nudge with arrow keys |
| **Open / Save** | Open an `.html` file and **save straight back to it** (File System Access API, Chromium) with autosave; ⌘S. Download fallback on Firefox/Safari |
| **Clipboard** | ⌘C / ⌘V / ⌘D copy / paste / duplicate element; format painter |
| **Theme** | Light/dark toggle (☾/☀), remembered; the canvas shows the deck with its own style |
| **Export HTML** | Clean, standalone, navigable deck (arrows/click), re-openable from the editor and from an AI |
| **Export PDF** | Browser print with `@page` 16:9 (960×540pt) → 1 slide = 1 page, identical format |
| **Import** | Drop a `deck.html` (or "Open"): parses `<style>` + `<section class="slide">` |
| **AI chat (optional)** | Provider-neutral agent (OpenAI-compatible: Mistral / OpenRouter / Ollama / LM Studio…; Copilot in VS Code) that edits the deck via tool calls |

## Tests

```bash
bash tests/run.sh          # core module regression (python3 + Chrome, no npm deps)
bash tests/run-webview.sh  # VS Code shell smoke test: simulates the webview (real CSP +
                           # acquireVsCodeApi mock) and validates rendering + document cycle
```

## Architecture

Vanilla web (ES modules), no framework. **The same `core`/`ui` runs in two shells**
thanks to a *platform layer* (host adapter): `web` (browser) and `vscode` (the
extension webview). Built with Vite + `vite-plugin-singlefile`.

```
src/
  core/
    model.js        Deck/Slide data model (intermediate JSON) + default theme
    store.js        Central state + undo/redo history (snapshots) + pub/sub
    import.js       deck.html → model
    export-html.js  model → clean HTML (strips editor attributes + runtime nav)
    export-pdf.js   model → @page 16:9 print (PDF from the browser)
    sanitize.js · assets.js · agent.js · llm.js     security, image pool, agent
  platform/
    index.js        Platform contract (host adapter): file/export/llm/storage/confirm
    web.js          Browser impl: File System Access, LLM fetch, window.print, localStorage
    vscode.js       Webview impl: postMessage RPC to the extension host; storage = webview state
  ui/
    app.js          Orchestrator (host-agnostic: uses only `platform`)
    layout.js       SHARED workspace markup for web + webview (no duplication)
    stage.js        <iframe> canvas (isolates the deck's styles), scaling, text editing
    sidebar.js · selection.js · inspector.js · chat.js
  util/             dom, id
  styles/           tokens.css + editor.css ("Atelier drafting-cockpit")
apps/
  vscode/index.html Webview entry (shell that mounts `layout` + the vscode platform)
extension/          VS Code extension (Node): Custom Editor + vscode.lm + messaging
  extension.js · package.json (manifest) · media/ (webview bundle, generated)
```

### Design choices
- **Fixed logical canvas 1280×720** (16:9), scaled to screen: dragging in absolute
  coordinates is safe.
- **JSON model as the source of truth**; the DOM in the iframe is the *editing view*.
  It is serialized back to the model on every commit → robust undo/redo and export.
- **Snapshot undo/redo** of the model (cap 120).
- **"Free" elements**: an in-flow element is converted to `position:absolute` by
  *freezing* its current geometry on the first move/resize (or via "Make free"),
  enabling manual positioning without breaking the imported layout.
- **Inline base64 images** → a self-contained deck in a single file.
- **Dependency-free PDF**: the browser's print engine (no Puppeteer/weasyprint).
  Enable *"Background graphics"* in the print dialog for backgrounds.

## Notes
- The editor's internal attributes (`data-ss-eid`, `contenteditable`, `ss-*` classes)
  are removed on export: the output HTML is clean.
- Primary target: **decks** (`<section class="slide">`). Long HTML documents are a
  secondary case (imported as a single slide).

## License

[MIT](LICENSE) © Valerio Dolci

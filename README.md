# Slidewright

**English** · [Italiano](README.it.md)

A **local** visual editor for HTML slide decks — reorder, text editing,
graphic editing (a mini-PowerPoint) and **HTML + PDF** export in the same 16:9
format. No cloud, no external APIs, no Google Fonts.

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
| **L3 — Graphics** | Click → selection with move/resize handles; properties panel (font, size, weight, colour, alignment, background, radius, opacity, padding, z-index); add text / rectangle / image; **undo/redo**; nudge with arrow keys |
| **Open / Save** | Open an `.html` file and **save straight back to it** (File System Access API, Chromium) with autosave; ⌘S. Download fallback on Firefox/Safari |
| **Clipboard** | ⌘C / ⌘V / ⌘D copy / paste / duplicate element |
| **Theme** | Light/dark toggle (☾/☀), remembered; the canvas shows the deck with its own style |
| **Export HTML** | Clean, standalone, navigable deck (arrows/click), re-openable from the editor and from Claude |
| **Export PDF** | Browser print with `@page` 16:9 (960×540pt) → 1 slide = 1 page, identical format |
| **Import** | Drop a `deck.html` (or "Open"): parses `<style>` + `<section class="slide">` |

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

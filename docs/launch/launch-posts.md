# Bozze di lancio — Slidewright

> Angolo di posizionamento scelto: **local-first / "l'editor che manca per i deck
> generati dall'AI"**. È l'hook più forte: tocca un dolore reale (AI sputa un .html,
> poi non lo puoi editare) ed è esattamente ciò che la nicchia anti-SaaS premia.

---

## 1) Show HN (Hacker News) — il colpo grosso

**Quando**: martedì–giovedì, ~15:00–17:00 CET (mattina USA). Solo DOPO che la GIF è nel README.
**Titolo** (campo title, max ~80 char — niente emoji, niente hype):

```
Show HN: Slidewright – a local visual editor for AI-generated HTML slide decks
```

**Primo commento** (lo posti tu subito dopo, è dove si gioca la partita):

```
Hi HN, I'm Valerio.

AI tools are great at generating slide decks as a single self-contained .html
file. The problem starts right after: you spot a typo, you want to move a box or
fix a colour, and your only options are to re-prompt and hope, or hand-edit raw
HTML.

Slidewright is the missing visual editor for those decks. You open the .html and
edit it like in PowerPoint — reorder slides (drag & drop), edit text inline,
move/resize/rotate elements, recolour, crop images to shapes, undo/redo — then
export a clean standalone HTML or a true-16:9 PDF (1 slide = 1 page).

It's deliberately local-first: no server, no account, no telemetry, no Google
Fonts. The whole thing is a single ~140 KB HTML file with zero runtime
dependencies — you can download it and double-click it; it runs from file://.
Your deck never leaves your machine. There's also a VS Code extension that shares
the same engine.

Some implementation notes that might interest this crowd:
- The deck renders inside a sandboxed <iframe> so its CSS can't leak into the
  editor (and vice versa). A fixed 1280×720 logical canvas is scaled to screen,
  so absolute-coordinate dragging stays correct.
- The source of truth is a JSON model; the iframe DOM is just the editing view,
  re-serialized on every commit → snapshot undo/redo and clean export.
- PDF export uses the browser's own print engine (no Puppeteer / headless
  Chrome / weasyprint), with @page 16:9 so one slide maps to one page.
- It's vanilla ES modules, no framework, bundled to a single file with Vite +
  vite-plugin-singlefile.

Try it live (nothing is uploaded): https://valeriodolci.github.io/slidewright/
Code (MIT): https://github.com/ValerioDolci/slidewright

Happy to answer anything — and very curious whether the iframe-as-canvas
approach has failure modes I haven't hit yet.
```

**Regole HN**: rispondi a TUTTI i commenti nelle prime 2 ore, con tono tecnico e
umile. Non chiedere upvote da nessuna parte (penalità). Non ripostare se floppa: aspetta settimane e cambia angolo.

---

## 2) LinkedIn (hai già la base del 23/06)

```
Le AI generano deck di slide bellissimi… in un singolo file .html.
Poi vuoi correggere un refuso o spostare un box — e ti ritrovi a editare HTML a mano.

Ho costruito Slidewright per chiudere quel buco: apri l'.html e lo editi come in
PowerPoint. Riordini le slide, scrivi sul testo, sposti/ruoti/ricolori gli elementi,
ritagli le immagini in forme, undo/redo — poi esporti un HTML pulito o un PDF 16:9.

La parte di cui vado più fiero: è 100% locale. Niente cloud, niente account, niente
telemetria. Un solo file da ~140 KB, zero dipendenze: lo scarichi e fai doppio click.
Il tuo deck non lascia mai il computer.

▶ Provalo (non carica niente): https://valeriodolci.github.io/slidewright/
⭐ Codice, MIT: https://github.com/ValerioDolci/slidewright

[allega la GIF / un video di 15s]

#opensource #localfirst #webdev #ai #productivity
```

---

## 3) Reddit — un subreddit alla volta, NON tutti insieme, adatta il tono

I subreddit odiano il copia-incolla cross-post e la promozione. Posta come "l'ho
costruito, feedback?", non come pubblicità. Distanzia i post di qualche giorno.

- **r/selfhosted** — angolo privacy/local-first (il loro pane). Titolo:
  `I built a local-first visual editor for HTML slide decks — no cloud, single file, runs from file://`
- **r/webdev** — angolo tecnico (iframe-as-canvas, JSON model, vanilla, zero deps).
- **r/opensource** — angolo "MIT, vanilla, no dependencies".
- **r/javascript** — solo se ti va di parlare dell'architettura; pubblico esigente.
- **r/coolgithubprojects**, **r/SideProject** — vetrina, più tolleranti.

Template breve:
```
Title: Slidewright — a local, single-file visual editor for AI-generated HTML slide decks

AI tools hand you a deck as one .html file, then you're stuck hand-editing HTML to
fix anything. Slidewright opens that file and lets you edit it like PowerPoint
(reorder/text/move/resize/recolour, undo/redo), then export clean HTML or a 16:9 PDF.

100% local — no server, no account, single ~140KB file, zero runtime deps, runs from
file://. Vanilla JS, MIT.

Live (nothing uploaded): https://valeriodolci.github.io/slidewright/
Code: https://github.com/ValerioDolci/slidewright

Feedback welcome, especially edge cases in decks it fails to import cleanly.
```

---

## 4) Product Hunt — secondo step, dopo HN/Reddit

- Lancia di **martedì o mercoledì, 00:01 PST**. Serve: tagline, 3–5 screenshot/GIF,
  prima descrizione, e idealmente qualche "hunter"/follower avvisato.
- Tagline: `Edit AI-generated HTML slide decks like PowerPoint — 100% local`.
- Riusa la GIF + il banner social-preview.png.
- Prepara 3–4 frasi di "maker comment" (la stessa storia del primo commento HN, più breve).

---

## Ordine consigliato e perché

1. **GIF nel README** (precondizione di tutto: senza, gli altri canali sprecano traffico).
2. **Show HN** (il canale con più upside per un dev-tool local-first; un solo colpo, fallo bene).
3. **Reddit** (1 subreddit alla volta, distanziati).
4. **LinkedIn** (rete tua + GIF).
5. **Product Hunt** (quando hai già un po' di prova sociale: stelle, commenti).

> ⚠️ Niente da fare in autonomia qui: questi li pubblichi tu, con i tuoi account.
> Io ho preparato i testi e la vetrina del repo. Dimmi se vuoi che limi un testo
> specifico o che cambi angolo (es. spingere di più sul "VS Code extension" o sul
> "mini-PowerPoint" invece del local-first).

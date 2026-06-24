# compare-html-pdf — confronto fedeltà HTML export ↔ PDF

Confronta, slide per slide, il render **HTML export** e il **PDF** campionando **100 punti
equidistanti** (griglia 10×10). Una slide è "OK" se tutti e 100 i punti combaciano entro
la tolleranza (default Δ≤24 per canale).

## Come funziona (pipeline)
1. Render HTML: per ogni slide `buildDeckHtml({...deck, slides:[slide]})` in un iframe-stage
   1280×720, animazioni assestate → screenshot.
2. PDF: `buildPrintHtml(deck)` → Chrome `--print-to-pdf` → ogni pagina renderizzata (PyMuPDF).
3. Confronto: 100 punti (x=(j+.5)/10·1280, y=(k+.5)/10·720) → |Δ|max per canale > tol = fail.

## Requisiti
Chrome headless, Python venv con `Pillow`, `PyMuPDF` (fitz), `numpy`.

## Uso
`bash tools/compare-html-pdf.sh <deck.html>` → report per-slide (N/100) + lista punti che differiscono.

## Nota di interpretazione
Differenze **isolate ai box semitrasparenti/gradienti** = rendering screen-vs-print di Chrome
(compositing alpha), non un bug del codice né uno scostamento di layout (verificabile con lo
shift-test: se riallineando di pochi px i fail non calano, è colore, non posizione).
Per garantire identità pixel-perfetta serve un PDF **raster** (pagina = immagine della slide).

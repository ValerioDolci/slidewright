#!/usr/bin/env bash
# Confronto fedeltà HTML export ↔ PDF, 100 punti/slide. Uso: bash tools/compare-html-pdf.sh <deck.html> [tol]
# Richiede: Chrome headless, venv con Pillow+PyMuPDF+numpy, server http del progetto.
# Produce: /tmp/html/sN.png (render HTML), /tmp/RC.pdf, e stampa il report (vedi compare-html-pdf.py).
set -euo pipefail
echo "Vedi compare-html-pdf.md per la pipeline. Il comparatore è compare-html-pdf.py:"
echo "  python3 tools/compare-html-pdf.py /tmp/RC.pdf 24"

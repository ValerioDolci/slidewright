#!/usr/bin/env bash
# Smoke test del guscio WEBVIEW VS Code, headless e senza VS Code: builda il
# bundle, genera un harness che simula l'extension host (CSP reale + mock di
# acquireVsCodeApi) e verifica in Chrome che lo stage-iframe renderizzi la slide.
#
# Requisiti: node + python3 + Google Chrome.  Uso:  bash tests/run-webview.sh
set -euo pipefail

cd "$(dirname "$0")/.."
PORT=5182
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "Chrome non trovato (imposta la variabile CHROME)"; exit 2
fi

echo "→ build webview"
npm run build:vscode >/dev/null 2>&1
echo "→ genero harness"
node tests/webview-smoke.mjs

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  curl -fs "http://localhost:$PORT/" >/dev/null 2>&1 && break || sleep 0.25
done

OUT="$("$CHROME" --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=6000 --dump-dom \
  "http://localhost:$PORT/tests/_webview-harness.gen.html" 2>/dev/null)"

LINE="$(printf '%s' "$OUT" | grep -o 'RISULTATO: [0-9]* pass, [0-9]* fail' | tail -1 || true)"
echo "${LINE:-nessun risultato (timeout?)}"
printf '%s' "$OUT" | grep -oE '(PASS|FAIL|EXCEPTION)[^<]*' || true

if printf '%s' "$OUT" | grep -q 'RISULTATO: [0-9]* pass, 0 fail'; then
  echo "✅ OK"; exit 0
else
  echo "❌ FALLITO"; exit 1
fi

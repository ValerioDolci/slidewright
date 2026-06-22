#!/usr/bin/env bash
# Self-test dei moduli core (regressione). Niente dipendenze npm extra:
# serve i sorgenti con `python3 -m http.server` e legge il risultato dal DOM
# renderizzato da Chrome headless (--dump-dom).
#
# Requisiti: python3 + Google Chrome.  Uso:  bash tests/run.sh
set -euo pipefail

cd "$(dirname "$0")/.."
PORT=5181
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "Chrome non trovato (imposta la variabile CHROME)"; exit 2
fi

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT

# attendi il server
for _ in $(seq 1 40); do
  if curl -fs "http://localhost:$PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

OUT="$("$CHROME" --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=5000 --dump-dom \
  "http://localhost:$PORT/tests/selftest.html" 2>/dev/null)"

LINE="$(printf '%s' "$OUT" | grep -o 'RISULTATO: [0-9]* pass, [0-9]* fail' | tail -1 || true)"
echo "${LINE:-nessun risultato (timeout?)}"

# Nota: niente `grep -q` su $OUT qui — chiude la pipe in anticipo e con `pipefail`
# il printf riceve SIGPIPE (exit 141) → falso negativo. Controllo la $LINE catturata.
if [[ "$LINE" == *", 0 fail" ]]; then
  echo "✅ OK"; exit 0
else
  echo "❌ FALLITO"
  printf '%s\n' "$OUT" | grep -o 'FAIL[^<]*' || true
  exit 1
fi

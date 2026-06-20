/**
 * Genera un harness che SIMULA la webview VS Code per il bundle reale.
 *
 * Idea: l'unico modo per validare il guscio webview senza VS Code è riprodurne i
 * vincoli. Prendiamo extension/media/index.html (il bundle vero), applichiamo le
 * STESSE trasformazioni dell'extension host (CSP + nonce, niente crossorigin) e
 * iniettiamo un mock di `acquireVsCodeApi` che fa da finto host (risponde a
 * 'ready' inviando un documento di prova, risponde alle RPC). Un checker verifica
 * in Chrome headless che lo STAGE (iframe about:blank + document.write) renderizzi
 * la slide SOTTO la CSP — cioè l'attrito #1 della porta VS Code.
 *
 * Uso: node tests/webview-smoke.mjs  → scrive tests/_webview-harness.gen.html
 *      (servito da http.server alla root; vedi tests/run-webview.sh)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NONCE = 'testnonce';

const SAMPLE_DECK = `<!DOCTYPE html><html lang="it"><head><title>Prova</title>
<style>:root{--a:#b45309}body{background:#14130f}
.slide{position:absolute;inset:0;color:#fff;font-family:Charter,Georgia,serif;padding:60px}
.slide h1{color:var(--a);font-size:64px}
.card{background:rgba(255,255,255,.08);border-radius:14px;padding:20px}</style></head>
<body><div class="deck">
<section class="slide active"><h1>Titolo di prova</h1><div class="card">Contenuto della card</div></section>
<section class="slide"><h2>Seconda</h2></section>
</div></body></html>`;

let html = readFileSync(resolve(root, 'extension/media/index.html'), 'utf8');

// stesse trasformazioni dell'extension host, ma per il server locale (origin = 'self').
html = html.replace(/\s+crossorigin\b/g, '');
html = html.replace(/(src|href)="(\.\/[^"]+)"/g, (_, attr, rel) => `${attr}="/extension/media/${rel.replace(/^\.\//, '')}"`);
html = html.replace(/<script\b/g, `<script nonce="${NONCE}"`);

const csp = [
  "default-src 'none'",
  "img-src 'self' https: data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `script-src 'nonce-${NONCE}'`,
  "frame-src 'self' data: blob:",
  "child-src 'self' data: blob:",
  "connect-src 'self' https:",
].join('; ');

const mockAndChecker = `
<meta http-equiv="Content-Security-Policy" content="${csp}">
<script nonce="${NONCE}">
  // ---- finto extension host ----
  const SAMPLE = ${JSON.stringify(SAMPLE_DECK)};
  window.__rpc = [];
  window.acquireVsCodeApi = function () {
    let state = {};
    const fire = (data) => window.dispatchEvent(new MessageEvent('message', { data }));
    return {
      postMessage(msg) {
        if (!msg || msg.type !== 'rpc') return;
        window.__rpc.push(msg);
        if (msg.method === 'ready') {
          setTimeout(() => fire({ type: 'load', text: SAMPLE, name: 'prova.html' }), 10);
          setTimeout(() => fire({ type: 'rpc-reply', id: msg.id, ok: true }), 12);
        } else {
          let result;
          if (msg.method === 'save') result = 'saved';
          else if (msg.method === 'saveAs') result = { status: 'saved', name: 'x.html' };
          else if (msg.method === 'confirm') result = true;
          else if (msg.method === 'llmChat') {
            window.__llm = (window.__llm || 0) + 1;
            result = window.__llm === 1
              ? { content: '', toolCalls: [{ id: 't1', name: 'set_title', args: { title: 'Da agente' } }],
                  raw: { tool_calls: [{ id: 't1', type: 'function', function: { name: 'set_title', arguments: JSON.stringify({ title: 'Da agente' }) } }] } }
              : { content: 'Fatto agente.', toolCalls: [], raw: {} };
          }
          setTimeout(() => fire({ type: 'rpc-reply', id: msg.id, ok: true, result }), 5);
        }
      },
      getState() { return state; },
      setState(s) { state = s; },
    };
  };
  // ---- checker ----
  const log = []; let pass = 0, fail = 0;
  const A = (c, m) => { c ? (pass++, log.push('PASS ' + m)) : (fail++, log.push('FAIL ' + m)); };
  function report() {
    let el = document.getElementById('result');
    if (!el) { el = document.createElement('pre'); el.id = 'result'; document.body.appendChild(el); }
    el.textContent = 'RISULTATO: ' + pass + ' pass, ' + fail + ' fail\\n' + log.join('\\n');
    document.title = fail === 0 ? ('WV OK ' + pass) : ('WV FAIL ' + fail);
  }
  setTimeout(async () => {
    try {
      // --- rendering sotto CSP webview ---
      const fr = document.getElementById('slide-frame');
      A(!!fr, 'stage: iframe presente');
      const idoc = fr && fr.contentDocument;
      const ss = idoc && idoc.getElementById('ss-slide');
      A(!!ss, 'stage: #ss-slide renderizzato nell\\'iframe (sotto CSP)');
      A(!!ss && /Titolo di prova/.test(ss.textContent || ''), 'stage: contenuto del deck visibile (h1)');
      A(!!ss && !!ss.querySelector('.card'), 'stage: la card del deck e\\' nel DOM');
      const thumbs = document.querySelectorAll('.thumbs li');
      A(thumbs.length >= 2, 'sidebar: ' + thumbs.length + ' miniature (atteso 2)');
      A(!!document.querySelector('.chat'), 'chat: pannello montato');
      A(window.__rpc.some((m) => m.method === 'ready'), 'handshake: webview ha inviato rpc ready');

      // --- ciclo documento: edit → sync (dirty) verso l'host ---
      window.__app._addText();           // aggiunge una casella "Testo" e committa
      await new Promise((r) => setTimeout(r, 900)); // attende il debounce (600ms)
      const sync = window.__rpc.find((m) => m.method === 'sync');
      A(!!sync, 'ciclo doc: edit → rpc "sync" inviato all\\'host');
      A(!!sync && /Testo/.test((sync.args && sync.args.html) || ''), 'ciclo doc: il sync porta l\\'HTML aggiornato');
      A(!window.__rpc.some((m) => m.method === 'save'), 'ciclo doc: NON salva su disco da solo (save nativo)');

      // --- host → webview: external-change (undo VS Code / modifica esterna) ricarica ---
      const NEW = SAMPLE.replace('Titolo di prova', 'Aggiornato esterno');
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'external-change', text: NEW } }));
      await new Promise((r) => setTimeout(r, 400));
      const ss2 = document.getElementById('slide-frame').contentDocument.getElementById('ss-slide');
      A(!!ss2 && /Aggiornato esterno/.test(ss2.textContent || ''), 'host→webview: external-change ricarica il deck');

      // --- export / present / pdf → host (step 5) ---
      await window.__app._exportPdf();
      const pe = window.__rpc.find((m) => m.method === 'printExternal');
      A(!!pe && /ss-page|@page/.test((pe.args && pe.args.html) || ''), 'pdf: rpc printExternal con HTML di stampa');
      window.__app._present();
      await new Promise((r) => setTimeout(r, 30));
      A(window.__rpc.some((m) => m.method === 'present'), 'present: rpc present inviato all\\'host');
      await window.__app._exportHtml();
      A(window.__rpc.some((m) => m.method === 'exportHtml'), 'export: rpc exportHtml inviato all\\'host');

      // --- agente: chat → llmChat (tool + finale) → tool eseguito + risposta resa ---
      window.__app.chat.open();
      window.__app.chat.input.value = 'cambia il titolo';
      window.__app.chat._submit();
      await new Promise((r) => setTimeout(r, 500));
      const llm = window.__rpc.filter((m) => m.method === 'llmChat');
      A(llm.length >= 2, 'agente: 2 chiamate llmChat (tool + finale), ricevute ' + llm.length);
      A(!!llm[0] && llm[0].args.connection && llm[0].args.connection.type === 'vscode-lm', 'agente: usa la connessione Copilot (vscode-lm)');
      A(!!llm[0] && !('signal' in llm[0].args), 'agente: signal NON serializzato nel postMessage');
      const ctext = (document.querySelector('.chat__msgs') || {}).textContent || '';
      A(/set_title/.test(ctext), 'agente: step del tool mostrato in chat');
      A(/Fatto agente/.test(ctext), 'agente: risposta finale resa in chat');
    } catch (e) {
      fail++; log.push('EXCEPTION ' + e.message);
    }
    report();
  }, 1200);
</script>
`;

html = html.replace('<head>', '<head>\n' + mockAndChecker);
writeFileSync(resolve(root, 'tests/_webview-harness.gen.html'), html);
console.log('harness scritto: tests/_webview-harness.gen.html');

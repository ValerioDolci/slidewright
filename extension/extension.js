'use strict';
/**
 * Extension host (Node) di Slide Studio.
 *
 * - Registra un Custom TEXT Editor su .html/.htm con priorità "option" (opt-in:
 *   l'editor di testo resta il default; si apre con "Apri con → Slide Studio").
 * - La UI è la stessa webview del guscio web (bundle in media/), che parla con
 *   l'host via postMessage. L'host fa il lavoro "vero" (fs, dialoghi, openExternal,
 *   e in futuro vscode.lm per la chat).
 *
 * Stato per-step:
 *   step 2 (questo): scaffold — carica il documento nella webview, RPC di base
 *                    (save/saveAs/confirm/exportHtml/present). PDF e LLM arrivano
 *                    agli step 5 e 4.
 *   step 3: ciclo documento completo (dirty/undo nativi, edit vs save su disco).
 *   step 4: chat via vscode.lm (+ fallback openai-compat dall'host, no CORS).
 */

const vscode = require('vscode');
const path = require('path');

const VIEW_TYPE = 'slidewright.deck';

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('slidewright.openWith', (uri) => {
      const target = uri || vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showInformationMessage('Apri o seleziona un file .html, poi riprova.');
        return;
      }
      vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
    }),
  );

  const provider = new SlideStudioEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );
}

function deactivate() {}

class SlideStudioEditorProvider {
  constructor(context) {
    this.context = context;
  }

  async resolveCustomTextEditor(document, panel, _token) {
    const webview = panel.webview;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    webview.html = await getHtmlForWebview(webview, mediaRoot);

    const post = (msg) => webview.postMessage(msg);
    const sendLoad = () =>
      post({ type: 'load', text: document.getText(), name: path.basename(document.uri.fsPath) });

    // Anti-loop robusto: ignoriamo l'onDidChange se il testo coincide con
    // l'ultimo che abbiamo spinto NOI dalla webview (niente eco verso la webview).
    let lastPushed = null;

    const msgSub = webview.onDidReceiveMessage(async (m) => {
      if (!m) return;
      if (m.type === 'ready') { sendLoad(); return; }
      if (m.type === 'rpc') {
        let result;
        let error;
        try {
          result = await this._handleRpc(m.method, m.args, {
            document, webview,
            markPushed: (html) => { lastPushed = html; },
          });
        } catch (e) {
          error = e && e.message ? e.message : String(e);
        }
        post({ type: 'rpc-reply', id: m.id, ok: !error, result, error });
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (document.getText() === lastPushed) return; // modifica nostra → niente eco
      post({ type: 'external-change', text: document.getText() });
    });

    panel.onDidDispose(() => { msgSub.dispose(); changeSub.dispose(); });
  }

  /** Gestisce una chiamata RPC dalla webview. Ritorna un valore serializzabile. */
  async _handleRpc(method, args, ctx) {
    const { document } = ctx;
    switch (method) {
      case 'sync': {
        // modifica continua dalla webview → aggiorna il documento (→ DIRTY),
        // ma NON salva su disco: il salvataggio resta nativo (⌘S dell'utente).
        ctx.markPushed(args.html);
        await replaceWholeDocument(document, args.html);
        return 'synced';
      }
      case 'save': {
        // salvataggio esplicito (⌘S / pulsante): allinea il documento e scrive su disco.
        ctx.markPushed(args.html);
        await replaceWholeDocument(document, args.html);
        await document.save();
        return 'saved';
      }
      case 'saveAs': {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(args.name || 'deck.html'),
          filters: { 'Deck HTML': ['html', 'htm'] },
        });
        if (!uri) return { status: 'cancelled' };
        await vscode.workspace.fs.writeFile(uri, Buffer.from(args.html, 'utf8'));
        return { status: 'saved', name: path.basename(uri.fsPath) };
      }
      case 'confirm': {
        const pick = await vscode.window.showWarningMessage(args.message, { modal: true }, 'Continua');
        return pick === 'Continua';
      }
      case 'exportHtml': {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(args.name || 'deck.html'),
          filters: { 'HTML': ['html', 'htm'] },
        });
        if (!uri) return;
        await vscode.workspace.fs.writeFile(uri, Buffer.from(args.html, 'utf8'));
        vscode.window.showInformationMessage(`Esportato: ${path.basename(uri.fsPath)}`);
        return;
      }
      case 'present': {
        const uri = await writeTemp(this.context, 'present.html', args.html);
        await vscode.env.openExternal(uri);
        return;
      }
      case 'printExternal': {
        // PDF: apriamo l'HTML di stampa nel browser esterno (⌘/Ctrl+P → Salva come PDF).
        const uri = await writeTemp(this.context, 'print.html', args.html);
        await vscode.env.openExternal(uri);
        vscode.window.showInformationMessage('PDF: nel browser usa ⌘/Ctrl+P → "Salva come PDF" e attiva "Grafica di sfondo".');
        return;
      }
      case 'llmChat': {
        const conn = args.connection || {};
        // Copilot via vscode.lm (no chiave, no CORS) oppure openai-compat dall'host.
        return conn.type === 'vscode-lm' ? await chatViaVscodeLm(args) : await chatViaOpenAI(args);
      }
      case 'openDeck':
        return null; // nel Custom Editor il documento è già fornito via "load".
      default:
        throw new Error(`metodo RPC sconosciuto: ${method}`);
    }
  }
}

async function replaceWholeDocument(document, text) {
  const edit = new vscode.WorkspaceEdit();
  const full = new vscode.Range(0, 0, document.lineCount, 0);
  edit.replace(document.uri, full, text);
  await vscode.workspace.applyEdit(edit);
}

async function writeTemp(context, name, content) {
  const dir = vscode.Uri.joinPath(context.globalStorageUri, 'tmp');
  await vscode.workspace.fs.createDirectory(dir);
  const uri = vscode.Uri.joinPath(dir, name);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  return uri;
}

async function getHtmlForWebview(webview, mediaRoot) {
  const indexUri = vscode.Uri.joinPath(mediaRoot, 'index.html');
  const bytes = await vscode.workspace.fs.readFile(indexUri);
  let html = Buffer.from(bytes).toString('utf8');
  const nonce = getNonce();

  // `crossorigin` sugli asset rompe il load sotto lo scheme webview-resource.
  html = html.replace(/\s+crossorigin\b/g, '');
  // Riscrive gli URL relativi degli asset (./assets/...) in URI webview.
  html = html.replace(/(src|href)="(\.\/[^"]+)"/g, (_, attr, rel) => {
    const uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, rel.replace(/^\.\//, '')));
    return `${attr}="${uri}"`;
  });
  // nonce su ogni <script> (richiesto dalla CSP).
  html = html.replace(/<script\b/g, `<script nonce="${nonce}"`);

  // Lo stage è un iframe about:blank same-origin popolato via document.write →
  // serve 'self' in frame-src/child-src; il deck ha <style> inline e immagini
  // data: → 'unsafe-inline' su style e data: su img. Niente script nel deck.
  const csp = [
    "default-src 'none'",
    `img-src 'self' ${webview.cspSource} https: data: blob:`,
    `style-src 'self' ${webview.cspSource} 'unsafe-inline'`,
    `font-src 'self' ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    `frame-src 'self' ${webview.cspSource} data: blob:`,
    `child-src 'self' ${webview.cspSource} data: blob:`,
    `connect-src ${webview.cspSource} https:`,
  ].join('; ');
  html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);

  return html;
}

// ---------- LLM ----------
//
// L'agente (core/agent.js) parla "OpenAI": messages con role system/user/
// assistant(.tool_calls)/tool e ritorno { content, toolCalls:[{id,name,args}], raw }.
// Qui sotto: una traduzione 1:1 verso vscode.lm (Copilot) e un client openai-compat
// (fetch dall'extension host → niente CORS). La forma OpenAI resta la lingua franca,
// così l'agente non cambia per provider.

async function chatViaOpenAI({ connection, messages, tools }) {
  if (!connection || !connection.baseUrl) throw new Error('Connessione LLM senza Base URL.');
  const url = connection.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = { model: connection.model, messages, temperature: 0.2, stream: false };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('Impossibile contattare il provider: ' + e.message);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch (_) { try { detail = await res.text(); } catch (_) { /* noop */ } }
    if (res.status === 401) throw new Error('Chiave API non valida (401).');
    throw new Error(`Errore provider ${res.status}: ${detail || res.statusText}`);
  }
  const data = await res.json();
  const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    id: tc.id, name: tc.function && tc.function.name, args: safeParse(tc.function && tc.function.arguments),
  }));
  return { content: msg.content || '', toolCalls, raw: msg };
}

async function chatViaVscodeLm({ connection, messages, tools }) {
  const family = connection && connection.model;
  let models = await vscode.lm.selectChatModels(family ? { vendor: 'copilot', family } : { vendor: 'copilot' });
  if (!models || !models.length) models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (!models || !models.length) {
    throw new Error('Copilot non disponibile: installa/accedi a GitHub Copilot in VS Code, oppure configura un provider in ⚙.');
  }
  const model = models[0];
  const options = {};
  if (tools && tools.length) {
    options.tools = tools.map((t) => ({ name: t.function.name, description: t.function.description, inputSchema: t.function.parameters }));
    options.toolMode = vscode.LanguageModelChatToolMode.Auto;
  }
  const token = new vscode.CancellationTokenSource().token;
  let resp;
  try {
    resp = await model.sendRequest(toLmMessages(messages), options, token);
  } catch (e) {
    if (e instanceof vscode.LanguageModelError) throw new Error('Copilot: ' + e.message + (e.code ? ` (${e.code})` : ''));
    throw e;
  }
  let content = '';
  const toolCalls = [];
  for await (const part of resp.stream) {
    if (part instanceof vscode.LanguageModelTextPart) content += part.value;
    else if (part instanceof vscode.LanguageModelToolCallPart) toolCalls.push({ id: part.callId, name: part.name, args: part.input });
  }
  const raw = toolCalls.length
    ? { tool_calls: toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args || {}) } })) }
    : {};
  return { content, toolCalls, raw };
}

/** messages OpenAI → vscode.lm (niente system: confluisce in un messaggio utente). */
function toLmMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    if (m.role === 'system' || m.role === 'user') {
      out.push(vscode.LanguageModelChatMessage.User(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push(new vscode.LanguageModelTextPart(String(m.content)));
      for (const tc of m.tool_calls || []) {
        parts.push(new vscode.LanguageModelToolCallPart(tc.id, tc.function && tc.function.name, safeParse(tc.function && tc.function.arguments)));
      }
      out.push(vscode.LanguageModelChatMessage.Assistant(parts.length ? parts : ''));
    } else if (m.role === 'tool') {
      out.push(vscode.LanguageModelChatMessage.User([
        new vscode.LanguageModelToolResultPart(m.tool_call_id, [new vscode.LanguageModelTextPart(String(m.content == null ? '' : m.content))]),
      ]));
    }
  }
  return out;
}

function safeParse(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (_) { return {}; }
}

function getNonce() {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

module.exports = { activate, deactivate };

'use strict';
/**
 * Extension host (Node) di Slidewright.
 *
 * - Registra un Custom TEXT Editor su .html/.htm con priorità "option" (opt-in:
 *   l'editor di testo resta il default; si apre con "Apri con → Slidewright").
 * - La UI è la stessa webview del guscio web (bundle in media/), che parla con
 *   l'host via postMessage. L'host fa il lavoro "vero": carica/salva il documento
 *   (dirty/undo nativi), dialoghi, openExternal (PDF/presenta), e la chat via
 *   vscode.lm (Copilot) o openai-compat (fetch dall'host, niente CORS).
 *
 * Protocollo messaggi webview→host: {type:'ready'} (notifica) e
 * {type:'rpc', id, method, args}. host→webview: {type:'load',…},
 * {type:'external-change',…}, {type:'rpc-reply', id, ok, result, error}.
 */

const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');

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

    const post = (msg) => webview.postMessage(msg);
    const sendLoad = () =>
      post({ type: 'load', text: document.getText(), name: path.basename(document.uri.fsPath) });

    // Anti-eco: mentre applichiamo NOI una modifica (sync/save dalla webview) non
    // dobbiamo rimandarla alla webview. Doppia difesa: un contatore di edit "nostri"
    // in corso (regge sync+save concorrenti) + confronto col testo effettivo spinto
    // (copre la normalizzazione EOL / files.insertFinalNewline).
    let selfEditDepth = 0;
    let lastPushed = null;
    const applyFromWebview = async (html, doSave) => {
      selfEditDepth++;
      try {
        const ok = await replaceWholeDocument(document, html);
        if (!ok) throw new Error('applyEdit rifiutato (documento cambiato?)');
        if (doSave) await document.save();
      } finally {
        lastPushed = document.getText();
        selfEditDepth--;
      }
    };

    const msgSub = webview.onDidReceiveMessage(async (m) => {
      if (!m) return;
      if (m.type === 'ready') { sendLoad(); return; }
      if (m.type === 'rpc') {
        let result;
        let error;
        try {
          result = await this._handleRpc(m.method, m.args, { document, webview, applyFromWebview });
        } catch (e) {
          error = e && e.message ? e.message : String(e);
        }
        post({ type: 'rpc-reply', id: m.id, ok: !error, result, error });
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (selfEditDepth > 0 || document.getText() === lastPushed) return; // modifica nostra → niente eco
      post({ type: 'external-change', text: document.getText() });
    });

    panel.onDidDispose(() => { msgSub.dispose(); changeSub.dispose(); });

    // I listener sono pronti PRIMA di caricare l'HTML, così il 'ready' della
    // webview non può arrivare prima che siamo in ascolto.
    webview.html = await getHtmlForWebview(webview, mediaRoot);
  }

  /** Gestisce una chiamata RPC dalla webview. Ritorna un valore serializzabile. */
  async _handleRpc(method, args, ctx) {
    const { document } = ctx;
    switch (method) {
      case 'sync': {
        // modifica continua dalla webview → documento DIRTY, NIENTE write su disco
        // (il salvataggio resta nativo: ⌘S dell'utente).
        await ctx.applyFromWebview(args.html, false);
        return 'synced';
      }
      case 'save': {
        // salvataggio esplicito (⌘S / pulsante): allinea il documento e scrive su disco.
        await ctx.applyFromWebview(args.html, true);
        return 'saved';
      }
      case 'saveAs': {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(args.name || 'deck.html'),
          filters: { 'Deck HTML': ['html', 'htm'] },
        });
        if (!uri) return { status: 'cancelled' };
        await vscode.workspace.fs.writeFile(uri, Buffer.from(String(args.html == null ? '' : args.html), 'utf8'));
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
        await vscode.workspace.fs.writeFile(uri, Buffer.from(String(args.html == null ? '' : args.html), 'utf8'));
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

/**
 * Sostituisce il contenuto del documento con `text` facendo un edit MINIMALE:
 * mantiene prefisso e suffisso comuni e rimpiazza solo la regione centrale. Così
 * l'undo nativo resta granulare e cursore/selezione/fold non saltano a inizio file
 * (un full-replace continuo li distruggerebbe). Ritorna l'esito di applyEdit.
 */
async function replaceWholeDocument(document, text) {
  const old = document.getText();
  if (old === text) return true;
  let start = 0;
  const max = Math.min(old.length, text.length);
  while (start < max && old.charCodeAt(start) === text.charCodeAt(start)) start++;
  let endOld = old.length;
  let endNew = text.length;
  while (endOld > start && endNew > start && old.charCodeAt(endOld - 1) === text.charCodeAt(endNew - 1)) {
    endOld--; endNew--;
  }
  const range = new vscode.Range(document.positionAt(start), document.positionAt(endOld));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, text.slice(start, endNew));
  return vscode.workspace.applyEdit(edit);
}

async function writeTemp(context, name, content) {
  const dir = vscode.Uri.joinPath(context.globalStorageUri, 'tmp');
  await vscode.workspace.fs.createDirectory(dir);
  const uri = vscode.Uri.joinPath(dir, name);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(String(content == null ? '' : content), 'utf8'));
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
  // La chat passa dall'host (no fetch dal webview) → connect-src minimale.
  // base-uri 'none' impedisce a un deck di dirottare i path relativi con <base>.
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    `img-src 'self' ${webview.cspSource} https: data: blob:`,
    `style-src 'self' ${webview.cspSource} 'unsafe-inline'`,
    `font-src 'self' ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    `frame-src 'self' ${webview.cspSource} data: blob:`,
    `child-src 'self' ${webview.cspSource} data: blob:`,
    `connect-src ${webview.cspSource}`,
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
      signal: AbortSignal.timeout(60000), // niente richieste appese all'infinito
    });
  } catch (e) {
    throw new Error('Impossibile contattare il provider: ' + (e.name === 'TimeoutError' ? 'timeout' : e.message));
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
  let content = '';
  const toolCalls = [];
  try {
    const resp = await model.sendRequest(toLmMessages(messages), options, token);
    // errori di rete/policy possono arrivare anche DURANTE lo stream → nel try.
    for await (const part of resp.stream) {
      if (part instanceof vscode.LanguageModelTextPart) content += part.value;
      else if (part instanceof vscode.LanguageModelToolCallPart) toolCalls.push({ id: part.callId, name: part.name, args: part.input });
    }
  } catch (e) {
    if (e instanceof vscode.LanguageModelError) throw new Error('Copilot: ' + e.message + (e.code ? ` (${e.code})` : ''));
    throw e;
  }
  const raw = toolCalls.length
    ? { tool_calls: toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args || {}) } })) }
    : {};
  return { content, toolCalls, raw };
}

/**
 * messages OpenAI → vscode.lm. Accorgimenti per non farsi rifiutare dai backend:
 * - niente role "system": il testo confluisce nel PRIMO messaggio user;
 * - i tool-result della stessa assistant-turn sono BATCHati in UN solo messaggio
 *   User (più LanguageModelToolResultPart) invece di tanti User consecutivi;
 * - gli assistant vuoti (né testo né tool call) vengono saltati.
 */
function toLmMessages(messages) {
  const out = [];
  let systemText = '';
  let pendingResults = [];
  const asText = (c) => (typeof c === 'string' ? c : JSON.stringify(c));
  const flushResults = () => {
    if (pendingResults.length) { out.push(vscode.LanguageModelChatMessage.User(pendingResults)); pendingResults = []; }
  };
  for (const m of messages || []) {
    if (m.role === 'tool') {
      pendingResults.push(new vscode.LanguageModelToolResultPart(
        m.tool_call_id, [new vscode.LanguageModelTextPart(String(m.content == null ? '' : m.content))],
      ));
      continue;
    }
    flushResults();
    if (m.role === 'system') {
      systemText += (systemText ? '\n\n' : '') + asText(m.content);
    } else if (m.role === 'user') {
      const text = asText(m.content);
      out.push(vscode.LanguageModelChatMessage.User(systemText ? `${systemText}\n\n${text}` : text));
      systemText = '';
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push(new vscode.LanguageModelTextPart(String(m.content)));
      for (const tc of m.tool_calls || []) {
        parts.push(new vscode.LanguageModelToolCallPart(tc.id, tc.function && tc.function.name, safeParse(tc.function && tc.function.arguments)));
      }
      if (parts.length) out.push(vscode.LanguageModelChatMessage.Assistant(parts));
    }
  }
  flushResults();
  if (systemText) out.push(vscode.LanguageModelChatMessage.User(systemText));
  return out;
}

function safeParse(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (_) { return {}; }
}

function getNonce() {
  return crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '');
}

module.exports = { activate, deactivate };

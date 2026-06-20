/**
 * VsCodePlatform — implementazione del contratto Platform per la WEBVIEW
 * dell'estensione VS Code. Non tocca il file system né la rete: parla solo con
 * l'extension host (Node) via `postMessage`, che fa il lavoro vero
 * (vscode.workspace.fs, vscode.lm, openExternal…). Vedi extension/extension.js.
 *
 * - storage: stato persistente della webview (`getState`/`setState`).
 * - tutto il resto: RPC verso l'host con id di correlazione.
 *
 * NB: `acquireVsCodeApi` esiste solo dentro una webview VS Code; fuori (es. test
 * o apertura accidentale nel browser) i metodi degradano senza esplodere.
 */

import { buildPrintHtml, computeBodyBackground } from '../core/export-pdf.js';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

let _seq = 0;
const _pending = new Map();
let _onLoad = null;
let _onExternalChange = null;

if (vscode) {
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m) return;
    if (m.type === 'rpc-reply') {
      const p = _pending.get(m.id);
      if (p) { _pending.delete(m.id); m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || 'errore host')); }
    } else if (m.type === 'load') {
      _onLoad?.(m);
    } else if (m.type === 'external-change') {
      _onExternalChange?.(m);
    }
  });
}

function rpc(method, args) {
  if (!vscode) return Promise.reject(new Error('Fuori da VS Code: host non disponibile.'));
  return new Promise((resolve, reject) => {
    const id = ++_seq;
    _pending.set(id, { resolve, reject });
    vscode.postMessage({ type: 'rpc', id, method, args });
  });
}

export class VsCodePlatform {
  constructor() {
    // Nel Custom Editor c'è SEMPRE un documento legato (il file aperto):
    // il salvataggio passa dall'host (documento VS Code → dirty/undo nativi).
    this.capabilities = { directSave: true, nativeSave: true, lmCopilot: true };
    this._bound = true;
    this.storage = {
      get: (key) => (vscode ? (vscode.getState()?.[key] ?? null) : null),
      set: (key, value) => {
        if (!vscode) return;
        const s = vscode.getState() || {};
        s[key] = value;
        vscode.setState(s);
      },
    };
  }

  canDirectSave() { return this._bound; }

  // ---------- file ----------
  // Nel Custom Editor il documento arriva via 'load' (vedi onLoad), non con un picker.
  openDeck() { return rpc('openDeck'); }
  // sync = aggiorna il documento VS Code (→ dirty), NON salva su disco.
  syncDocument(html) { return rpc('sync', { html }); }
  save(html) { return rpc('save', { html }); }
  saveAs(html, name) { return rpc('saveAs', { html, name }); }
  discardCurrent() { this._bound = false; }
  confirm(message) { return rpc('confirm', { message }); }

  // ---------- llm ----------
  // NB: niente `signal` nel postMessage (AbortSignal non è clonabile structured-clone).
  llmChat({ connection, messages, tools }) { return rpc('llmChat', { connection, messages, tools }); }

  // ---------- export / present ----------
  exportHtml(html, name) { return rpc('exportHtml', { html, name }); }

  async exportPdf(deck) {
    // Costruiamo l'HTML di stampa QUI (la webview ha il DOM per computeBodyBackground),
    // poi l'host lo apre nel browser esterno: l'utente fa ⌘/Ctrl+P → "Salva come PDF"
    // (window.print() non apre il dialogo dentro la webview → step 5).
    const isDoc = (deck.mode || 'deck') === 'doc';
    const pageBackground = isDoc ? '' : await computeBodyBackground(deck.styleCss);
    const html = buildPrintHtml(deck, { pageBackground });
    return rpc('printExternal', { html });
  }

  present(html) { return rpc('present', { html }); }

  // ---------- handshake con l'host ----------
  /** Registra il caricamento del documento e segnala all'host che la webview è pronta. */
  onLoad(cb) { _onLoad = cb; rpc('ready').catch(() => {}); }
  /** Documento cambiato fuori dall'editor (undo VS Code, modifica su disco). */
  onExternalChange(cb) { _onExternalChange = cb; }
}

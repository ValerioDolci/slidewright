/**
 * WebPlatform — implementazione del contratto Platform per il browser
 * "doppio-click" (Opzione A). Incapsula File System Access API, fetch ai provider
 * LLM, stampa via `window.print()`, download e `localStorage`.
 *
 * Tiene internamente l'handle del file aperto: l'App non lo vede più (gli basta
 * `canDirectSave()` / `save()` / `saveAs()`), così il guscio VS Code potrà
 * sostituire questa classe senza toccare l'App. Vedi `platform/index.js`.
 */

import {
  fsSupported, openDeckFile, pickSaveFile, writeHandle, ensureWritable,
} from '../core/persistence.js';
import { llmChat } from '../core/llm.js';
import { exportPdf as printPdf } from '../core/export-pdf.js';
import { downloadText } from '../util/dom.js';

export class WebPlatform {
  constructor() {
    this.capabilities = { directSave: fsSupported, nativeSave: false, lmCopilot: false };
    this._handle = null;
    this.storage = {
      get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
      set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* noop */ } },
    };
  }

  canDirectSave() { return !!this._handle; }

  /** Adotta un handle (es. da un file trascinato): "Salva" scriverà sull'originale. */
  adoptHandle(handle) { this._handle = handle || null; }

  // ---------- file ----------
  async openDeck() {
    if (fsSupported) {
      try {
        const { handle, text, name } = await openDeckFile();
        this._handle = handle;
        return { text, name };
      } catch (_) { return null; } // annullato dall'utente
    }
    // Fallback (Firefox/Safari / contesti non sicuri): input file effimero, niente handle.
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.html,text/html';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return resolve(null);
        this._handle = null; // niente direct-save senza FS API
        resolve({ text: await f.text(), name: f.name });
      };
      inp.click();
    });
  }

  // Su web non c'è un host con dirty proprio → sincronizzare = salvare.
  syncDocument(html) { return this.save(html); }

  async save(html) {
    if (!this._handle) return 'no-doc';
    try {
      if (!(await ensureWritable(this._handle))) return 'denied';
      await writeHandle(this._handle, html);
      return 'saved';
    } catch (_) { return 'error'; }
  }

  async saveAs(html, suggestedName) {
    if (fsSupported) {
      try {
        const handle = await pickSaveFile(suggestedName);
        this._handle = handle;
        await writeHandle(handle, html);
        return { status: 'saved', name: handle.name };
      } catch (_) { return { status: 'cancelled' }; }
    }
    downloadText(suggestedName, html);
    return { status: 'saved', name: suggestedName };
  }

  discardCurrent() { this._handle = null; }

  async confirm(message) { return window.confirm(message); }

  // ---------- llm ----------
  llmChat(args) { return llmChat(args); }

  // ---------- export / present ----------
  exportHtml(html, name) { downloadText(name, html); return Promise.resolve(); }

  exportPdf(deck) { return printPdf(deck); }

  present(html) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return Promise.resolve();
  }
}

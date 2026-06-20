/**
 * Platform (host adapter) — il "seam" che isola tutto ciò che dipende dall'host.
 *
 * Il cuore (model/store/import/export/ui) NON conosce il browser né VS Code: parla
 * solo a un oggetto `platform` che implementa questo contratto. Così la stessa UI
 * gira in due gusci:
 *   - `web.js`    → browser doppio-click (File System Access, fetch, window.print…)
 *   - `vscode.js` → webview dell'estensione (postMessage all'extension host)
 *
 * Regola: l'App usa SOLO i metodi qui sotto per parlare con l'host. Niente
 * `localStorage`, `window.open`, `fetch` a provider o FS API sparsi nell'App.
 *
 * @typedef {Object} Storage
 * @property {(key:string)=>(string|null)} get
 * @property {(key:string, value:string)=>void} set
 *
 * @typedef {Object} Platform
 * @property {{directSave:boolean, nativeSave:boolean}} capabilities  Cosa sa fare l'host.
 *   `nativeSave`: l'host possiede dirty/undo/salvataggio (VS Code) → l'App non
 *   mostra il proprio stato file e, a ogni modifica, sincronizza il contenuto col
 *   documento dell'host invece di autosalvare su disco.
 * @property {()=>boolean} canDirectSave          C'è un documento legato su cui salvare al volo?
 * @property {()=>Promise<{text:string,name:string}|null>} openDeck  Apre un deck (null = annullato).
 * @property {(html:string)=>Promise<any>} syncDocument  Sincronizza il contenuto con l'host (host nativeSave → marca dirty, NON salva su disco). Su web equivale a save.
 * @property {(html:string)=>Promise<'saved'|'no-doc'|'denied'|'error'>} save  Salva sul documento corrente.
 * @property {(html:string, suggestedName:string)=>Promise<{status:'saved'|'cancelled'|'error', name?:string}>} saveAs
 * @property {()=>void} discardCurrent            Scollega il documento corrente (Nuovo deck).
 * @property {(message:string)=>Promise<boolean>} confirm  Conferma sì/no (per "perdi le modifiche?").
 * @property {Storage} storage                    Chiave/valore persistente (tema, connessioni LLM).
 * @property {(args:object)=>Promise<{content:string,toolCalls:Array,raw:object}>} llmChat  Chat completion.
 * @property {(html:string, name:string)=>Promise<void>} exportHtml  Esporta una copia HTML.
 * @property {(deck:object)=>Promise<void>} exportPdf  Esporta/stampa in PDF.
 * @property {(html:string)=>Promise<void>} present    Apre il deck in modalità presentazione.
 */

export {};

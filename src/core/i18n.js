/**
 * i18n dell'EDITOR (non del deck). Un solo file, due lingue: niente duplicati di
 * sorgenti. Le CHIAVI del dizionario sono le stringhe italiane (la lingua sorgente
 * del codice), così il codice resta leggibile e non serve inventare chiavi astratte.
 *
 * Due meccanismi complementari:
 *  - `applyI18n(root)` traduce in-place il markup già montato (testi + attributi
 *    title/placeholder/aria-label), ricordando l'originale italiano per nodo
 *    (WeakMap) così il toggle è reversibile.
 *  - un `MutationObserver` (attivo SOLO in lingua ≠ it) traduce i nodi inseriti
 *    dopo (inspector, sidebar, chat…) senza dover wrappare quei file a mano.
 *  - `t(str)` per i punti in cui il testo viene scritto da codice su un nodo
 *    "gestito" (hint, titolo inspector, ecc.), che sono marcati `data-i18n-skip`.
 *
 * Il contenuto del deck vive in un <iframe> separato: NON viene mai tradotto
 * (TreeWalker/observer restano nel documento dell'editor).
 */

const EN = {
  // ---- inspector: colore ----
  'Nero': 'Black',
  'Bianco': 'White',
  // ---- inspector: copia formato (format painter) ----
  '🖌 Copia formato': '🖌 Copy format',
  'Copia lo stile di questo elemento, poi clicca quello a cui applicarlo': 'Copy this element\'s style, then click the one to apply it to',
  'Formato copiato — clicca l\'elemento a cui applicarlo (Esc annulla).': 'Format copied — click the element to apply it to (Esc to cancel).',
  // ---- drop overlay ----
  'Rilascia qui il tuo': 'Drop your',
  'Verranno importati stile e slide': 'Style and slides will be imported',

  // ---- toolbar: file ----
  'File': 'File',
  'Apri un deck .html (le modifiche si salveranno su quel file)': 'Open a .html deck (changes are saved to that file)',
  'Apri': 'Open',
  'Salva sul file (⌘S)': 'Save to file (⌘S)',
  'Salva': 'Save',
  'Nuovo deck vuoto': 'New empty deck',
  'Nuovo': 'New',
  'Esporta una copia HTML': 'Export an HTML copy',
  'Esporta HTML': 'Export HTML',
  'Esporta PDF (stesso formato slide)': 'Export PDF (same slide format)',
  'Esporta PDF vettoriale (testo selezionabile, leggero)': 'Export vector PDF (selectable text, lightweight)',
  'Esporta PDF': 'Export PDF',
  // ---- cattura PDF (Element Capture) ----
  '📷 Cattura PDF': '📷 Capture PDF',
  'Esporta PDF a immagini catturando il render reale: identico su ogni viewer (mobile incluso). Richiede un consenso di condivisione.':
    'Export an image PDF by capturing the real render: identical on every viewer (mobile included). Requires a sharing consent.',
  'Consenti la condivisione se richiesto: catturo le slide…': 'Allow sharing if prompted: capturing the slides…',
  'Cattura slide': 'Capturing slide',
  'Cattura completata: scegli "Salva come PDF".': 'Capture done: choose "Save as PDF".',
  'Cattura annullata o non riuscita': 'Capture cancelled or failed',
  'Cattura non disponibile in questo ambiente.': 'Capture not available in this environment.',
  'Un export è già in corso…': 'An export is already in progress…',

  // ---- toolbar: modifica ----
  'Modifica': 'Edit',
  'Annulla (⌘Z)': 'Undo (⌘Z)',
  'Ripeti (⇧⌘Z)': 'Redo (⇧⌘Z)',
  'Aggiungi una casella di testo': 'Add a text box',
  'Testo': 'Text',
  'Aggiungi una forma': 'Add a shape',
  'Forma': 'Shape',
  "Aggiungi un'immagine": 'Add an image',
  'Immagine': 'Image',
  // ---- menù forme ----
  'Forme': 'Shapes',
  'Rettangolo': 'Rectangle',
  'Ellisse': 'Ellipse',
  'Linea': 'Line',
  'Triangolo': 'Triangle',
  'Freccia': 'Arrow',
  // ---- icone / simboli ----
  'Icona': 'Icon',
  "Aggiungi un'icona / simbolo": 'Add an icon / symbol',
  'Attenzione': 'Warning',
  'Pericolo': 'Danger',
  'Successo': 'Success',
  'Errore': 'Error',
  'Stella': 'Star',
  'Idea': 'Idea',
  'Obiettivo': 'Target',
  'Sicurezza': 'Lock',
  'Approvato': 'Approved',
  'Bandiera': 'Flag',
  'Energia': 'Energy',
  'Tempo': 'Time',
  'Cuore': 'Heart',
  // ---- immagine (crop) ----
  'Adatta': 'Fit',
  'Riempi': 'Fill',

  // ---- toolbar: destra ----
  'File di lavoro': 'Working file',
  "Apri la chat con l'agente": 'Open the agent chat',
  '✨ Agente': '✨ Agent',
  'Tema chiaro / scuro': 'Light / dark theme',
  'Tema': 'Theme',
  'Passa al tema scuro': 'Switch to dark theme',
  'Passa al tema chiaro': 'Switch to light theme',
  'Aiuto: gesti e scorciatoie': 'Help: gestures and shortcuts',
  'Aiuto': 'Help',
  'Presenta a schermo intero': 'Present full screen',
  'Presenta ▸': 'Present ▸',
  'Lingua interfaccia / Interface language': 'Lingua interfaccia / Interface language',

  // ---- help popover ----
  'Chiudi': 'Close',
  'Come si usa': 'How to use',
  'Gesti': 'Gestures',
  'Click': 'Click',
  '→ seleziona ·': '→ select ·',
  'click di nuovo': 'click again',
  '→ scrivi nel testo': '→ type in the text',
  '⌥-click': '⌥-click',
  "→ seleziona l'elemento": '→ select the element',
  'sotto': 'below',
  'a quelli sovrapposti': 'when overlapping',
  'Crocetta ✥': '✥ handle',
  'sopra il box → sposta': 'above the box → move',
  'snap · Alt = libero': 'snap · Alt = free',
  'Doppio click': 'Double-click',
  'su un testo → modifica': 'on a text → edit',
  'Trascina': 'Drag',
  'un elemento → sposta': 'an element → move',
  'snap automatico · Alt = libero': 'auto snap · Alt = free',
  'Maniglie': 'Handles',
  '→ ridimensiona': '→ resize',
  'Shift = mantieni proporzioni': 'Shift = keep ratio',
  'Trascina un file .html': 'Drag a .html file',
  'nella finestra → importa deck': 'into the window → import deck',
  'Scorciatoie': 'Shortcuts',
  'salva sul file': 'save to file',
  'annulla / ripeti': 'undo / redo',
  'copia / incolla / duplica': 'copy / paste / duplicate',
  'Tab': 'Tab',
  '/': '/',
  '⇧Tab': '⇧Tab',
  'scorri gli elementi della slide': 'cycle the slide elements',
  'sposta 1px': 'move 1px',
  'Canc': 'Del',
  'elimina ·': 'delete ·',
  'deseleziona': 'deselect',

  // ---- sidebar ----
  'Slide': 'Slides',
  'Nuova slide': 'New slide',
  'Trascina per riordinare': 'Drag to reorder',

  // ---- stage ----
  '⚠ contenuto oltre i bordi (verrà tagliato in stampa)': '⚠ content beyond the edges (will be clipped when printing)',
  'Importa un deck o crea un nuovo deck per iniziare': 'Import a deck or create a new one to start',

  // ---- inspector ----
  'Proprietà': 'Properties',
  'Nessun elemento selezionato.': 'No element selected.',
  'Clicca un elemento sulla slide.': 'Click an element on the slide.',
  '— eredita —': '— inherit —',
  'Sans (sistema)': 'Sans (system)',
  'Riempimento e bordo': 'Fill & border',
  'Bordo': 'Border',
  'Spessore': 'Width',
  'Font': 'Font',
  'Dim.': 'Size',
  'Peso': 'Weight',
  'Colore': 'Color',
  'Allinea': 'Align',
  'Sfondo': 'Background',
  'Raggio': 'Radius',
  'Opacità': 'Opacity',
  'Padding': 'Padding',
  'Posizione (libero)': 'Position (free)',
  'Posizione': 'Position',
  'Rendi libero (posiziona a mano)': 'Make free (manual position)',
  'Elemento': 'Element',
  '↑ Contenitore': '↑ Container',
  "Seleziona l'elemento padre": 'Select parent element',
  'Avanti': 'Front',
  'Porta in primo piano': 'Bring to front',
  'Indietro': 'Back',
  'Porta in fondo': 'Send to back',
  'Duplica': 'Duplicate',
  'Elimina': 'Delete',
  'Opacità del colore': 'Color opacity',
  'Trasparente': 'Transparent',
  'Copia colore (con trasparenza)': 'Copy colour (with transparency)',
  'Incolla colore': 'Paste colour',
  'Pipetta: preleva il colore (con trasparenza) da un elemento': 'Eyedropper: pick a colour (with transparency) from an element',

  // ---- chat / agente ----
  "Chiedi all'agente di modificare le slide…": 'Ask the agent to edit the slides…',
  'Invia': 'Send',
  'Impostazioni connessioni': 'Connection settings',
  'Nessuna connessione LLM. Apri ⚙ per configurarne una (es. la tua Mistral, oppure Ollama in locale).':
    'No LLM connection. Open ⚙ to set one up (e.g. your Mistral, or local Ollama).',
  'nessuna connessione': 'no connection',
  '— preset —': '— preset —',
  'Nome (es. Mistral mia)': 'Name (e.g. my Mistral)',
  'Modello (es. mistral-large-latest)': 'Model (e.g. mistral-large-latest)',
  'API key (resta in locale)': 'API key (stays local)',
  'nativo · Copilot': 'native · Copilot',
  'Nessuna connessione ancora.': 'No connection yet.',
  'Connessioni LLM': 'LLM connections',
  'Modifica connessione': 'Edit connection',
  'Nuova connessione': 'New connection',
  'Salva connessione': 'Save connection',
  'Servono almeno Base URL e Modello.': 'You need at least Base URL and Model.',

  // ---- app: hint / conferme ----
  'Pronto. Apri un file per salvarci sopra, oppure doppio click sul testo per modificarlo.':
    'Ready. Open a file to save onto it, or double-click text to edit it.',
  'Pronto. Doppio click sul testo per modificarlo, trascina gli elementi liberi.':
    'Ready. Double-click text to edit it, drag free elements.',
  "Non puoi eliminare l'ultima slide.": "You can't delete the last slide.",
  'Nuovo deck. ⌘S per salvarlo su un file.': 'New deck. ⌘S to save it to a file.',
  'Nuovo deck creato.': 'New deck created.',
  'Elemento copiato — ⌘V per incollare.': 'Element copied — ⌘V to paste.',
  'Altri elementi sovrapposti qui: ⌥-click o Tab per raggiungere quelli sotto.':
    'Overlapping elements here: ⌥-click or Tab to reach the ones below.',
  'HTML esportato (copia separata).': 'HTML exported (separate copy).',
  'Apertura stampa… scegli "Salva come PDF" e attiva "Grafica di sfondo".':
    'Opening print… choose "Save as PDF" and enable "Background graphics".',
  'Hai modifiche non salvate. Continuare e perderle?': 'You have unsaved changes. Continue and lose them?',
};

const DICT = { it: null, en: EN };
const ATTRS = ['title', 'placeholder', 'aria-label'];
const ATTR_SEL = '[title],[placeholder],[aria-label]';

let current = 'it';
let observer = null;
const origText = new WeakMap();   // text node -> stringa italiana originale
const origAttr = new WeakMap();   // element -> { attr: valore italiano originale }

export function getLang() { return current; }

/** Traduce una stringa italiana nella lingua corrente (passthrough se 'it'/non mappata). */
export function t(s) {
  if (current === 'it' || s == null) return s;
  const tr = DICT[current][String(s).trim()];
  return tr == null ? s : tr;
}

/** Imposta la lingua e accende/spegne l'observer dei nodi futuri (solo ≠ it). */
export function setLang(lang) {
  current = lang === 'en' ? 'en' : 'it';
  if (current === 'it') stopObserver();
  else startObserver();
}

/** Traduce in-place un nodo (elemento o testo) e i suoi discendenti. */
export function applyI18n(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1) return;
  if (!isSkipped(root)) {
    translateAttrs(root);
    root.querySelectorAll(ATTR_SEL).forEach((el) => { if (!isSkipped(el)) translateAttrs(el); });
  }
  const doc = root.ownerDocument || document;
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) translateText(n);
}

function isSkipped(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !!(el && el.closest && el.closest('[data-i18n-skip]'));
}

function renderStr(itStr) {
  if (current === 'it') return itStr;
  const key = itStr.trim();
  if (!key) return itStr;
  const tr = DICT[current][key];
  if (tr == null) return itStr;
  const lead = itStr.match(/^\s*/)[0];
  const tail = itStr.match(/\s*$/)[0];
  return lead + tr + tail;
}

function translateText(node) {
  if (isSkipped(node)) return;
  const raw = node.nodeValue;
  if (!raw || !/\S/.test(raw)) return;
  if (!origText.has(node)) origText.set(node, raw);
  node.nodeValue = renderStr(origText.get(node));
}

function translateAttrs(el) {
  if (el.nodeType !== 1) return;
  let store = origAttr.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    if (!store) { store = {}; origAttr.set(el, store); }
    if (!(a in store)) store[a] = el.getAttribute(a);
    el.setAttribute(a, renderStr(store[a]));
  }
}

function startObserver() {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) for (const node of m.addedNodes) applyI18n(node);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) { observer.disconnect(); observer = null; }
}

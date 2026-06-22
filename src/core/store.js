/**
 * Store centrale: stato documento (deck, con history undo/redo) + stato UI
 * effimero (slide corrente, elemento selezionato). Pub/sub minimale.
 *
 * - Le modifiche al DOCUMENTO passano da `commit(label, fn)`: snapshot del deck
 *   nello stack `past`, mutazione, emit. È lo stack che alimenta undo/redo
 *   (snapshot-based: robusto e semplice, come da decisione 2).
 * - Lo stato UI (currentIndex, selectedEid) NON entra nella history: setter propri.
 *
 * Chi decide *quando* committare è la UI (es. testo su blur, drag su mouseup):
 * lo store resta volutamente "stupido".
 */

import { cloneDeck, welcomeDeck } from './model.js';

const HISTORY_CAP = 120;

function createStore() {
  let deck = welcomeDeck();
  let currentIndex = 0;
  let selectedEid = null;
  const past = [];
  const future = [];
  const subs = new Set();

  function emit(reason) {
    for (const fn of subs) fn(reason);
  }

  function clampIndex(i) {
    return Math.max(0, Math.min(i, deck.slides.length - 1));
  }

  return {
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },

    // ---- accessors ----
    get deck() { return deck; },
    get currentIndex() { return currentIndex; },
    get currentSlide() { return deck.slides[currentIndex] || null; },
    get selectedEid() { return selectedEid; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },

    // ---- documento (history-tracked) ----
    /** Rimpiazza l'intero deck (import / nuovo). Azzera la history. */
    setDeck(next, { keepHistory = false } = {}) {
      if (!keepHistory) { past.length = 0; future.length = 0; }
      deck = next;
      currentIndex = 0;
      selectedEid = null;
      emit('deck');
    },

    /** Applica una mutazione al deck creando un punto di undo. */
    commit(label, fn) {
      const before = cloneDeck(deck);
      const r = fn(deck);
      // niente snapshot se la mutazione non ha cambiato nulla
      if (JSON.stringify(before) === JSON.stringify(deck)) return r;
      past.push(before);
      if (past.length > HISTORY_CAP) past.shift();
      future.length = 0;
      currentIndex = clampIndex(currentIndex);
      emit(label || 'commit');
      return r;
    },

    undo() {
      if (!past.length) return;
      future.push(cloneDeck(deck));
      deck = past.pop();
      currentIndex = clampIndex(currentIndex);
      selectedEid = null;
      emit('undo');
    },

    redo() {
      if (!future.length) return;
      past.push(cloneDeck(deck));
      deck = future.pop();
      currentIndex = clampIndex(currentIndex);
      selectedEid = null;
      emit('redo');
    },

    // ---- stato UI (no history) ----
    setCurrentIndex(i) {
      const ni = clampIndex(i);
      if (ni === currentIndex) return;
      currentIndex = ni;
      selectedEid = null;
      emit('current');
    },

    setSelected(eid) {
      if (eid === selectedEid) return;
      selectedEid = eid;
      emit('selection');
    },
  };
}

export const store = createStore();

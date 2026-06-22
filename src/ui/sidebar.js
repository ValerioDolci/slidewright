/**
 * Sidebar: lista miniature delle slide. Riordino drag&drop (SortableJS),
 * duplica, elimina, nuova. Ogni miniatura è un iframe non interattivo che
 * renderizza la slide con lo stile del deck, scalato.
 */

import Sortable from 'sortablejs';
import { CANVAS } from '../core/model.js';
import { inline } from '../core/assets.js';
import { el } from '../util/dom.js';

export class Sidebar {
  constructor(listEl) {
    this.list = listEl;
    this.onSelect = () => {};
    this.onReorder = () => {};
    this.onDuplicate = () => {};
    this.onDelete = () => {};
    this._sortable = Sortable.create(this.list, {
      animation: 150,
      handle: '.thumb__grip',
      ghostClass: 'thumb--ghost',
      onEnd: (e) => {
        if (e.oldIndex !== e.newIndex) this.onReorder(e.oldIndex, e.newIndex);
      },
    });
  }

  _thumbDoc(deck, slide) {
    const id = slide.elId ? ` id="${slide.elId}"` : '';     // preserva l'id (CSS #slide-N del deck)
    const fs = slide.fitScale && slide.fitScale < 1 ? slide.fitScale : 0;
    const fit = fs
      ? `.ss-root{height:auto!important;bottom:auto!important;transform:scale(${fs})!important;transform-origin:top center!important}`
      : '';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${deck.styleCss || ''}</style>
<style>html,body{margin:0;width:${CANVAS.w}px;height:${CANVAS.h}px;overflow:hidden;pointer-events:none}
.ss-root{position:absolute !important;inset:0;opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important}
${fit}</style>
</head><body><section${id} class="slide active ss-root ${(slide.classes || []).join(' ')}">${inline(slide.html)}</section></body></html>`;
  }

  render(deck, current) {
    this.list.replaceChildren();
    deck.slides.forEach((slide, i) => {
      const frame = el('iframe', {
        class: 'thumb__frame', tabindex: '-1', 'aria-hidden': 'true',
        scrolling: 'no', referrerpolicy: 'no-referrer', sandbox: '',
      });
      frame.srcdoc = this._thumbDoc(deck, slide);

      const li = el('li', {
        class: `thumb ${i === current ? 'thumb--active' : ''}`,
        dataset: { index: String(i) },
        onClick: () => this.onSelect(i),
      }, [
        el('span', { class: 'thumb__grip', title: 'Trascina per riordinare', text: '⋮⋮' }),
        el('span', { class: 'thumb__num', text: String(i + 1) }),
        el('div', { class: 'thumb__frameWrap' }, [frame]),
        el('div', { class: 'thumb__actions' }, [
          el('button', {
            class: 'thumb__act', title: 'Duplica', text: '⧉',
            onClick: (e) => { e.stopPropagation(); this.onDuplicate(i); },
          }),
          el('button', {
            class: 'thumb__act thumb__act--del', title: 'Elimina', text: '✕',
            onClick: (e) => { e.stopPropagation(); this.onDelete(i); },
          }),
        ]),
      ]);
      this.list.append(li);
    });
  }

  setActive(i) {
    this.list.querySelectorAll('.thumb').forEach((n) => {
      n.classList.toggle('thumb--active', Number(n.dataset.index) === i);
    });
  }

  refreshThumb(deck, i) {
    const li = this.list.querySelector(`.thumb[data-index="${i}"]`);
    const frame = li?.querySelector('.thumb__frame');
    if (frame) frame.srcdoc = this._thumbDoc(deck, deck.slides[i]);
  }
}

/**
 * Inspector: pannello proprietà dell'elemento selezionato. Scrive stili inline
 * sull'elemento (live su `input`, commit nel modello su `change`) e offre azioni
 * (rendi libero, porta avanti/indietro, duplica, elimina).
 */

import { el } from '../util/dom.js';
import { t } from '../core/i18n.js';

const FONTS = [
  ['', '— eredita —'],
  ['-apple-system,"SF Pro Text","Helvetica Neue",sans-serif', 'Sans (sistema)'],
  ['Charter,"Iowan Old Style",Palatino,Georgia,serif', 'Serif (Charter)'],
  ['ui-monospace,Menlo,"SF Mono",monospace', 'Mono'],
  ['"Avenir Next","Gill Sans",sans-serif', 'Avenir / Gill'],
  ['Georgia,"Times New Roman",serif', 'Georgia'],
];
const WEIGHTS = [['', '—'], ['400', 'Regular'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Black']];
const ALIGNS = [['left', '⯇'], ['center', '≡'], ['right', '⯈'], ['justify', '☰']];

export class Inspector {
  constructor(titleEl, bodyEl) {
    this.titleEl = titleEl;
    this.bodyEl = bodyEl;
    this.getElement = () => null;
    this.commit = () => {};
    this.liveRefresh = () => {};
    this.duplicateElement = () => {};
    this.deleteElement = () => {};
    this.selectParent = () => {};
    this.makeFree = () => {};
  }

  clear() {
    this.titleEl.textContent = t('Proprietà');
    this.bodyEl.replaceChildren(
      el('p', { class: 'inspector__empty', html: 'Nessun elemento selezionato.<br/>Clicca un elemento sulla slide.' })
    );
  }

  render(eid) {
    const elm = this.getElement(eid);
    if (!elm) return this.clear();
    const win = elm.ownerDocument.defaultView;
    const cs = win.getComputedStyle(elm);
    const isAbs = cs.position === 'absolute' || cs.position === 'fixed';

    this.titleEl.textContent = elm.tagName.toLowerCase() + (elm.className ? `.${String(elm.className).split(' ')[0]}` : '');

    const setStyle = (prop, val, commit) => {
      elm.style[prop] = val;
      this.liveRefresh();
      if (commit) this.commit();
    };

    const body = el('div', { class: 'insp' });

    // ---- Testo ----
    body.append(this._group('Testo', [
      this._row('Font', this._select(FONTS, cs.fontFamily, (v, c) => setStyle('fontFamily', v, c))),
      this._row('Dim.', this._number(parseInt(cs.fontSize, 10) || 16, 6, 200, (v, c) => setStyle('fontSize', `${v}px`, c))),
      this._row('Peso', this._select(WEIGHTS, cs.fontWeight, (v, c) => setStyle('fontWeight', v, c))),
      this._row('Colore', this._color(cs.color, (v, c) => setStyle('color', v, c))),
      this._row('Allinea', this._segmented(ALIGNS, cs.textAlign, (v) => setStyle('textAlign', v, true))),
    ]));

    // ---- Riempimento & bordo ----
    body.append(this._group('Riempimento e bordo', [
      this._row('Sfondo', this._color(cs.backgroundColor, (v, c) => setStyle('backgroundColor', v, c), true)),
      this._row('Raggio', this._number(parseInt(cs.borderRadius, 10) || 0, 0, 400, (v, c) => setStyle('borderRadius', `${v}px`, c))),
      this._row('Opacità', this._range(Math.round((parseFloat(cs.opacity) || 1) * 100), (v, c) => setStyle('opacity', String(v / 100), c))),
      this._row('Padding', this._number(parseInt(cs.paddingTop, 10) || 0, 0, 200, (v, c) => setStyle('padding', `${v}px`, c))),
    ]));

    // ---- Posizione (solo se libero) ----
    if (isAbs) {
      const num = (prop) => parseInt(elm.style[prop], 10) || 0;
      body.append(this._group('Posizione (libero)', [
        this._row('X', this._number(num('left'), -2000, 4000, (v, c) => setStyle('left', `${v}px`, c))),
        this._row('Y', this._number(num('top'), -2000, 4000, (v, c) => setStyle('top', `${v}px`, c))),
        this._row('L', this._number(parseInt(cs.width, 10) || 0, 8, 4000, (v, c) => setStyle('width', `${v}px`, c))),
        this._row('A', this._number(parseInt(cs.height, 10) || 0, 8, 4000, (v, c) => setStyle('height', `${v}px`, c))),
      ]));
    } else {
      const conv = el('button', {
        class: 'btn btn--block', text: 'Rendi libero (posiziona a mano)',
        onClick: () => {
          // congela la geometria come assoluta lasciando un segnaposto (gli altri
          // box in flusso non si riassestano — vedi Stage.makeFree)
          this.makeFree(elm);
          this.commit();
          this.render(eid);
        },
      });
      body.append(this._group('Posizione', [conv]));
    }

    // z-index: ha effetto solo su elementi posizionati → se "static" lo rendo relative (item 7)
    const bumpZ = (delta) => {
      if (cs.position === 'static') elm.style.position = 'relative';
      const cur = parseInt(elm.style.zIndex || cs.zIndex, 10) || 0;
      setStyle('zIndex', String(cur + delta), true);
    };

    // ---- Azioni ----
    const canParent = elm.parentElement && !elm.parentElement.classList.contains('ss-root');
    body.append(this._group('Elemento', [
      el('div', { class: 'insp__btns' }, [
        el('button', { class: 'btn btn--sm', text: '↑ Contenitore', title: 'Seleziona l\'elemento padre', disabled: canParent ? null : 'disabled', onClick: () => this.selectParent(eid) }),
        el('button', { class: 'btn btn--sm', text: 'Avanti', title: 'Porta in primo piano', onClick: () => bumpZ(1) }),
        el('button', { class: 'btn btn--sm', text: 'Indietro', title: 'Porta in fondo', onClick: () => bumpZ(-1) }),
        el('button', { class: 'btn btn--sm', text: 'Duplica', onClick: () => this.duplicateElement(eid) }),
        el('button', { class: 'btn btn--sm btn--danger', text: 'Elimina', onClick: () => this.deleteElement(eid) }),
      ]),
    ]));

    this.bodyEl.replaceChildren(body);
  }

  // ---- builders ----
  _group(title, children) {
    return el('section', { class: 'insp__group' }, [
      el('h4', { class: 'insp__gtitle', text: title }),
      ...children,
    ]);
  }
  _row(label, control) {
    return el('label', { class: 'insp__row' }, [
      el('span', { class: 'insp__label', text: label }), control,
    ]);
  }
  _select(options, current, cb) {
    const cur = String(current || '').trim();
    const s = el('select', { class: 'insp__ctl' });
    options.forEach(([val, label]) => {
      const o = el('option', { value: val, text: label });
      if (val && cur.includes(String(val).split(',')[0].replace(/["']/g, ''))) o.selected = true;
      s.append(o);
    });
    s.addEventListener('change', (e) => cb(e.target.value, true));
    return s;
  }
  _number(value, min, max, cb) {
    const i = el('input', { type: 'number', class: 'insp__ctl', value: String(value), min: String(min), max: String(max) });
    i.addEventListener('input', (e) => cb(Number(e.target.value), false));
    i.addEventListener('change', (e) => cb(Number(e.target.value), true));
    return i;
  }
  _range(value, cb) {
    const i = el('input', { type: 'range', class: 'insp__ctl insp__ctl--range', value: String(value), min: '0', max: '100' });
    i.addEventListener('input', (e) => cb(Number(e.target.value), false));
    i.addEventListener('change', (e) => cb(Number(e.target.value), true));
    return i;
  }
  _color(current, cb, allowTransparent = false) {
    const { hex, a } = rgbaParts(current);
    const wrap = el('div', { class: 'insp__color' });
    const sw = el('input', { type: 'color', class: 'insp__swatch', value: hex });
    let alpha = a;
    // alpha pieno → emette hex (compatibile con qualunque proprietà); altrimenti rgba
    const emit = (commit) => cb(alpha >= 1 ? sw.value : hexToRgba(sw.value, alpha), commit);
    sw.addEventListener('input', () => emit(false));
    sw.addEventListener('change', () => emit(true));
    wrap.append(sw);
    if (allowTransparent) {
      // slider opacità del colore stesso (preserva l'alpha invece di schiacciarlo)
      const rng = el('input', {
        type: 'range', class: 'insp__alpha', min: '0', max: '100',
        value: String(Math.round(a * 100)), title: 'Opacità del colore',
      });
      rng.addEventListener('input', () => { alpha = Number(rng.value) / 100; emit(false); });
      rng.addEventListener('change', () => { alpha = Number(rng.value) / 100; emit(true); });
      wrap.append(rng);
      wrap.append(el('button', {
        class: 'insp__clear', title: 'Trasparente', text: '∅',
        onClick: () => cb('transparent', true),
      }));
    }
    return wrap;
  }
  _segmented(options, current, cb) {
    const wrap = el('div', { class: 'insp__seg' });
    options.forEach(([val, label]) => {
      const b = el('button', {
        class: `insp__segbtn ${current === val ? 'is-on' : ''}`, text: label, title: val,
        onClick: () => { wrap.querySelectorAll('.insp__segbtn').forEach((n) => n.classList.remove('is-on')); b.classList.add('is-on'); cb(val); },
      });
      wrap.append(b);
    });
    return wrap;
  }
}

function rgbToHex(s) {
  if (!s) return null;
  if (s.startsWith('#')) return s;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b] = m[1].split(',').map((x) => parseInt(x, 10));
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Estrae { hex, a } da un colore CSS (rgb/rgba/#hex). a∈[0,1]. */
export function rgbaParts(s) {
  const m = String(s || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return { hex: rgbToHex(s) || '#000000', a: 1 };
  const p = m[1].split(',').map((x) => x.trim());
  const [r, g, b] = p.map((x) => parseInt(x, 10));
  if ([r, g, b].some((n) => Number.isNaN(n))) return { hex: '#000000', a: 1 };
  const a = p[3] != null ? parseFloat(p[3]) : 1;
  const hex = '#' + [r, g, b].map((n) => (n || 0).toString(16).padStart(2, '0')).join('');
  return { hex, a: Number.isFinite(a) ? a : 1 };
}

/** Combina #hex + alpha → stringa rgba(). */
export function hexToRgba(hex, a) {
  const m = String(hex).replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${+Number(a).toFixed(3)})`;
}

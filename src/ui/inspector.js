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
// clipboard colore condivisa fra i controlli (preserva la trasparenza)
let colorClip = null;
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
    this.copyFormat = () => {};
    this.makeFree = () => {};
    this.eyedrop = () => {}; // (cb) => attiva la pipetta sullo stage, poi cb(elemento)
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

    // Riempimento: molti deck stilano lo sfondo con `background: … !important` o con
    // GRADIENTI (background-image) che coprirebbero il colore → un semplice inline
    // `background-color` veniva ignorato "su alcune slide". Lo applichiamo con
    // `!important` e azzeriamo l'eventuale gradiente, così il colore vince sempre.
    const setFill = (val, commit) => {
      elm.style.setProperty('background-color', val, 'important');
      elm.style.setProperty('background-image', 'none', 'important');
      this.liveRefresh();
      if (commit) this.commit();
    };

    const body = el('div', { class: 'insp' });

    // ---- Immagine (crop + forma) — solo per <img> ----
    if (elm.tagName === 'IMG') {
      // per croppare serve un box fisso: se l'altezza è "auto", la congelo a quella attuale
      const ensureBox = () => {
        if (!elm.style.height || elm.style.height === 'auto') {
          elm.style.width = `${Math.round(elm.offsetWidth)}px`;
          elm.style.height = `${Math.round(elm.offsetHeight)}px`;
        }
      };
      const SHAPES = {
        rect:   { ic: '▭', clip: 'none', r: '0' },
        round:  { ic: '▢', clip: 'none', r: '18px' },
        circle: { ic: '●', clip: 'circle(50%)', r: '0' },
        rhomb:  { ic: '◆', clip: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)', r: '0' },
        hex:    { ic: '⬡', clip: 'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)', r: '0' },
      };
      body.append(this._group('Immagine', [
        this._row('Forma', this._segmented(Object.entries(SHAPES).map(([k, s]) => [k, s.ic]), '', (k) => {
          ensureBox();
          elm.style.objectFit = 'cover';            // riempi il box → la forma "ritaglia"
          elm.style.clipPath = SHAPES[k].clip;
          elm.style.borderRadius = SHAPES[k].r;
          this.liveRefresh(); this.commit();
        })),
        this._row('Adatta', this._segmented([['cover', 'Riempi'], ['contain', 'Adatta']], cs.objectFit, (v) => {
          ensureBox(); setStyle('objectFit', v, true);
        })),
      ]));
    }

    // ---- Testo ----
    body.append(this._group('Testo', [
      this._row('Font', this._select(FONTS, cs.fontFamily, (v, c) => setStyle('fontFamily', v, c))),
      this._row('Dim.', this._number(parseInt(cs.fontSize, 10) || 16, 6, 200, (v, c) => setStyle('fontSize', `${v}px`, c))),
      this._row('Peso', this._select(WEIGHTS, cs.fontWeight, (v, c) => setStyle('fontWeight', v, c))),
      this._row('Colore', this._color(cs.color, (v, c) => setStyle('color', v, c), { pickProp: 'color', quickBW: true })),
      this._row('Allinea', this._segmented(ALIGNS, cs.textAlign, (v) => setStyle('textAlign', v, true))),
    ]));

    // ---- Riempimento & bordo ----
    const borderW = parseInt(cs.borderTopWidth, 10) || 0;
    body.append(this._group('Riempimento e bordo', [
      this._row('Sfondo', this._color(cs.backgroundColor, (v, c) => setFill(v, c), { allowTransparent: true, fallbackHex: rgbToHex(cs.color) || '#ffffff', pickProp: 'backgroundColor' })),
      // Bordo (colore): se non c'è ancora un bordo visibile, ne crea uno (solid, 2px)
      this._row('Bordo', this._color(cs.borderTopColor, (v, c) => {
        elm.style.borderColor = v;
        if (borderW === 0 || cs.borderTopStyle === 'none') {
          elm.style.borderStyle = 'solid';
          if (!parseInt(elm.style.borderWidth, 10)) elm.style.borderWidth = '2px';
        }
        this.liveRefresh(); if (c) this.commit();
      }, { allowTransparent: true, fallbackHex: rgbToHex(cs.color) || '#888888', pickProp: 'borderTopColor' })),
      this._row('Spessore', this._number(borderW, 0, 40, (v, c) => {
        elm.style.borderWidth = `${v}px`;
        elm.style.borderStyle = v > 0 ? 'solid' : 'none';
        this.liveRefresh(); if (c) this.commit();
      })),
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
        el('button', { class: 'btn btn--sm', text: '🖌 Copia formato', title: t('Copia lo stile di questo elemento, poi clicca quello a cui applicarlo'), onClick: () => this.copyFormat(eid) }),
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
  _color(current, cb, opts = {}) {
    const allowTransparent = opts === true || !!opts.allowTransparent;
    const fallbackHex = (opts && opts.fallbackHex) || null;
    const pickProp = (opts && opts.pickProp) || null; // proprietà CSS letta dalla pipetta
    const { hex, a } = rgbaParts(current);
    // su elemento TRASPARENTE lo swatch parte da un colore visibile (non nero): così
    // muovere l'opacità o scegliere un colore producono sempre un risultato visibile.
    const startHex = (a === 0 && fallbackHex) ? fallbackHex : hex;
    const wrap = el('div', { class: 'insp__color' });
    const sw = el('input', { type: 'color', class: 'insp__swatch', value: startHex });
    let alpha = a;
    let rng = null;
    // alpha pieno → emette hex (compatibile con qualunque proprietà); altrimenti rgba
    const value = () => (alpha >= 1 ? sw.value : hexToRgba(sw.value, alpha));
    const emit = (commit) => cb(value(), commit);
    // scegliere un colore dallo swatch deve renderlo VISIBILE: se l'elemento ha un fill
    // quasi-trasparente (tipico di card/forme del deck, alpha 0.06–0.18) il cambio di
    // colore sarebbe impercettibile. Come PowerPoint/Figma lo swatch porta il colore a
    // opaco; la translucenza resta governata dallo slider alpha dedicato a fianco.
    const pick = (commit) => { if (alpha < 1) { alpha = 1; if (rng) rng.value = '100'; } emit(commit); };
    // applica un rgba arbitrario (incolla / pipetta): aggiorna swatch + opacità + commit
    const applyColor = (rgba) => {
      const p = rgbaParts(rgba);
      sw.value = p.hex; alpha = p.a; if (rng) rng.value = String(Math.round(p.a * 100));
      cb(rgba, true);
    };
    sw.addEventListener('input', () => pick(false));
    sw.addEventListener('change', () => pick(true));
    wrap.append(sw);
    // scorciatoie bianco/nero (comode per il colore del testo)
    if (opts && opts.quickBW) {
      wrap.append(el('button', {
        class: 'insp__bw insp__bw--black', title: t('Nero'),
        onClick: () => applyColor('#000000'),
      }));
      wrap.append(el('button', {
        class: 'insp__bw insp__bw--white', title: t('Bianco'),
        onClick: () => applyColor('#ffffff'),
      }));
    }
    if (allowTransparent) {
      // slider opacità del colore stesso (preserva l'alpha invece di schiacciarlo)
      rng = el('input', {
        type: 'range', class: 'insp__alpha', min: '0', max: '100',
        value: String(Math.round(a * 100)), title: 'Opacità del colore',
      });
      rng.addEventListener('input', () => { alpha = Number(rng.value) / 100; emit(false); });
      rng.addEventListener('change', () => { alpha = Number(rng.value) / 100; emit(true); });
      wrap.append(rng);
    }
    // copia / incolla colore (con la trasparenza). Clipboard condivisa fra i controlli.
    wrap.append(el('button', {
      class: 'insp__cbtn', title: 'Copia colore (con trasparenza)', text: '⧉',
      onClick: () => { colorClip = value(); },
    }));
    wrap.append(el('button', {
      class: 'insp__cbtn', title: 'Incolla colore', text: '⤓',
      onClick: () => { if (colorClip) applyColor(colorClip); },
    }));
    // pipetta: preleva il colore (con la trasparenza) dallo STILE di un elemento cliccato
    // — la pipetta di sistema campiona il pixel composito e perde l'alpha, questa no.
    if (pickProp) {
      wrap.append(el('button', {
        class: 'insp__cbtn', title: 'Pipetta: preleva il colore (con trasparenza) da un elemento',
        html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.4-1.4-1.42 1.41 1.06 1.06L4 16.16V20h3.84l7.58-7.58 1.06 1.06 1.41-1.42-1.4-1.4 3.12-3.12a1 1 0 0 0 0-1.49zM6.99 18H6v-.99l7.07-7.07.99.99L6.99 18z"/></svg>',
        onClick: () => this.eyedrop((target) => {
          const w = target.ownerDocument.defaultView;
          applyColor(w.getComputedStyle(target)[pickProp]);
        }),
      }));
    }
    if (allowTransparent) {
      wrap.append(el('button', {
        class: 'insp__clear', title: 'Trasparente', text: '∅',
        onClick: () => { alpha = 0; if (rng) rng.value = '0'; cb('transparent', true); },
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

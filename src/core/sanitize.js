/**
 * Sanitizzazione HTML: toglie i vettori di esecuzione codice da deck importati,
 * incollati o generati dall'agente. NON sostituisce la sandbox degli iframe
 * (difesa in profondità: vedi `sandbox` su stage/thumbnail), ma chiude i casi
 * pratici a monte, così anche l'HTML *esportato* (aperto altrove) è pulito:
 *   - <script> (anche inline);
 *   - attributi event handler inline (on*  →  onerror/onclick/onload…);
 *   - URL `javascript:` in href/src/action/formaction/xlink:href.
 */

const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);

/** Ripulisce in-place un DocumentFragment o Element (inclusi i figli di 1° livello). */
export function sanitizeFragment(root) {
  root.querySelectorAll('script').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { node.removeAttribute(attr.name); continue; }
      if (URL_ATTRS.has(name) && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  });
  return root;
}

/** Versione su stringa: innerHTML → innerHTML ripulito. */
export function sanitizeHtml(html) {
  if (!html) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  sanitizeFragment(tpl.content);
  return tpl.innerHTML;
}

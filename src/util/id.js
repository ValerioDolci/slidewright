/** Generatori di id stabili per slide ed elementi editor. */

let _counter = 0;

/** id breve, ordinabile, univoco nella sessione. */
export function uid(prefix = 'id') {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

/** Attributo interno con cui marchiamo gli elementi nel DOM della slide.
 *  Viene SEMPRE rimosso in fase di export (vedi export-html.js). */
export const EDITOR_ATTR = 'data-ss-eid';

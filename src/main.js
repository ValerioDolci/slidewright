/** Bootstrap dell'editor. */
import { App } from './ui/app.js';

window.addEventListener('DOMContentLoaded', () => {
  // stagger reveal su page-load (rispetta prefers-reduced-motion via CSS)
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
  // eslint-disable-next-line no-new
  window.__app = new App();
});

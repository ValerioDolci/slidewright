/** Bootstrap dell'editor (guscio browser). */
import { App } from './ui/app.js';
import { WebPlatform } from './platform/web.js';
import { mountLayout } from './ui/layout.js';

window.addEventListener('DOMContentLoaded', () => {
  mountLayout(); // markup workspace condiviso (vedi ui/layout.js)
  // stagger reveal su page-load (rispetta prefers-reduced-motion via CSS)
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
  // eslint-disable-next-line no-new
  window.__app = new App({ platform: new WebPlatform() });
});

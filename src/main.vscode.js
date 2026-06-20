/** Bootstrap dell'editor (guscio webview VS Code). */
import { App } from './ui/app.js';
import { VsCodePlatform } from './platform/vscode.js';
import { mountLayout } from './ui/layout.js';

window.addEventListener('DOMContentLoaded', () => {
  mountLayout(); // markup workspace condiviso (vedi ui/layout.js)
  requestAnimationFrame(() => document.body.classList.add('is-ready'));

  const platform = new VsCodePlatform();
  const app = new App({ platform });
  window.__app = app;

  // Il documento è fornito dall'host (Custom Editor) → carica al "load".
  platform.onLoad((m) => app.loadFromHost(m.text, m.name));
  platform.onExternalChange((m) => app.loadFromHost(m.text, app._fileName));
});

/**
 * Markup del workspace, condiviso dai due gusci (web e webview VS Code) per non
 * duplicare la UI tra due entry HTML. Le entry restano "shell" minimali: chiamano
 * `mountLayout(document.body)` prima di costruire l'App.
 *
 * Niente `<script>` qui: l'avvio lo fa l'entry (main.js / main.vscode.js).
 */

export const WORKSPACE_HTML = `
  <!-- Drop overlay (import deck) -->
  <div id="drop-overlay" class="drop-overlay" hidden>
    <div class="drop-overlay__card">
      <div class="drop-overlay__icon">⤓</div>
      <p class="drop-overlay__title">Rilascia qui il tuo <code>deck.html</code></p>
      <p class="drop-overlay__sub">Verranno importati stile e slide</p>
    </div>
  </div>

  <header class="topbar" data-reveal>
    <div class="topbar__brand">
      <span class="topbar__mark">◳</span>
      <span class="topbar__name">Slide&nbsp;Studio</span>
    </div>

    <div class="topbar__group" role="group" aria-label="File">
      <button class="btn" data-action="import" title="Apri un deck .html (le modifiche si salveranno su quel file)">Apri</button>
      <button class="btn" data-action="save" title="Salva sul file (⌘S)">Salva</button>
      <button class="btn" data-action="new-deck" title="Nuovo deck vuoto">Nuovo</button>
      <span class="topbar__sep"></span>
      <button class="btn" data-action="export-html" title="Esporta una copia HTML">Esporta HTML</button>
      <button class="btn" data-action="export-pdf" title="Esporta PDF (stesso formato slide)">Esporta PDF</button>
    </div>

    <div class="topbar__group" role="group" aria-label="Modifica">
      <button class="btn btn--icon" data-action="undo" title="Annulla (⌘Z)" disabled>↶</button>
      <button class="btn btn--icon" data-action="redo" title="Ripeti (⇧⌘Z)" disabled>↷</button>
      <span class="topbar__sep"></span>
      <button class="btn" data-action="add-text" title="Aggiungi una casella di testo"><span class="btn__ic">T</span> Testo</button>
      <button class="btn" data-action="add-box" title="Aggiungi una forma"><span class="btn__ic">▢</span> Forma</button>
      <button class="btn" data-action="add-image" title="Aggiungi un'immagine"><span class="btn__ic">▣</span> Immagine</button>
    </div>

    <div class="topbar__spacer">
      <span class="topbar__file" id="file-status" data-i18n-skip title="File di lavoro"></span>
    </div>

    <div class="topbar__group">
      <button class="btn btn--ghost" data-action="chat" title="Apri la chat con l'agente">✨ Agente</button>
      <button class="btn btn--icon" data-action="lang" data-i18n-skip title="Lingua interfaccia / Interface language" aria-label="Lingua">IT</button>
      <button class="btn btn--icon" data-action="theme" title="Tema chiaro / scuro" aria-label="Tema">☾</button>
      <button class="btn btn--icon" data-action="help" title="Aiuto: gesti e scorciatoie" aria-label="Aiuto">?</button>
      <button class="btn btn--ghost" data-action="present" title="Presenta a schermo intero">Presenta ▸</button>
    </div>
  </header>

  <!-- Help popover (gesti + scorciatoie) -->
  <div id="help-pop" class="help" hidden>
    <div class="help__card">
      <button class="help__close" data-action="help-close" aria-label="Chiudi">✕</button>
      <h3 class="help__title">Come si usa</h3>
      <div class="help__cols">
        <div>
          <h4>Gesti</h4>
          <ul>
            <li><b>Click</b> → seleziona · <b>click di nuovo</b> → scrivi nel testo</li>
            <li><b>⌥-click</b> → seleziona l'elemento <b>sotto</b> a quelli sovrapposti</li>
            <li><b>Crocetta ✥</b> sopra il box → sposta <span class="help__k">snap · Alt = libero</span></li>
            <li><b>Maniglie</b> → ridimensiona <span class="help__k">Shift = mantieni proporzioni</span></li>
            <li><b>Trascina un file .html</b> nella finestra → importa deck</li>
          </ul>
        </div>
        <div>
          <h4>Scorciatoie</h4>
          <ul>
            <li><span class="help__k">⌘S</span> salva sul file</li>
            <li><span class="help__k">⌘Z</span> / <span class="help__k">⇧⌘Z</span> annulla / ripeti</li>
            <li><span class="help__k">⌘C</span> / <span class="help__k">⌘V</span> / <span class="help__k">⌘D</span> copia / incolla / duplica</li>
            <li><span class="help__k">Tab</span> / <span class="help__k">⇧Tab</span> scorri gli elementi della slide</li>
            <li><span class="help__k">← ↑ → ↓</span> sposta 1px <span class="help__k">Shift = 10px</span></li>
            <li><span class="help__k">Canc</span> elimina · <span class="help__k">Esc</span> deseleziona</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <main class="workspace">
    <!-- LEFT: slide thumbnails -->
    <aside class="sidebar" data-reveal>
      <div class="panel__head">
        <span class="panel__title">Slide</span>
        <button class="btn btn--icon btn--sm" data-action="add-slide" title="Nuova slide">+</button>
      </div>
      <ol class="thumbs" id="thumbs"></ol>
    </aside>

    <!-- CENTER: stage -->
    <section class="stage" id="stage" data-reveal>
      <div class="stage__scene" id="stage-scene">
        <div class="stage__canvas" id="stage-canvas">
          <iframe id="slide-frame" class="stage__frame" title="Slide" referrerpolicy="no-referrer" sandbox="allow-same-origin"></iframe>
          <div class="overlay" id="overlay"></div>
        </div>
      </div>
      <div class="stage__bar">
        <span class="stage__zoom" id="zoom-label" data-i18n-skip>—</span>
        <span class="stage__warn" id="stage-warn" hidden>⚠ contenuto oltre i bordi (verrà tagliato in stampa)</span>
        <span class="stage__hint" id="stage-hint" data-i18n-skip>Importa un deck o crea un nuovo deck per iniziare</span>
      </div>
    </section>

    <!-- RIGHT: inspector -->
    <aside class="inspector" id="inspector" data-reveal>
      <div class="panel__head">
        <span class="panel__title" id="inspector-title" data-i18n-skip>Proprietà</span>
      </div>
      <div class="inspector__body" id="inspector-body">
        <p class="inspector__empty">Nessun elemento selezionato.<br />Clicca un elemento sulla slide.</p>
      </div>
    </aside>
  </main>

  <input type="file" id="image-input" accept="image/*" hidden />
`;

/** Inietta il markup del workspace nel contenitore dato (di norma document.body). */
export function mountLayout(root = document.body) {
  root.insertAdjacentHTML('afterbegin', WORKSPACE_HTML);
}

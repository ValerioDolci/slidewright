/**
 * ChatPanel: finestra flottante con l'assistente + configurazione delle
 * connessioni LLM (provider-neutrale). Le connessioni e la scelta attiva
 * vivono in localStorage. La UI è "muta": emette onSend(text); l'app esegue
 * l'agente e richiama addAssistant/addError/addStep.
 */

import { el } from '../util/dom.js';
import { PROVIDER_PRESETS } from '../core/llm.js';
import { uid } from '../util/id.js';

const LS_CONN = 'ss-llm-connections';
const LS_ACTIVE = 'ss-llm-active';

export class ChatPanel {
  constructor() {
    this.onSend = () => {};
    this.busy = false;
    this._loadConnections();
    this._build();
  }

  // ---------- connessioni ----------
  _loadConnections() {
    try { this.connections = JSON.parse(localStorage.getItem(LS_CONN)) || []; } catch (_) { this.connections = []; }
    try { this.activeId = localStorage.getItem(LS_ACTIVE) || null; } catch (_) { this.activeId = null; }
    if (!this.activeId && this.connections[0]) this.activeId = this.connections[0].id;
  }
  _saveConnections() {
    try {
      localStorage.setItem(LS_CONN, JSON.stringify(this.connections));
      localStorage.setItem(LS_ACTIVE, this.activeId || '');
    } catch (_) { /* noop */ }
  }
  getActiveConnection() {
    return this.connections.find((c) => c.id === this.activeId) || null;
  }

  // ---------- DOM ----------
  _build() {
    this.msgs = el('div', { class: 'chat__msgs' });
    this.input = el('textarea', { class: 'chat__input', rows: '2', placeholder: 'Chiedi all\'agente di modificare le slide…' });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submit(); }
    });
    this.sendBtn = el('button', { class: 'btn btn--accent chat__send', text: 'Invia', onClick: () => this._submit() });

    this.panel = el('div', { class: 'chat', hidden: 'hidden' }, [
      el('div', { class: 'chat__head' }, [
        el('span', { class: 'chat__title', text: '✨ Agente' }),
        el('span', { class: 'chat__conn', id: 'chat-conn' }),
        el('button', { class: 'chat__icon', title: 'Impostazioni connessioni', text: '⚙', onClick: () => this._openSettings() }),
        el('button', { class: 'chat__icon', title: 'Chiudi', text: '✕', onClick: () => this.close() }),
      ]),
      this.msgs,
      el('div', { class: 'chat__compose' }, [this.input, this.sendBtn]),
    ]);
    document.body.append(this.panel);

    // modale impostazioni
    this.settings = el('div', { class: 'chat-settings', hidden: 'hidden' });
    this.settings.addEventListener('click', (e) => { if (e.target === this.settings) this.settings.hidden = true; });
    document.body.append(this.settings);

    this._refreshConnLabel();
    if (this.connections.length === 0) {
      this._sys('Nessuna connessione LLM. Apri ⚙ per configurarne una (es. la tua Mistral, oppure Ollama in locale).');
    }
  }

  toggle() { this.panel.hidden ? this.open() : this.close(); }
  open() { this.panel.hidden = false; this.input.focus(); }
  close() { this.panel.hidden = true; }

  _refreshConnLabel() {
    const c = this.getActiveConnection();
    const l = this.panel.querySelector('#chat-conn');
    if (l) l.textContent = c ? `${c.name} · ${c.model}` : 'nessuna connessione';
  }

  // ---------- messaggi ----------
  _bubble(role, text) {
    const b = el('div', { class: `chat__b chat__b--${role}` }, [el('div', { class: 'chat__bx', text })]);
    this.msgs.append(b);
    this.msgs.scrollTop = this.msgs.scrollHeight;
    return b;
  }
  addUser(t) { this._bubble('user', t); }
  addAssistant(t) { this._bubble('assistant', t); }
  addError(t) { this._bubble('error', t); }
  _sys(t) { this._bubble('sys', t); }
  addStep(name, args) {
    const idx = args && (args.index ?? args.from);
    this._bubble('step', `⚙ ${name}${idx != null ? ` (#${idx})` : ''}`);
  }

  setBusy(b) {
    this.busy = b;
    this.sendBtn.disabled = b;
    this.input.disabled = b;
    this.sendBtn.textContent = b ? '…' : 'Invia';
  }

  _submit() {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    if (!this.getActiveConnection()) { this._openSettings(); return; }
    this.input.value = '';
    this.addUser(text);
    this.onSend(text);
  }

  // ---------- impostazioni connessioni ----------
  _openSettings(editId) {
    const editing = editId
      ? this.connections.find((c) => c.id === editId)
      : { id: null, name: '', type: 'openai', baseUrl: '', model: '', apiKey: '' };
    const draft = { ...editing };

    const presetSel = el('select', { class: 'insp__ctl' }, [
      el('option', { value: '', text: '— preset —' }),
      ...PROVIDER_PRESETS.map((p) => el('option', { value: p.name, text: p.name })),
    ]);
    presetSel.addEventListener('change', () => {
      const p = PROVIDER_PRESETS.find((x) => x.name === presetSel.value);
      if (p) { draft.name = draft.name || p.name; draft.baseUrl = p.baseUrl; draft.model = p.model; draft.type = p.type; fill(); }
    });

    const fName = el('input', { class: 'insp__ctl', placeholder: 'Nome (es. Mistral mia)' });
    const fUrl = el('input', { class: 'insp__ctl', placeholder: 'Base URL (es. https://api.mistral.ai/v1)' });
    const fModel = el('input', { class: 'insp__ctl', placeholder: 'Modello (es. mistral-large-latest)' });
    const fKey = el('input', { class: 'insp__ctl', type: 'password', placeholder: 'API key (resta in locale)' });
    const fill = () => { fName.value = draft.name || ''; fUrl.value = draft.baseUrl || ''; fModel.value = draft.model || ''; fKey.value = draft.apiKey || ''; };
    fill();

    const list = el('div', { class: 'chat-settings__list' },
      this.connections.length
        ? this.connections.map((c) => el('div', { class: `chat-settings__row ${c.id === this.activeId ? 'is-active' : ''}` }, [
            el('label', { class: 'chat-settings__pick' }, [
              el('input', { type: 'radio', name: 'active', checked: c.id === this.activeId ? 'checked' : null, onChange: () => { this.activeId = c.id; this._saveConnections(); this._refreshConnLabel(); } }),
              el('span', { text: `${c.name} · ${c.model}` }),
            ]),
            el('button', { class: 'btn btn--sm', text: 'Modifica', onClick: () => this._openSettings(c.id) }),
            el('button', { class: 'btn btn--sm btn--danger', text: 'Elimina', onClick: () => { this.connections = this.connections.filter((x) => x.id !== c.id); if (this.activeId === c.id) this.activeId = this.connections[0]?.id || null; this._saveConnections(); this._refreshConnLabel(); this._openSettings(); } }),
          ]))
        : [el('p', { class: 'inspector__empty', text: 'Nessuna connessione ancora.' })]
    );

    const save = () => {
      draft.name = fName.value.trim() || 'Connessione';
      draft.baseUrl = fUrl.value.trim();
      draft.model = fModel.value.trim();
      draft.apiKey = fKey.value;
      draft.type = 'openai';
      if (!draft.baseUrl || !draft.model) { alert('Servono almeno Base URL e Modello.'); return; }
      if (draft.id) {
        const i = this.connections.findIndex((c) => c.id === draft.id);
        this.connections[i] = draft;
      } else {
        draft.id = uid('conn');
        this.connections.push(draft);
        this.activeId = draft.id;
      }
      this._saveConnections();
      this._refreshConnLabel();
      this._openSettings();
    };

    this.settings.replaceChildren(
      el('div', { class: 'chat-settings__card' }, [
        el('div', { class: 'chat-settings__head' }, [
          el('h3', { class: 'help__title', text: 'Connessioni LLM' }),
          el('button', { class: 'help__close', text: '✕', onClick: () => { this.settings.hidden = true; } }),
        ]),
        list,
        el('div', { class: 'chat-settings__sep' }),
        el('h4', { class: 'insp__gtitle', text: editId ? 'Modifica connessione' : 'Nuova connessione' }),
        el('div', { class: 'chat-settings__form' }, [
          presetSel, fName, fUrl, fModel, fKey,
        ]),
        el('p', { class: 'chat-settings__note', html: 'La chiave resta in locale. Alcuni provider bloccano la chiamata dal browser (CORS): se fallisce, usa <b>Ollama/LM Studio</b> in locale, <b>OpenRouter</b>, o un piccolo proxy.' }),
        el('div', { class: 'insp__btns' }, [
          el('button', { class: 'btn btn--accent btn--sm', text: 'Salva connessione', onClick: save }),
          el('button', { class: 'btn btn--sm', text: 'Chiudi', onClick: () => { this.settings.hidden = true; } }),
        ]),
      ])
    );
    this.settings.hidden = false;
  }
}

# Slide Studio — Chat agentica & percorso VS Code (nota di fattibilità)

> Documento di lavoro. Raccoglie la discussione su (1) aggiungere una **chat agentica**
> dentro Slide Studio per chiedere modifiche in linguaggio naturale, provider-neutrale, e
> (2) il bivio strategico **tool browser** vs **estensione VS Code** (per usare Copilot).
> Non è una decisione presa: è materiale per decidere sui fatti.
>
> Stato: **IMPLEMENTATO** (2026-06-20) sul branch `feat/vscode-extension`. Questo
> documento resta come razionale/decisione; lo stato corrente e i comandi sono in
> `CLAUDE.md` (sez. "RISTRUTTURATO PER ESTENSIONE VS CODE") e nel `README.md`.
> Direzione presa: **B con host-adapter** (web + estensione conviventi), chat **3C**
> (Copilot via `vscode.lm` + openai-compat dall'host).

---

## 1. Idea

Una **chat dentro l'editor**: l'utente scrive ("rendi i titoli più grandi", "aggiungi una slide
di chiusura", "palette più fredda") e un **agente LLM** interpreta e applica le modifiche al deck.
Provider-neutrale: "attacchi il modulo API (base URL + key + modello) e via".

## 2. Perché parte avvantaggiato

Il punto critico di un editor agentico è **applicare le modifiche in modo sicuro e reversibile**.
In Slide Studio c'è già:
- **Modello JSON pulito** del deck (`{meta, canvas, styleCss, slides:[{id,classes,html}]}`) →
  ideale da dare a un LLM e da modificare in modo strutturato (NON si fa toccare il DOM vivo).
- Ogni modifica passa da **`store.commit` → undo/redo + autosave su file**. Quindi le modifiche
  dell'agente sarebbero **annullabili e salvate** automaticamente. È la parte che di solito costa
  di più, ed è già fatta.

## 3. Architettura proposta (provider-neutrale, stile factory env-driven)

- Interfaccia sottile `LLMProvider.chat(messages, {tools}) → {text, toolCalls}`.
- **Un adapter "OpenAI-compatible"** copre da solo: OpenAI, OpenRouter, Groq, Together,
  **Ollama / LM Studio in locale**, llama.cpp, Azure OpenAI… + un adapter **Anthropic**.
  "Attacchi il modulo": incolli **base URL + API key + nome modello** in un pannello impostazioni,
  salvato in locale (localStorage).
- L'agente modifica via **tool-calling**: `update_slide`, `set_style_css`, `add_slide`,
  `delete_slide`, `reorder`, `update_element`, `get_slide`… **ogni tool = un commit nello store**
  (→ undo/redo/autosave continuano a funzionare). Fallback per modelli senza tool-calling:
  "riscrivi l'HTML di questa slide".
- **Preview prima di applicare**: "l'agente propone queste modifiche → [Applica] [Annulla]" + undo.
  Gli `<script>` vengono comunque strippati (già lo facciamo in import/export).
- **Token-aware**: non si manda tutto il deck ogni turno → meta + `styleCss` + slide corrente +
  elenco titoli; l'agente chiede le altre con `get_slide`. Importante per deck grandi / costi.

## 4. Caveat onesti (validi per il tool browser/locale)

1. **Niente backend** (è il pregio del tool). Il browser chiama l'API del provider **direttamente**
   e la **chiave sta in locale**. OK per uso personale, **non** per distribuzione a terzi.
2. **CORS**: non tutti i provider permettono la chiamata diretta da browser.
   - ✅ Chiamabili da browser: **Mistral** (CORS `*` — **VERIFICATO 2026-06-19**: preflight 200,
     `access-control-allow-origin: *`, Authorization ammesso; funziona anche da `file://`),
     **Ollama locale**, **LM Studio locale**, **OpenRouter**,
     **Anthropic** (con header `anthropic-dangerous-direct-browser-access: true`), **Azure OpenAI**.
   - ⚠️ **OpenAI "puro"**: spesso serve un **mini-proxy locale** o un gateway CORS-friendly.
3. **Costo token**: deck grandi = contesto; gestibile con la strategia §3, ma da monitorare.

## 5. Copilot (GitHub / M365) — perché NON si aggancia direttamente

### GitHub Copilot
- **Nessuna API pubblica** per usarne il modello come backend generico. Gli endpoint usati da
  VS Code/JetBrains sono **interni e gated** (token Copilot generato dall'auth dell'editor
  ufficiale). Usarli da un'app terza è **contro i ToS** + bloccato + CORS.
- Vie legittime = l'**inverso**: costruire una **Copilot Extension** (agente *dentro* Copilot Chat).
- **Unico modo serio di riusare la licenza Copilot**: far diventare Slide Studio una **estensione
  VS Code** e usare la **VS Code Language Model API** (`vscode.lm`). Vedi §7.

### M365 Copilot
- **Niente "chat completions" con API key**. Prodotto a licenza utente, auth **Entra ID / OAuth2**
  (app registration, consenso admin). Le **Copilot API di Microsoft Graph** servono a
  *retrieval/grounding sui dati M365* o a costruire agenti con **Copilot Studio** — **non** sono un
  endpoint LLM generico per "modificami le slide".
- ⚠️ Distinzione: **Azure OpenAI** invece **è** un endpoint vero (deployment con key+URL,
  **openai-compatible**) → si aggancia al nostro adapter senza problemi. Ma è "Azure OpenAI",
  non "M365 Copilot".

### Provider realmente agganciabili in un tool browser/locale
OpenRouter · Ollama/LM Studio locale · Azure OpenAI · Anthropic · (OpenAI puro con mini-proxy).
**Copilot entra solo cambiando forma → estensione VS Code.**

---

## 6. Il bivio strategico

- **A) Resta tool locale "doppio-click"** → provider via key (OpenRouter / Ollama / Azure / Anthropic).
  Mantiene l'universalità (qualsiasi browser), ma niente Copilot e key in locale.
- **B) Diventa (anche) estensione VS Code** → puoi usare **Copilot via `vscode.lm`** (no key, no CORS,
  sulla sottoscrizione dell'utente) + integrazione file/save/undo native. Ma perdi il "doppio-click
  puro" e aggiungi il mondo VS Code.

**Modo intelligente per non spaccare il progetto:** isolare un **"host adapter"**.
- **core** invariato (model/store/import/export/ui),
- shell **web** → File System Access + fetch ai provider,
- shell **vscode** → `vscode.workspace.fs` + `vscode.lm`.
Stesso cuore, due gusci sottili: aggiungi VS Code **senza** buttare il tool browser.

---

## 7. Estensione VS Code — come si farebbe e cosa comporta

### Cos'è
Un **pacchetto Node** con: manifest `package.json` (contribution points), entry `extension.js`
con `activate(context)` che gira nell'**Extension Host** (Node), UI dentro una **Webview**.
La UI web di Slide Studio entra quasi pari pari nella Webview.

### I 3 pezzi chiave
1. **Custom Editor** — aprendo un `.html` (deck) VS Code apre Slide Studio come suo editor:
   ```js
   vscode.window.registerCustomEditorProvider('slidewright.deck', provider)
   ```
   Il file diventa il **documento di VS Code** → gratis: **save, dirty, undo, hot-exit**.
2. **Webview ⇄ Extension via messaggi** (la webview è sandboxata):
   ```js
   // webview
   vscode.postMessage({ type: 'save', html });
   // extension host
   panel.webview.onDidReceiveMessage(m => { if (m.type==='save') saveDoc(m.html); });
   ```
   Il salvataggio passa da `vscode.workspace.fs` / API documento (più pulito di FS Access API).
3. **Chat con Copilot via `vscode.lm`** — il motivo di tutto:
   ```js
   const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot' });
   const res = await model.sendRequest(messages, {}, token);
   for await (const chunk of res.text) panel.webview.postMessage({ type:'token', chunk });
   ```
   Gira nell'extension host → **niente CORS, niente API key**, usa la **sottoscrizione Copilot**
   dell'utente. La webview manda "chiedi all'agente", l'estensione chiama `vscode.lm`, ristreamma.

### Cosa cambia / cosa comporta
- **Webview = sandbox**: CSP stretta, risorse via `asWebviewUri`, niente `window.open`/picker,
  stato in `globalState`/`workspaceState` invece di `localStorage`.
- **Build doppia**: webview (vite/esbuild) + extension host (tsc) → pacchetto `.vsix` (`vsce package`).
- ⚠️ **Export PDF**: il trucco `window.print()` **non funziona uguale in webview** (niente dialogo).
  Da rifare (es. aprire il deck nel browser esterno per stampare). È l'attrito tecnico maggiore.
- **Guadagni**: Copilot/altri modelli senza key né CORS; integrazione file/save/undo native;
  distribuzione via Marketplace.
- **Perdi**: il "doppio-click in qualsiasi browser"; e se tieni **entrambe** le versioni →
  **due shell da mantenere** (mitigato dall'host adapter §6).

---

## 8. Pubblicazione / installazione dell'estensione

### A) Solo per te / il team — niente account, subito
```bash
npm i -g @vscode/vsce
vsce package                                  # → slidewright-0.1.0.vsix
code --install-extension slidewright-0.1.0.vsix
```
(oppure UI: Extensions → "…" → "Install from VSIX…"). Condivisione: allegare il `.vsix` a una
**GitHub Release**. Limite: **non cercabile** nel pannello Extensions (serve avere il file).

### B) Marketplace ufficiale — cercabile dentro VS Code da chiunque
Serve un **publisher** (richiede org **Azure DevOps** + **PAT** scope Marketplace→Manage):
```bash
vsce login <publisher>     # incolli il PAT
vsce publish
```
Da lì è ricercabile/installabile da tutti, con auto-update.

### C) Open VSX — per **Cursor / VSCodium / Gitpod / Theia** (non usano il Marketplace MS)
```bash
npm i -g ovsx
ovsx publish slidewright-0.1.0.vsix -p <token-openvsx>   # account open-vsx.org
```

### `package.json` minimo per pubblicare
`name`, `publisher`, `version`, `engines.vscode`, `displayName`, `description`, `categories`,
`repository`, `license` + **icona 128×128 PNG** + **README.md** (= pagina Marketplace).

---

## 9. Stima sforzo

| Blocco | Stima |
|---|---|
| Chat agentica v1 minimale (1 provider openai-compat, "modifica slide corrente", preview+undo, no streaming) | ~1 giorno |
| Chat agentica v1 solida (factory multi-provider + Anthropic, tool-calling completo, streaming, settings, token-control, test) | ~3–4 giorni |
| Estensione VS Code: Custom Editor + webview (apri/modifica/salva deck) | ~2–4 giorni |
| Chat via `vscode.lm` (riusa loop tool→commit→preview→undo) | ~1–2 giorni |
| Costo ricorrente | fix PDF in webview + manutenzione doppia shell |

(Stime di progettazione, da confermare con un mini-spike prima di impegni grossi — Regola 3.)

---

## 10. Raccomandazione & decisioni aperte

- **Per validare l'idea agentica** senza cambiare natura al prodotto: **v1 minimale su Ollama
  locale o OpenRouter** (chiamabili da browser, zero attriti; Ollama pure gratis/privato).
  Si valida il loop *chat → tool → commit → preview → undo* su qualcosa di reale.
- **Copilot** entra solo con la **strada B (estensione VS Code)**; ha senso se il tuo flusso vive
  già in VS Code. Prima di impegnarsi: fare l'**host adapter** (§6) così le due strade convivono.

**Decisioni da prendere (Valerio):**
1. Direzione: **A** (browser + provider-key) e/o **B** (estensione VS Code + Copilot).
2. Provider di partenza per la chat: Ollama locale / OpenRouter / Azure OpenAI / Anthropic.
3. Scope primo giro: solo "modifica slide corrente" vs tool-calling su tutto il deck.
4. Distribuzione estensione (se B): solo `.vsix` (A) ora, Marketplace/Open VSX dopo.

> Nessun codice di questa parte va scritto finché Valerio non sceglie la direzione.

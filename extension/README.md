# Slide Studio (slidewright) — estensione VS Code

Editor visuale per **deck di slide HTML** dentro VS Code: riordino slide,
editing del testo e grafico (sposta/ridimensiona, proprietà), export e — dagli
step successivi — un **agente LLM** che usa **Copilot** via `vscode.lm`.

Stessa UI del tool web "doppio-click": qui gira in una **webview**, mentre
l'apertura/salvataggio passano dal **documento di VS Code** (dirty/undo nativi).

## Come si usa

- Click destro su un file `.html`/`.htm` → **Apri con… → Slide Studio**
  (oppure comando *Slide Studio: apri il file HTML nell'editor visuale*).
- L'editor di testo resta il default sugli `.html`: Slide Studio è **opt-in**.

## Sviluppo

La webview è il bundle prodotto dal repo principale:

```bash
# dalla root del repo (slide-studio)
npm run build:vscode      # → extension/media/
cd extension
npx @vscode/vsce package  # → slidewright-<versione>.vsix
code --install-extension slidewright-<versione>.vsix
```

## Stato

In costruzione, a step. Vedi `docs/agentic-chat-e-vscode.md` nel repo per
l'architettura (host adapter) e il percorso.

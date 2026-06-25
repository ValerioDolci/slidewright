# PR per le "awesome list" — pronte da inviare

Visibilità long-tail (lenta ma a basso sforzo). Formati verificati sui repo reali.
Entry già pronte: **copia-incolla** nella sezione indicata, poi PR.

> ⚠️ Le PR sulle awesome list **NON richiedono il Marketplace VS Code**. Le liste
> `awesome-vscode` sì → rimandate a dopo la pubblicazione sul Marketplace.

---

## 1) aspose-slides/Awesome-Presentations
- Repo: https://github.com/aspose-slides/Awesome-Presentations
- File da editare: `README.md`
- Sezione: **Editors** (dove c'è già reveal.js)
- Ordine: NON alfabetico → aggiungi in coda alla sezione
- CONTRIBUTING: nessun file, nessun criterio minimo di star → barriera bassa
- Formato verificato: `*   [Nome](URL) descrizione in prosa.`

**Entry da incollare:**
```
*   [Slidewright](https://github.com/ValerioDolci/slidewright) is a local, open-source visual editor for HTML slide decks — reorder slides, edit text and graphics (a mini-PowerPoint) and export a clean HTML deck or a 16:9 PDF. 100% local: no cloud, no sign-up. MIT.
```

---

## 2) runablehq/Awesome-presentation-tools
- Repo: https://github.com/runablehq/Awesome-presentation-tools
- File da editare: `README.md`
- Sezione: **Developer & Markdown-Based** (dove ci sono Slidev, reveal.js, Marp)
- Ordine: grouped, curato (non A-Z) → aggiungi in coda alla sezione
- CONTRIBUTING: c'è `contributing.md` → leggilo prima (regola generica "contributions welcome")
- Formato verificato: `*   [Nome](URL) - descrizione breve con feature chiave.`

**Entry da incollare:**
```
*   [Slidewright](https://github.com/ValerioDolci/slidewright) - Local visual editor for HTML slide decks. Reorder, edit text/graphics (mini-PowerPoint), export clean HTML + true-16:9 PDF. 100% local, no cloud, no sign-up. Also a VS Code extension. MIT.
```

---

## Come aprire la PR (due modi)

### A) Da web (più semplice)
1. Apri il `README.md` del repo target su GitHub → matita "Edit".
2. GitHub forka in automatico; incolla l'entry nella sezione giusta.
3. "Commit changes" → "Propose changes" → "Create pull request".
4. Titolo PR: `Add Slidewright (local visual editor for HTML slide decks)`.
5. Corpo: 1-2 righe — cosa fa + che è MIT/local + link demo `https://valeriodolci.github.io/slidewright/`.

### B) Da CLI (gh) — se preferisci automatico
```bash
# esempio per la lista 1; ripeti per la 2 cambiando OWNER/REPO
gh repo fork aspose-slides/Awesome-Presentations --clone --remote
# ...edita README.md aggiungendo l'entry nella sezione Editors...
git add README.md && git commit -m "Add Slidewright (local visual editor for HTML slide decks)"
git push -u origin HEAD
gh pr create --repo aspose-slides/Awesome-Presentations \
  --title "Add Slidewright (local visual editor for HTML slide decks)" \
  --body "Adds Slidewright — a local, open-source (MIT) visual editor for HTML slide decks. Live demo: https://valeriodolci.github.io/slidewright/"
```

---

## Altre liste candidate (verifica criteri prima)
- **github topics**: già messi (`presentation`, `slides`, `slideshow`, `wysiwyg`, `powerpoint-alternative`…) — passivo, già fatto.
- **awesome-selfhosted / local-first**: angolo "100% local". Da valutare (criteri più severi).
- **awesome-vscode / awesome VS Code extensions**: SOLO dopo pubblicazione su VS Code Marketplace.

## Nota maturità
Slidewright ha poche star ora → qualche lista potrebbe rimandare. Bassa fatica comunque.
Riprovare dopo lo Show HN (se porta star, le PR passano più facili).

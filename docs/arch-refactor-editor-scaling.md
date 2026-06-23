# Refactor [ARCH] — modello di scala unico (tela fissa 1280×720)

> Design doc per il refactor del sistema di rendering/scala dell'editor. Obiettivo:
> editor, presentazione e PDF condividono **un solo modello**: la slide è una **tela
> fissa 1280×720**, scalata **solo** in modo uniforme ed **esterno** al contenuto.
> Niente adattamento del contenuto. Stato: **PIANO — da rivedere (Opus) e approvare
> (Valerio) PRIMA di implementare.**

---

## 1. Principio

Una slide è un riquadro **1280×720 immutabile**. L'unica trasformazione ammessa è una
**scala uniforme di visualizzazione**, applicata *attorno* al contenuto (non dentro):
- **Editor**: il canvas 1280×720 è scalato per stare nel pannello (`stage.scale`).
- **Presentazione/standalone**: l'iframe-stage 1280×720 è scalato per riempire lo schermo.
- **PDF**: pagina fissa 1280×720.

Il contenuto **non** viene mai ridisposto, rimpicciolito o adattato. Una slide non
conforme (più alta di 720, misura propria, vh/vw, responsive) **non** viene "aggiustata"
a runtime: o è corretta, o si **converte** una volta sola nel formato canonico (lavoro
separato #3 — "carica la qualunque", da fare dopo).

Questo è esattamente il comportamento PPTX richiesto da Valerio: "le slide restano
visivamente uguali indipendentemente dallo schermo; tutto scala insieme, proporzioni
bloccate".

---

## 2. Stato attuale (cosa c'è da togliere)

Oggi convivono **due** scale nell'editor:

| Scala | Dove | Cosa scala | Giudizio |
|---|---|---|---|
| `stage.scale` | `transform: scale()` su `.stage__canvas` (contiene iframe **e** overlay) | tutto, uniforme, esterno | ✅ **corretta, si tiene** (= scala di visualizzazione) |
| `stage.contentScale` | `transform: scale()` su `.ss-root` **dentro** l'iframe | solo il contenuto, NON l'overlay | ❌ **da rimuovere** (è l'adattamento + il bug cluster) |

`contentScale` nasce da due feature, entrambe da rimuovere (= il punto #2 di Valerio):
- **"Adatta" manuale** (`slide.fitScale`): l'utente rimpicciolisce una slide che sfora.
- **Auto-adatta** (v0.6.4): un deck con slide di misura propria (es. 960×540) viene
  scalato per riempire il canvas.

Poiché l'overlay (box di selezione) vive nello spazio logico 1280×720 **non** scalato da
`contentScale`, ma il contenuto sì, tutto il codice di selezione compensa con
`×contentScale` / `effScale`. Rimuovendo `contentScale` la compensazione **sparisce**
(si semplifica, non si aggiunge nulla).

### Punti di compensazione oggi presenti (tutti da semplificare)
- `stage.contentScale`, `stage.effScale` (= `scale × contentScale`)
- `stage._applyContentFit()` (manuale + auto-adatta)
- `stage.measureFitScale()`
- `stage.rectOf()` → `w/h = offsetW/H × contentScale`, centro da gBCR
- `selection.js`: `init.s = effScale`, `s = effScale` (move/resize/resizeRotated),
  guardie `snapOk = contentScale >= 1`
- `app.js`: `_toggleFit`, `_updateFitButton`, bottone `#stage-fit`, hint relativi
- `sidebar._thumbDoc`: ramo `fitScale` nella miniatura
- `export-html`: `fitSlide` in INNER_JS (auto-fit) + transform per-sezione da `fitScale`
- `export-pdf`: transform per-pagina da `fitScale`
- `model`: campo `slide.fitScale`
- `layout.js` / `editor.css` / `i18n.js`: bottone "⤢ Adatta" + stringhe

---

## 3. Architettura target

- `stage.scale` resta l'**unica** scala (canvas→pannello). `fitScale()` invariato.
- `contentScale ≡ 1` per costruzione → si elimina del tutto la proprietà e `effScale`.
- La radice della slide nell'iframe resta `position:absolute; inset:0` (già forzato da
  `IFRAME_CSS`): **box fisso 1280×720**, contenuto che sfora viene **clippato**
  (`body{overflow:hidden}`), con il **badge ⚠ overflow** a segnalarlo (si tiene: ora è
  più utile che mai, indica che la slide va corretta/convertita).
- `rectOf(eid)`: `w = offsetWidth`, `h = offsetHeight`, centro da `getBoundingClientRect`
  (che, senza transform di contenuto, è già nello spazio logico non scalato). Per gli
  elementi ruotati: w/h restano `offset*` (geometria non ruotata), centro = centro AABB.
- `selection.js`: tutti i delta puntatore `/ stage.scale` (niente `effScale`). Snap
  sempre attivo (salvo Alt / elemento ruotato). La matematica di resize ruotato resta
  identica nella forma, cambia solo `s = effScale → s = scale`.
- **Presentazione/PDF**: si rimuove l'auto-fit (`fitSlide`) e i transform `fitScale`. La
  slide è 1280×720 piena, scalata uniformemente dalla shell (presentazione) o pagina
  fissa (PDF). Coerente con l'editor per costruzione.

### Coerenza editor ↔ presentazione
Dopo il refactor i due rendering sono lo **stesso modello**: tela 1280×720 + una scala
esterna. Niente più divergenze come quella inseguita sulla slide 7 (che nasceva proprio
dal fatto che presentazione e editor trattavano la scala in modi diversi).

---

## 4. Modifiche file-per-file (riscrittura pulita, non patch)

**`src/ui/stage.js`**
- Rimuovere: proprietà `contentScale`, getter `effScale`, metodi `_applyContentFit`,
  `measureFitScale`.
- `render()`: togliere la chiamata `_applyContentFit(slide)`. `onOverflow(this._checkOverflow())`
  sempre (in `deck`), senza la condizione `contentScale >= 1`.
- `rectOf()`: riscrivere senza `contentScale` (w/h = `offset*`, centro da gBCR).
- Lasciare invariati: `scale`, `fitScale()`, `clientToLogical()` (usa `scale`),
  `_checkOverflow`, `makeFree`, hit-testing, editing.

**`src/ui/selection.js`**
- `effScale` → `scale` ovunque (3 punti: `begin()`, `_startResize`, `_startResizeRotated`).
- Togliere `snapOk = (contentScale||1) >= 1` e le guardie collegate (snap sempre attivo
  salvo Alt/rotazione).

**`src/ui/app.js`**
- Rimuovere `_toggleFit`, `_updateFitButton`, l'azione `fit-slide`, gli hint relativi e
  ogni chiamata a `measureFitScale`. `onOverflow` (badge) resta.

**`src/ui/sidebar.js`**
- `_thumbDoc`: rimuovere il ramo `fitScale` → sempre `.ss-root{...transform:none}`.

**`src/core/export-html.js`**
- INNER_JS: rimuovere `fitSlide` e il suo loop. `buildInnerDeckDoc`: rimuovere il
  transform per-sezione da `fitScale`.

**`src/core/export-pdf.js`**
- Rimuovere il transform per-pagina da `fitScale` (la pagina è già 1280×720 fissa).

**`src/core/model.js`**
- Rimuovere il campo `fitScale` dal modello slide (non più letto/scritto).

**`src/ui/layout.js`**, **`src/styles/editor.css`**, **`src/core/i18n.js`**
- Rimuovere il bottone `#stage-fit` ("⤢ Adatta"), gli stili `.stage__fit`, le chiavi
  i18n "⤢ Adatta/Adattata" e gli hint relativi.

**`tests/selftest.html`**
- Rimuovere/sostituire i test `fitScale` ("adatta: export HTML applica scale", "adatta:
  PDF applica scale", auto-adatta). Aggiungere regressioni: `rectOf` usa `offsetWidth`
  (no contentScale); delta selezione usa `stage.scale`; export non contiene più transform
  da fit; overflow badge ancora segnalato su slide che sfora.

---

## 5. Conseguenze (interim, da accettare consapevolmente)

Togliendo l'adattamento, **finché non esiste la conversione (#3)**:
- Una slide con contenuto più alto di 720px **viene tagliata in basso** (prima veniva
  rimpicciolita). Il badge ⚠ lo segnala. *Nota: la slide 7 del deck reale NON è in questo
  caso — in editor misura 720 con `contentScale=1`, quindi non cambia.*
- Un deck con slide di misura propria (es. 960×540) **non riempie** più il canvas: resta
  960×540 in alto a sinistra con bordo vuoto (prima veniva scalato per riempire).

Entrambe sono slide "fatte male" rispetto allo standard 1280×720 → le risolve la
**conversione (#3)**. È il trade-off esplicito che Valerio ha accettato ("punto 4 alla
fine"). **Va confermato che l'interim è ok**, oppure si valuta la decisione D1 qui sotto.

---

## 6. Decisioni aperte (per Valerio / revisione Opus)

- **D1 — Normalizzazione "misura propria" (960×540 → riempi 1280×720).** È una scala
  *uniforme* che preserva le proporzioni: è *compatibile* con la visione di Valerio (non
  è adattamento del contenuto, è solo portare una tela di misura diversa alla tela
  standard). Tre opzioni:
  - (a) **Rimuovere tutto** e affidarsi alla conversione (#3). Più pulito, ma i deck
    own-size restano "piccoli" finché non li converti.
  - (b) **Tenere solo** la normalizzazione uniforme own-size (NON l'auto-fit da overflow),
    come scala **esterna** (non più `contentScale` interno): la slide own-size è 960×540 e
    la shell/editor la scalano a riempire, senza compensazione interna. Evita la
    regressione, resta coerente col modello.
  - Raccomandazione mia: **(a)** per il refactor (massima pulizia), e gestire own-size
    nella conversione. Ma se vuoi zero regressioni interim, (b) è difendibile.
- **D2 — Timing.** Faccio il refactor **ora** (con l'interim del §5) e la conversione
  dopo, oppure li **accoppio** (niente interim visibile)? La conversione è grossa; il
  refactor è fondante e indipendente. Raccomando: refactor ora, conversione dopo.
- **D3 — Niente release finché non c'è la conversione?** Il refactor introduce
  regressioni interim sui deck non conformi: forse meglio **non rilasciare** v0.9.1+arch
  finché la conversione non chiude il cerchio (o rilasciare solo i 3 fix già fatti come
  v0.9.1, e tenere l'arch su un branch fino a conversione pronta).

---

## 7. Strategia di test

Suite versionata (`bash tests/run.sh`, `run-webview.sh`) + E2E reali headless (Chrome
`--dump-dom`/`--screenshot`, harness con `Stage` **reale** — non approssimazioni CSS).

Matrice:
1. **Selezione/geometria**: `rectOf` su elemento in flusso e libero, a vari `stage.scale`
   (pannello piccolo/grande) → box allineato all'elemento (pixel).
2. **Move**: trascinamento con pannello scalato 0.5× e 1.5× → spostamento = delta/scala
   corretto; snap attivo; guide.
3. **Resize** 8 maniglie, con e senza Shift (lock ratio), a scale diverse.
4. **Resize ruotato** (angolo ≠ 0): nessun salto, punto fisso opposto stabile.
5. **Rotazione**: invariata.
6. **Editor ↔ presentazione**: stessa slide, geometria **identica** elemento-per-elemento
   (come la verifica fatta sulla slide 7) — ora deve valere per costruzione.
7. **Overflow**: slide che sfora → badge ⚠ acceso, contenuto clippato (non più scalato).
8. **Round-trip**: export → import → export stabile; niente `fitScale`/transform residui.
9. **Regressione non-fit**: tutte le slide conformi del deck reale invariate vs prima.
10. **Doc mode**: invariato (non usa contentScale).

Gate: core + webview verdi, E2E reali verdi, screenshot di confronto editor/presentazione
su 2-3 slide del deck reale a 1280×720 e 1920×1080.

---

## 8. Rollout

- Branch dedicato `feat/arch-scale-unico` (NON main: il refactor tocca la matematica di
  selezione, serve isolamento + test prima del merge).
- Commit atomici per file/area (stage → selection → app/ui → export → test → docs).
- Merge su main **solo** dopo gate verde + ok Valerio. Release decisa con D3.

## 9. Rischi & mitigazioni
- **R1 — un punto di compensazione dimenticato** → grep esaustivo di
  `contentScale|effScale|fitScale` a fine lavoro = 0 occorrenze (salvo la scala esterna).
- **R2 — regressione selezione a scale estreme** → test 2/3/4 a 0.5× e 1.5×.
- **R3 — deck non conformi peggiorano (interim)** → D1/D2/D3 sopra; comunicato a Valerio.
- **R4 — perdita feature "Adatta" sgradita all'utente** → è una scelta di prodotto
  (allineata alla visione); se serve un'uscita di emergenza si rivaluta in conversione.

---

## 10. Revisione Opus — esiti e modifiche al piano (2026-06-23)

Opus ha confermato che **il cuore è corretto**: la compensazione (`effScale`, `×cs`,
`snapOk`, `_applyContentFit`) esiste *solo* per contrastare il transform interno; tolto
quello, la compensazione **si cancella, non si riscrive**. I path su `offset*` (makeFree,
base resize) erano già transform-immuni → diventano più robusti. Q1/Q2 ok: nessun uso
necessario di `contentScale` va perso (grep finale = 0 è la rete). Caveat minore e
**pre-esistente** (non introdotto qui): box di selezione di un inline/SVG **ruotato** resta
un'approssimazione AABB.

Quattro punti dove ero ottimista o sotto-specificato — **da chiudere PRIMA di scrivere la
matematica nuova**:

- **[Q3 — interim più grave del previsto] Slide oversize = NON editabili, non solo
  "tagliate".** Con `body{overflow:hidden}` gli elementi sotto i 720px sono irraggiungibili;
  ma `editableList`/Tab ci cicla sopra e `rectOf` ritorna `y>720` → il box di selezione
  viene disegnato **fuori dal canvas**. "Adatta", per quanto hacky, era *funzionale* (vedevi
  ed editavi tutto). → Definire il comportamento per gli elementi clippati (sopprimere la
  selezione fuori-canvas? scroll?) e **non far mai arrivare questo interim in release**.

- **[D4 — NUOVA: forzare 1280×720 sulla root?] Il box fisso NON è garantito dal CSS.**
  `IFRAME_CSS` forza `position:absolute !important` ma `inset:0` è a priorità normale → un
  deck con `.slide{width:960px !important}` **vince**, la root non è 1280 di larghezza, e
  `_checkOverflow` confronta gBCR con le costanti `CANVAS` → badge errato + offset relativi a
  una root non-1280. **Decisione da prendere:** forzare `width:1280px;height:720px` (con
  `!important`) su `.ss-root` — accettando crop/letterbox consistente per gli own-size — sì o
  no. Oggi è un angolo sotto-specificato.

- **[D5 — NUOVA: unificare lo spazio di coordinate] Lo snap confonde offset-space e
  viewport-space.** `_snapTargets` legge `getBoundingClientRect` (viewport iframe), ma
  l'elemento mosso scrive `style.left` (spazio dell'**offsetParent**) e confronta linee
  offset-space coi target viewport. Coincidono **solo se offsetParent ≡ .ss-root all'origine**.
  Per un elemento dentro una `.card{position:relative}` (comune nei deck) offsetParent = la
  card → snap sballato. È **pre-esistente**, ma rimuovere `snapOk` **accende lo snap in più
  casi** → lo espone di più. È l'assunzione su cui poggia tutto il modello di coordinate e
  **non è enforced**. **Occasione:** mentre tocco la matematica, unificare tutto in **un solo
  spazio** (left/top derivati da gBCR-relativo-a-.ss-root) → chiude un'intera classe di bug.

- **[Q8.3 — split della conversione: chiude il buco interim] Spezzare la conversione in due.**
  "Own-size 960×540 → riempi" è una **rescale-on-import** uniforme e banale → si chiude
  **insieme al refactor**, gestita come **dimensione-canvas del deck** (NON come transform:
  rilevo la misura authored all'import e la salvo come canvas del deck; lo scaling-a-riempire
  resta scala esterna). "Contenuto più alto di 720 → reflow" è la conversione **vera**
  (difficile) → si rimanda. Così l'interim "non editabile" si **restringe alle sole slide
  genuinamente troppo alte** (contenuto legittimamente rotto), non tocca i deck own-size. Questo
  de-rischia D3 e mitiga il rischio "la conversione non atterra mai".

### Conclusioni sulle decisioni
- **D1 → (a)** confermata da Opus. **NON** fare (b) come transform per-slide (= ricreare
  `effScale` con altro nome, vanifica il refactor). La normalizzazione own-size va gestita come
  **dimensione-canvas**, non come scala interna (vedi Q8.3).
- **D2 → refactor ora, su branch**, indipendente. La conversione non lo tocca (produce slide
  conformi che girano a `cs≡1`).
- **D3 → SÌ**: v0.9.1 subito coi 3 fix già su `main`; arch su `feat/arch-scale-unico`; release
  dell'arch **solo** quando la fetta tall-overflow della conversione chiude la regressione.
  Nota: il fix #2 ha aggiunto `fitSlide` nell'export → il refactor lo rimuove; **non è
  conflitto** (dopo, editor e presentazione clippano entrambi → la parità di #2 si conserva e
  semplifica). Verificare solo che la shell di presentazione mantenga lo scaling letterbox
  uniforme del 1280×720 (la "scala esterna" che deve sopravvivere).

### Aggiunte alla matrice di test (§7)
9. **Nudge frecce a livello App**: verificare che muova in px logici scale-indipendenti (non
   passi da `effScale`).
10. **Inline/SVG offsetWidth=0**: box di selezione su `<span>` inline e `<svg>` senza dimensioni
    (+ documentare inline+rotazione come known-approx).
11. **Rotazione × scala** (prodotto incrociato): resize ruotato a pannello 0.5× e 1.5×.
12. **Snap con offsetParent ≠ .ss-root** (es. elemento dentro `.card{position:relative}`) — ora
    che lo snap è sempre attivo, test esplicito (collegato a D5).
13. **Grep anti-residui come test versionato**: export HTML/PDF senza transform da fit né
    `fitSlide`.
14. **Backward-compat import**: deck esportato da v0.6.x con `transform:scale` baked nella
    section → render sano (l'`IFRAME_CSS .ss-root{transform:none !important}` lo neutralizza —
    verificarlo; e cosa succede se il fit era su un figlio).
15. **Raggiungibilità elementi clippati** (Q3): Tab su elemento sotto i 720 → comportamento
    definito e testato (non lasciato emergere).

### Piano pratico raccomandato (Opus + mio)
1. **v0.9.1 ora** coi 3 fix.
2. Branch `feat/arch-scale-unico`: rimuovo `contentScale`/`effScale`/fit (opzione **a**).
3. **Stesso branch**: chiudo la fetta banale della conversione (rescale-on-import own-size come
   dimensione-canvas) → l'interim si riduce alle sole slide troppo-alte.
4. **Prima della matematica nuova, decidere D4 (forzo 1280×720?) e D5 (unifico lo spazio di
   coordinate?).**
5. Test: aggiungo i buchi §7 (specie 12, 15, e D5).
6. Release dell'arch **solo** quando la conversione tall-overflow chiude la regressione.

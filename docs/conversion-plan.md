# Conversione "carica la qualunque → formato canonico" — piano (#3)

> **Status: PIANO — da rivedere (Opus) e approvare (Valerio) prima di implementare.**
> Vincolo guida di Valerio: *dopo la conversione le slide devono rimanere **identiche** e
> **ben fatte***. Questo documento mette la **fedeltà** al centro: cosa è conservabile
> identico, cosa no (e perché), e **come lo si dimostra** (non a parole).
> Bersaglio della conversione = `slide-format-spec.md`.

---

## 0. La garanzia di fedeltà è il cuore (non un test a posteriori)

"Identiche" ha un significato preciso solo se misurato. Meccanismo:

- **Harness di fedeltà**: per ogni slide, render dell'**originale** (alla sua misura/layout
  nativi) e del **convertito** (formato canonico) → screenshot → **pixel-diff**. Una
  conversione è ammessa solo se il diff è sotto soglia (rumore di anti-aliasing), slide per
  slide. Il riferimento di rendering è lo stesso usato per l'arch (Stage reale + iframe), già
  collaudato.
- La conversione **non si rilascia** finché l'harness non è verde sui deck di prova (incluso
  il Risk_Culture reale) **e** Valerio non ha visto i confronti.

Questo è il "accertati che rimangano identiche": è cablato nel processo, non opzionale.

## 1. Tassonomia onesta: cosa è identico, cosa no

| Caso di input | Fedeltà ottenibile | Come |
|---|---|---|
| **A. 16:9 a misura propria** (es. 1920×1080, 960×540) | **IDENTICA (lossless)** | Si **adotta la misura come canvas del deck** (canvas per-deck, 16:9-agnostico). Zero riscrittura di px → matematicamente identico, scala esterna uniforme come sempre. |
| **B. Già 1280×720 16:9** (es. Risk_Culture) | **IDENTICA (nessuna conversione)** | Conforme di fatto. |
| **C. Non-16:9** (4:3, A4…) | **IDENTICA + bande** | Canvas = il 16:9 che contiene il contenuto; contenuto centrato, **letterbox** (bande nere). Nessuna deformazione. |
| **D. Responsive** (vh/vw, %, reflow) | **identica a UN rendering scelto** | Non esiste un "aspetto canonico": si **congela** a una misura target (la sua misura nativa se deducibile, altrimenti 1280×720), si risolvono vh/vw→px contro quel canvas, si fissa il layout. Identica *a quella resa*. |
| **E. Contenuto più alto del canvas** (overflow) | **NON identica (per definizione)** | Farlo stare implica reflow/scala → cambia. Best-effort + **segnalato**. Fase difficile, ultima. |
| **F. Font esterni** (Google Fonts…) | **NON identica (sostituzione font)** | Rimossi per privacy/portabilità → fallback system. Il testo rende diverso. **Inevitabile e segnalato.** |
| **G. Script / handler inline** | identica (se layout statico) | Strip. Se il deck usava JS per il layout (raro, "fatto male") l'aspetto può cambiare → segnalato. |
| **H. Sfondo su body/html** | identica | Spostato su `.slide` (già fatto nel runtime). |

**Conclusione onesta da dire a Valerio:** la conversione conserva l'identità **dove è
matematicamente possibile** (A, B, C, gran parte di D, G, H). Dove **non** può (E overflow,
F font esterni) fa la miglior resa fedele e lo **segnala** — non finge.

## 2. Decisione architetturale abilitante: canvas per-deck (16:9-agnostico)

Oggi `CANVAS = {1280,720}` è una costante usata in stage/selection/export/pdf/sidebar/import.
Per rendere A/C/D **lossless** la cosa giusta NON è riscrivere i px del deck (fragile), ma
**rendere la misura del canvas una proprietà del deck** (`deck.canvas = {w,h}`, già presente
nel modello!) e usarla ovunque al posto della costante. Effetti:

- Un deck 1920×1080 → `deck.canvas={1920,1080}`, reso a quella misura, scalato esternamente →
  **identico**, zero riscrittura.
- La tela **canonica per i deck NUOVI** resta **1280×720** (lo dice la spec); il motore però
  è **size-agnostico in 16:9**. Nessun conflitto: 1280×720 è il default di authoring, non un
  vincolo del rendering.
- È esattamente la "fetta facile" indicata da Opus ("handled as canvas dimension, not
  transform"), e si innesta sul branch `feat/arch-scale-unico` (stessa area di codice).

⚠️ **Tocca la costante `CANVAS` in più file** → va fatto con attenzione e con la stessa
matrice di test dell'arch (selezione/move/resize a canvas ≠ 1280). Da valutare se estende la
spec: la tela canonica resta 1280×720, ma il formato **ammette altri 16:9** come risultato di
conversione (nota da aggiungere alla spec §1/§15 se approvato).

## 3. Rilevare la misura/aspetto authored

- Render del deck originale in un iframe alla sua larghezza naturale; misura del bounding box
  del contenuto della slide (o lettura di `.slide`/`body` width/height espliciti).
- Se le slide hanno **dimensione fissa** dichiarata (px) → quella è la misura (caso A/C).
- Se **responsive** (nessuna misura fissa, usa vh/vw/%) → caso D: si sceglie un target
  (default 1280×720) e si **congela**.
- Aspetto ≈16:9 (entro tolleranza) → canvas = quella misura; altrimenti → letterbox (C).

## 4. Pipeline di conversione (per deck, all'import o on-demand)

1. Parse (già esiste) + sanitize (strip script — già) + strip font esterni (già).
2. Rileva misura/aspetto → imposta `deck.canvas` (A/B/C/D).
3. Risolvi unità viewport: vh/vw/vmin/vmax → px contro `deck.canvas` (riscrittura mirata nel
   CSS/inline; **da fare con cura**, è la parte tecnica delicata — vedi rischi).
4. Sposta bg body/html → `.slide` (già nel runtime; renderlo persistente nel modello).
5. (Fase 2, difficile) Overflow > canvas.h → reflow/scala best-effort + flag.
6. **Harness di fedeltà**: per ogni slide, diff originale↔convertito → gate.
7. Report all'utente: lista delle slide convertite identiche ✅ vs con scostamento ⚠ (font,
   overflow) con il perché.

## 5. Fasi (in ordine, ognuna validata dall'harness prima della successiva)

- **F0 — Harness di fedeltà** (render orig↔conv + pixel-diff per-slide). Si costruisce per
  primo: è il metro.
- **F1 — Canvas per-deck (A/B/C)** + letterbox. Lossless. È il grosso del valore con la
  massima fedeltà. (Innesto sul branch arch.)
- **F2 — vh/vw → px** (D). Delicata; gate harness severo.
- **F3 — Strip font esterni / script** resi persistenti nel modello + report (F/G).
- **F4 — Overflow reflow** (E). Difficile, dichiaratamente non-identica → best-effort + UX
  per intervenire. Ultima.

## 6. Decisioni aperte (per Valerio / Opus)

- **K1** — Canvas per-deck (16:9-agnostico) sì? (Raccomando sì: è ciò che rende A/C/D
  lossless senza riscrivere i px. Estende la spec: "tela canonica 1280×720, motore ammette
  altri 16:9".)
- **K2** — Quando convertire: **all'import** (trasparente, il deck entra già conforme) o
  **on-demand** (bottone "Converti", l'utente vede prima/dopo)? Raccomando: all'import con
  **report non bloccante** (mostra cosa è cambiato), + possibilità di annullare.
- **K3** — Soglia di fedeltà dell'harness (pixel-diff %) e tolleranza AA. Da tarare
  empiricamente.
- **K4** — Caso D (responsive senza misura fissa): target di congelamento default 1280×720, ok?

## 7. Rischi
- **R1 — canvas per-deck rompe export/miniature/selezione**: il 16:9 hardcoded a valle
  (vedi §8) è il lavoro vero.
- **R2 — "identica" sovra-promessa**: comunicare la tassonomia §1 (E/F non identiche).
- **R3 — harness pixel-diff fragile** (font/AA/subpixel/GPU): vedi §8.
- **R4 — overflow (E)**: nessuna soluzione identica; best-effort esplicito.

---

## 8. Revisione Opus — correzioni al piano (importante: SEMPLIFICA il lavoro)

Opus ha colto un errore di fondo: il principio vincente è **"cambiare il sistema di
riferimento, NON mutare il contenuto"** (= canvas per-deck). Ma F2 (riscrivere vh/vw→px) e il
"congelare il responsive" lo **tradivano** (operazioni *lossy*). Applicato in modo uniforme,
**metà del piano sparisce**.

**Correzioni adottate:**
- **[F2 ELIMINATA] NON riscrivere vh/vw.** L'iframe-stage ha viewport = `deck.canvas`, quindi
  `1vh = canvas.h/100` si risolve **senza toccare il CSS** (stesso meccanismo della
  presentazione WYSIWYG). Bonus: con viewport fisso le **media query collassano da sole** (un
  solo branch attivo) — non vanno appiattite. Conversione px **solo** per export-senza-iframe,
  e lì leggendo `getComputedStyle()` (px risolti, affidabili) — MAI parsando il CSS sorgente,
  e confinata all'export, non al modello.
- **[D — responsive] NON congelare/bake.** Con viewport = canvas il responsive si risolve
  **deterministicamente a ogni render** alla larghezza canvas. CSS lasciato vivo (editabile).
- **[Rilevazione misura — §3 riscritta] Non inferire dalla bbox del contenuto fluido**
  (inaffidabile: il fluido riempie ciò che gli dai). Gerarchia: **px espliciti sulla root
  slide > `@page`/viewport meta > config deck-level**; se **nessuna misura dichiarata →
  è responsive per definizione → canvas canonico 1280×720** (identico, il responsive si adatta
  a qualunque frame). Incoerenza fra slide → flag + dominante. Il "caso duro inferenza" non
  esiste se inquadrato così.
- **[E — overflow] scale-to-fit, NON reflow, e disaccoppiato.** Scala uniforme per far stare
  (proporzionale, più piccola) = la più fedele (stessa logica del letterbox 4:3: lì scali in
  larghezza, qui in altezza) → **per-slide**, flaggata. Il **reflow** ("rendi editabile questa
  slide") è una **feature separata e opt-in post-conversione**, NON automatica. Non legare la
  fedeltà della conversione al "rendi modificabile".

**Controindicazioni vere (a valle, non nel motore) — da sistemare con il canvas per-deck:**
- **Export PDF/print**: `@page` è 16:9 fisso → derivare la page-size da `deck.canvas` (aspect).
- **Miniature**: il box thumbnail dev'essere **aspect-aware** (un 4:3 non va schiacciato).
- **[K5 — NUOVA, decidere PRIMA di codare] Slide di dimensione ETEROGENEA nello stesso file**:
  `deck.canvas` è per-deck ma un file può avere slide di misure diverse → un solo canvas non è
  identico per tutte. Scelta: **canvas per-slide** vs **dominante + letterbox del resto**.
- **Slide nuova in deck non-1280**: eredita `deck.canvas` (non la canonica).

**Onestà sulla fedeltà (blast radius più ampio del previsto):**
- **Strip font esterni NON è cosmetico**: metriche diverse → il testo **va a capo diverso** →
  la non-identità si propaga al **layout**, non solo al glifo. Strippato un font, niente di
  text-related è garantito identico.
- **Strip script può rimuovere CONTENUTO** (contenuto iniettato/posizionato da JS) → slide
  vuota/sbagliata. Rilevare contenuto script-dipendente e **flaggare forte**.
- **Risorse esterne** (img via URL, `@import`): l'identità dipende dalla rete → **inline
  base64 al momento della conversione** (riuso del pool asset), altrimenti si rompe dopo.
- **Stati animati/`:hover`/transition**: lo snapshot statico non li cattura.

**Harness di fedeltà — requisiti (altrimenti il gate è rumore):**
- Metrica = **SSIM o %-pixel-cambiati con soglia**, NON per-pixel esatto.
- Render di originale e convertito nello **STESSO motore/viewport** (originale alla sua misura
  dichiarata, convertito a `deck.canvas` — coincidono per costruzione) → si diffa la
  conversione, non differenze di engine.
- **Normalizzare la disponibilità font**.

**Gating del rilascio (Opus, netto): il canvas per-deck SBLOCCA il rilascio dell'arch.**
Spedire: **(a)** fixed→canvas per-deck, **(b)** responsive→canonico, **(c)** overflow→scale+flag
(già *meglio* dell'attuale "oversize non editabili"). **Rimandare SOLO il reflow** (feature
follow-up "overflow-editabile", disaccoppiata). NON aspettare il reflow.

**Metodo (Regola 3/4): prima dell'harness, smoke-test su 3 deck reali** (un 1920×1080 fixed,
un responsive %, uno con slide eterogenee) per validare empiricamente (i) la soglia del
pixel-diff e (ii) l'ipotesi "responsive→canonico è identico". 30 min, dice se il gate è
tarabile o è rumore.

### F0 smoke-test — esiti (validazione empirica, fatta)
Su deck sintetici (iframe + srcdoc, misure reali):
- `50vw×50vh` in canvas 1280×720 = **640×360**; a 1920×1080 = **960×540** (rapporto su canvas
  **0.500 identico**) → `vh/vw` si risolvono contro il viewport dell'iframe **senza riscrivere
  nulla**, e un responsive è **proporzionalmente identico a qualsiasi canvas**. Conferma: F2
  (rewrite vh/vw) NON serve; "responsive→canonico = identico" è vero.
- Un fixed da 1900px viene **clippato** a canvas 1280 ma **ci sta** a 1920 → confermato che i
  deck fixed richiedono l'adozione del **canvas nativo** (canvas per-deck).
- Eterogeneità confermata come problema reale → **K5 da decidere**.
- Rumore harness: render identico-vs-identico nello stesso engine ≈ **0%** (già misurato
  nell'arch: present-vs-present 0.00%) → la metrica è affidabile se si rende nello stesso
  motore/viewport (come prescritto).

### Piano rivisto (post-Opus), in ordine
- **F0 — smoke-test 3 deck** (validare soglia + ipotesi responsive→canonico).
- **F1 — canvas per-deck 16:9-agnostico** (motore + export PDF/HTML aspect-aware + miniature
  aspect-aware + D4 parametrizzato a `deck.canvas`) + **decisione K5** (eterogenee). Sblocca
  l'arch. Lossless per fixed/responsive.
- **F2 — rilevazione misura** (gerarchia dichiarata; else canonico) + **letterbox** non-16:9.
- **F3 — inline risorse esterne** (img/@import) + strip font/script **con report/flag** forte
  (testo non garantito identico; contenuto script-dipendente segnalato).
- **F4 — overflow → scale-to-fit per-slide + flag** (fedele, non reflow).
- **F5 (follow-up, opt-in, separato) — reflow "rendi editabile"** una slide overflow.
- **Harness di fedeltà**: trasversale, gate prima di ogni rilascio.

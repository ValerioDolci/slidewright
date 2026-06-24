# GIF demo — storyboard (README hero)

Obiettivo: in **10–15 secondi** un estraneo capisce "è un PowerPoint per i deck
HTML, gira in locale". La GIF va in cima al README (sostituisce/affianca il banner).

## Setup registrazione
- **Schermo**: finestra browser ~1280×800, zoom pagina 100%, tema **scuro** dell'editor
  (più "premium" e nasconde la chrome del browser). Nascondi bookmark bar.
- **Deck di partenza**: usane uno bello e denso (es. un deck reale tuo, NON il benvenuto).
  Apparire subito con contenuto vero vende più di una slide vuota.
- **Tool**: macOS → [Kap](https://getkap.co) o QuickTime. Esporta a ~12–15 fps, larghezza 760–960px.
- **Durata target**: ≤ 15 s. Niente audio. Loop infinito.

## Sequenza (ogni step ~2 s, movimenti lenti e leggibili)
1. **Apri** — trascina un `deck.html` sulla finestra → compare il deck renderizzato. (mostra che "mangia" un file HTML)
2. **Riordina** — nella sidebar, drag&drop di una miniatura in un'altra posizione.
3. **Testo** — doppio click su un titolo, riscrivilo (es. cambia una parola visibile).
4. **Grafica** — clicca un box/forma, trascinalo, ridimensionalo con una maniglia. Cambia il colore di riempimento dall'inspector (colore vivace, ben visibile).
5. **Export PDF** — clicca Export → PDF; mostra al volo l'anteprima 16:9. (chiude il cerchio: input HTML → output PDF pulito)

## Post-produzione
- Taglia i tempi morti (attese del picker file, ecc.).
- Ottimizza: `gifsicle -O3 --colors 128 in.gif -o assets/demo.gif` (punta a < 4–5 MB, GitHub regge ma più leggera = carica prima nel README).
  - In alternativa esporta **MP4** e linkalo: i README GitHub riproducono `<video>` se carichi l'mp4 come asset via drag nella issue/PR e incolli l'URL. La GIF resta la scelta più semplice/compatibile.
- Salva in `assets/demo.gif`, poi **scommenta** il blocco `<img src="assets/demo.gif">` nel README (EN + IT).

## Nota
Il banner `social-preview.png` resta come hero statico (fallback per chi ha le immagini
GIF disattivate). La GIF va **sopra** o **subito sotto** il titolo, prima di "Why Slidewright?".

/**
 * Agente: definizione tool + loop tool-calling. È volutamente "host-agnostico":
 * non conosce lo store, riceve da fuori `exec(name,args)` (lo esegue l'app, così
 * ogni operazione passa da store.commit → undo/redo + autosave) e `chatFn`
 * (di default llmChat, mockabile nei test).
 */

import { llmChat } from './llm.js';

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_slide',
      description: 'Restituisce l\'HTML interno di una slide per indice (0-based).',
      parameters: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_slide',
      description: 'Sostituisce l\'HTML interno della slide indicata. Usa le classi/struttura del deck esistente (.header/.content/.card/.grid-2…). NIENTE <script>.',
      parameters: {
        type: 'object',
        properties: { index: { type: 'integer' }, html: { type: 'string' } },
        required: ['index', 'html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_slide',
      description: 'Inserisce una nuova slide DOPO afterIndex (default: in fondo), con l\'HTML interno dato.',
      parameters: {
        type: 'object',
        properties: { afterIndex: { type: 'integer' }, html: { type: 'string' } },
        required: ['html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_slide',
      description: 'Elimina la slide all\'indice dato.',
      parameters: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reorder_slides',
      description: 'Sposta la slide da "from" alla posizione "to".',
      parameters: {
        type: 'object',
        properties: { from: { type: 'integer' }, to: { type: 'integer' } },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_style_css',
      description: 'Sostituisce il CSS globale del deck (il blocco <style>). Cambia qui palette/font/spaziature per applicarle a tutte le slide.',
      parameters: { type: 'object', properties: { css: { type: 'string' } }, required: ['css'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_title',
      description: 'Imposta il titolo del documento/deck.',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
  },
];

function systemPrompt(ctx) {
  return [
    'Sei l\'assistente di Slide Studio, un editor di deck di slide HTML.',
    `Modifichi il documento SOLO tramite i tool forniti. Canvas logico ${ctx.canvas.w}×${ctx.canvas.h} (16:9).`,
    `Modalità documento: "${ctx.mode}". Titolo: "${ctx.title}". Slide totali: ${ctx.slideTitles.length}. Slide corrente: indice ${ctx.currentIndex}.`,
    'Indice slide (indice: titolo):',
    ctx.slideTitles.join('\n'),
    '',
    'Regole:',
    '- Rispetta lo stile e le classi del deck esistente (.header/.content/.card/.grid-2/.grid-3/.pill/.footer, variabili CSS :root).',
    '- Per cambi globali (palette, font) usa set_style_css; per cambi a una slide usa update_slide.',
    '- Le immagini compaiono come <img src="(immagine aN)" data-ss-asset="aN">: NON modificare l\'attributo data-ss-asset (è il riferimento al file), così l\'immagine resta intatta.',
    '- Mai inserire <script>. Mantieni l\'HTML pulito.',
    '- Quando hai finito, rispondi in italiano con un breve riassunto di cosa hai fatto.',
    '',
    'CSS globale attuale (troncato):',
    '```css',
    (ctx.styleCss || '').slice(0, 3500),
    '```',
    '',
    `HTML della slide corrente (indice ${ctx.currentIndex}):`,
    '```html',
    ctx.currentSlideHtml || '',
    '```',
  ].join('\n');
}

/**
 * Esegue un turno dell'agente.
 * @param history  array di messaggi (role/content…) MUTATO in-place con il turno.
 * @param exec     (name,args) => result  (eseguito dall'app, ritorna oggetto serializzabile)
 * @param onStep   callback opzionale per UI (es. "sto applicando update_slide")
 * @returns testo finale dell'assistente
 */
export async function runAgentTurn({ connection, ctx, history, userText, exec, chatFn = llmChat, signal, onStep, maxSteps = 6 }) {
  const messages = [{ role: 'system', content: systemPrompt(ctx) }, ...history, { role: 'user', content: userText }];
  history.push({ role: 'user', content: userText });

  for (let step = 0; step < maxSteps; step++) {
    const { content, toolCalls, raw } = await chatFn({ connection, messages, tools: TOOLS, signal });

    if (toolCalls && toolCalls.length) {
      const assistantMsg = { role: 'assistant', content: content || '', tool_calls: raw?.tool_calls };
      messages.push(assistantMsg);
      history.push(assistantMsg);
      for (const tc of toolCalls) {
        onStep?.(tc.name, tc.args);
        let result;
        try { result = await exec(tc.name, tc.args); }
        catch (e) { result = { error: e.message }; }
        const toolMsg = { role: 'tool', tool_call_id: tc.id, name: tc.name, content: JSON.stringify(result) };
        messages.push(toolMsg);
        history.push(toolMsg);
      }
      continue; // rimanda al modello con i risultati
    }

    const finalMsg = { role: 'assistant', content: content || '' };
    history.push(finalMsg);
    return content || '(nessuna risposta)';
  }
  return 'Ho raggiunto il limite di passi per questo turno.';
}

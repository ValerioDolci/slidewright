/**
 * Layer LLM provider-neutrale. Un solo adapter "OpenAI-compatible" copre
 * Mistral, OpenRouter, Ollama/LM Studio (locali), OpenAI, Azure OpenAI, Groq…
 * (tutti espongono POST {baseUrl}/chat/completions con `tools`).
 *
 * connection = { id, name, type:'openai', baseUrl, apiKey, model }
 *
 * NB: chiamata diretta dal browser → la chiave sta in locale e alcuni provider
 * bloccano via CORS (vedi messaggi d'errore). Endpoint locali (Ollama/LM Studio)
 * e OpenRouter sono i più "browser-friendly".
 */

export const PROVIDER_PRESETS = [
  { name: 'Mistral',        type: 'openai', baseUrl: 'https://api.mistral.ai/v1',     model: 'mistral-large-latest' },
  { name: 'OpenRouter',     type: 'openai', baseUrl: 'https://openrouter.ai/api/v1',  model: 'openai/gpt-4o-mini' },
  { name: 'Ollama (locale)', type: 'openai', baseUrl: 'http://localhost:11434/v1',    model: 'llama3.1' },
  { name: 'LM Studio (locale)', type: 'openai', baseUrl: 'http://localhost:1234/v1',  model: 'local-model' },
  { name: 'OpenAI',         type: 'openai', baseUrl: 'https://api.openai.com/v1',     model: 'gpt-4o-mini' },
];

/**
 * Esegue una chat completion. Ritorna { content, toolCalls, raw }.
 * toolCalls: [{ id, name, args(obj) }]  ·  raw = message originale (per la history).
 */
export async function llmChat({ connection, messages, tools, signal }) {
  if (!connection || !connection.baseUrl) throw new Error('Nessuna connessione LLM configurata.');
  const url = connection.baseUrl.replace(/\/$/, '') + '/chat/completions';

  const body = {
    model: connection.model,
    messages,
    temperature: 0.2,
    stream: false,
  };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new Error(
      `Impossibile contattare il provider (${e.message}). ` +
      `Spesso è un blocco CORS della chiamata dal browser: usa un endpoint locale ` +
      `(Ollama/LM Studio), OpenRouter, oppure un piccolo proxy.`
    );
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch (_) { detail = await res.text().catch(() => ''); }
    if (res.status === 401) throw new Error('Chiave API non valida (401).');
    throw new Error(`Errore provider ${res.status}: ${detail || res.statusText}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name,
    args: safeParse(tc.function?.arguments),
  }));
  return { content: msg.content || '', toolCalls, raw: msg };
}

function safeParse(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (_) { return {}; }
}

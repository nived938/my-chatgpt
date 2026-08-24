import express from 'express';
import { JSDOM } from 'jsdom';
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.cacheDir = process.env.HF_HOME || './.cache/transformers';

const MODEL = 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA';
const DEVICE = 'cpu';
const DTYPE = 'q4';
let generatorPromise = null;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = process.env.FRONTEND_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : origin === allowed ? origin : allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function clean(text = '') { return String(text).replace(/\s+/g, ' ').trim(); }

async function getGenerator() {
  if (!generatorPromise) {
    console.log(`Loading local model: ${MODEL} (${DEVICE}/${DTYPE})`);
    generatorPromise = pipeline('text-generation', MODEL, { device: DEVICE, dtype: DTYPE }).catch(error => {
      generatorPromise = null;
      console.error('MODEL LOAD ERROR:', error);
      throw error;
    });
  }
  return generatorPromise;
}

function makePrompt(messages) {
  const system = messages.find(m => m.role === 'system')?.content || 'You are a helpful assistant.';
  const conversation = messages.filter(m => m.role !== 'system').slice(-8);
  let prompt = `<|im_start|>system\n${system}<|im_end|>\n`;
  for (const message of conversation) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    prompt += `<|im_start|>${role}\n${message.content}<|im_end|>\n`;
  }
  return `${prompt}<|im_start|>assistant\n`;
}

function extractAnswer(output) {
  const generated = output?.[0]?.generated_text;
  if (typeof generated !== 'string') return '';
  return generated.split('<|im_start|>assistant').pop().split('<|im_end|>')[0].trim();
}

app.get('/api/health', (_req, res) => res.json({ ok: true, localAI: true, model: MODEL, device: DEVICE, dtype: DTYPE, tools: ['chat', 'search', 'open', 'calculator'] }));

app.post('/api/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'messages are required' });
  const safeMessages = messages.slice(-10).map(m => ({ role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user', content: String(m.content || '').slice(0, 8000) }));
  try {
    console.log(`Generating response for ${safeMessages.length} messages...`);
    const generator = await getGenerator();
    const prompt = makePrompt(safeMessages);
    console.log('Generating local response...');
    const output = await generator(prompt, { max_new_tokens: 160, temperature: 0.7, top_p: 0.9, repetition_penalty: 1.05, do_sample: true, return_full_text: true });
    const answer = extractAnswer(output);
    if (!answer) throw new Error('The local model returned an empty response');
    console.log('Local response generated successfully');
    res.json({ answer });
  } catch (error) {
    console.error('LOCAL AI ERROR:', error);
    res.status(500).json({ error: 'Local AI generation failed', detail: error?.message || String(error) });
  }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length > 500) return res.status(400).json({ error: 'Invalid query' });
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 MyChatGPT/1.0' } });
    if (!r.ok) throw new Error(`Search returned ${r.status}`);
    const dom = new JSDOM(await r.text());
    const results = [...dom.window.document.querySelectorAll('.result')].slice(0, 8).map(node => {
      const a = node.querySelector('.result__a');
      const snippet = node.querySelector('.result__snippet');
      return { title: clean(a?.textContent), url: a?.href || '', snippet: clean(snippet?.textContent) };
    }).filter(x => x.title && x.url);
    res.json({ query: q, results });
  } catch (error) { res.status(502).json({ error: 'Web search failed', detail: error.message }); }
});

app.get('/api/open', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Only http(s) URLs are supported' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 MyChatGPT/1.0' }, redirect: 'follow' });
    const dom = new JSDOM(await r.text(), { url: r.url });
    dom.window.document.querySelectorAll('script,style,noscript,svg').forEach(n => n.remove());
    res.json({ url: r.url, title: clean(dom.window.document.title), text: clean(dom.window.document.body?.textContent || '').slice(0, 30000) });
  } catch (error) { res.status(502).json({ error: 'Could not open page', detail: error.message }); }
});

app.get('/api/calc', (req, res) => {
  const expression = String(req.query.expression || '').trim();
  if (!expression || expression.length > 200 || !/^[0-9+\-*/%().,\s^]+$/.test(expression)) return res.status(400).json({ error: 'Invalid expression' });
  try {
    const normalized = expression.replace(/,/g, '.').replace(/\^/g, '**');
    const value = Function(`"use strict"; return (${normalized})`)();
    if (!Number.isFinite(value)) throw new Error('Result is not finite');
    res.json({ expression, result: value });
  } catch { res.status(400).json({ error: 'Could not calculate expression' }); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
const port = process.env.PORT || 3001;
app.listen(port, '0.0.0.0', () => console.log(`My ChatGPT backend running on ${port}`));

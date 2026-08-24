import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.cacheDir = path.resolve(process.env.HF_HOME || './.cache', 'transformers');

const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
let generatorPromise;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function clean(text = '') { return String(text).replace(/\s+/g, ' ').trim(); }

async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = pipeline('text-generation', MODEL, {
      device: 'cpu',
      dtype: 'q4'
    }).catch(error => {
      generatorPromise = null;
      throw error;
    });
  }
  return generatorPromise;
}

function extractAnswer(output) {
  const generated = output?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1];
    if (typeof last === 'string') return last.trim();
    if (last && typeof last.content === 'string') return last.content.trim();
  }
  if (typeof generated === 'string') return generated.replace(/^assistant\s*/i, '').trim();
  return '';
}

app.get('/api/health', (_req, res) => res.json({ ok: true, localAI: true, model: MODEL, device: 'cpu', tools: ['chat', 'search', 'open', 'calculator'] }));

app.post('/api/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'messages are required' });
  const safeMessages = messages.slice(-14).map(m => ({
    role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user',
    content: String(m.content || '').slice(0, 12000)
  }));
  try {
    console.log(`Generating response for ${safeMessages.length} messages...`);
    const generator = await getGenerator();
    const output = await generator(safeMessages, {
      max_new_tokens: 512,
      temperature: 0.65,
      top_p: 0.9,
      repetition_penalty: 1.08,
      do_sample: true
    });
    const answer = extractAnswer(output);
    if (!answer) throw new Error('The local model returned an empty response');
    res.json({ answer: String(answer) });
  } catch (e) {
    console.error('LOCAL AI ERROR:', e);
    res.status(500).json({ error: 'Local AI generation failed', detail: e?.message || String(e) });
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
  } catch (e) { res.status(502).json({ error: 'Web search failed', detail: e.message }); }
});

app.get('/api/open', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Only http(s) URLs are supported' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 MyChatGPT/1.0' }, redirect: 'follow' });
    const dom = new JSDOM(await r.text(), { url: r.url });
    dom.window.document.querySelectorAll('script,style,noscript,svg').forEach(n => n.remove());
    res.json({ url: r.url, title: clean(dom.window.document.title), text: clean(dom.window.document.body?.textContent || '').slice(0, 30000) });
  } catch (e) { res.status(502).json({ error: 'Could not open page', detail: e.message }); }
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

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`My ChatGPT backend running on ${port}`));

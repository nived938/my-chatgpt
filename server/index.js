import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

function clean(text = '') {
  return text.replace(/\\s+/g, ' ').trim();
}

app.get('/api/health', (_req, res) => res.json({ ok: true, localAI: true, tools: ['search', 'open', 'calculator'] }));

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 MyChatGPT/1.0' } });
    if (!r.ok) throw new Error(`Search returned ${r.status}`);
    const html = await r.text();
    const dom = new JSDOM(html);
    const nodes = [...dom.window.document.querySelectorAll('.result')].slice(0, 8);
    const results = nodes.map((node) => {
      const a = node.querySelector('.result__a');
      const snippet = node.querySelector('.result__snippet');
      return { title: clean(a?.textContent), url: a?.href || '', snippet: clean(snippet?.textContent) };
    }).filter(x => x.title && x.url);
    res.json({ query: q, results });
  } catch (e) {
    res.status(502).json({ error: 'Web search failed', detail: e.message });
  }
});

app.get('/api/open', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!/^https?:\\/\\//i.test(url)) return res.status(400).json({ error: 'Only http(s) URLs are supported' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 MyChatGPT/1.0' }, redirect: 'follow' });
    const html = await r.text();
    const dom = new JSDOM(html, { url: r.url });
    dom.window.document.querySelectorAll('script,style,noscript,svg').forEach(n => n.remove());
    const title = clean(dom.window.document.title);
    const text = clean(dom.window.document.body?.textContent || '').slice(0, 30000);
    res.json({ url: r.url, title, text });
  } catch (e) {
    res.status(502).json({ error: 'Could not open page', detail: e.message });
  }
});

app.get('/api/calc', (req, res) => {
  const expression = String(req.query.expression || '').trim();
  if (!expression || !/^[0-9+\\-*/%().,\\s^]+$/.test(expression)) return res.status(400).json({ error: 'Unsafe or invalid expression' });
  try {
    const normalized = expression.replace(/,/g, '.').replace(/\\^/g, '**');
    const value = Function(`"use strict"; return (${normalized})`)();
    if (!Number.isFinite(value)) throw new Error('Result is not finite');
    res.json({ expression, result: value });
  } catch {
    res.status(400).json({ error: 'Could not calculate expression' });
  }
});

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`My ChatGPT server running on ${port}`));

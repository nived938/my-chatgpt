import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bot, ChevronDown, Copy, Globe, Menu, MessageSquarePlus, Moon, Paperclip, Plus, Send, Settings, Sparkles, Sun, Trash2, X } from 'lucide-react';
import './styles.css';

const STORAGE = 'my-chatgpt-chats-v2';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = path => `${API_BASE}${path}`;

function uid() { return crypto.randomUUID(); }
function newChat() { return { id: uid(), title: 'New chat', messages: [], createdAt: Date.now() }; }
function shouldSearch(text) { return /\b(latest|today|current|recent|news|search|look up|website|web|internet|2026|price|weather)\b/i.test(text); }
function shouldCalc(text) { return /^[\d\s()+\-*/%.^]+$/.test(text.trim()) || /^(calculate|what is)\s+[\d\s()+\-*/%.^]+$/i.test(text.trim()); }

function App() {
  const [chats, setChats] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE)) || [newChat()]; } catch { return [newChat()]; } });
  const [activeId, setActiveId] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE))?.[0]?.id; } catch { return undefined; } });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const [modelStatus, setModelStatus] = useState('Backend AI ready');
  const [dark, setDark] = useState(() => localStorage.getItem('my-chatgpt-theme') !== 'light');
  const [sidebar, setSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef(null);
  const active = useMemo(() => chats.find(c => c.id === activeId) || chats[0], [chats, activeId]);

  useEffect(() => localStorage.setItem(STORAGE, JSON.stringify(chats)), [chats]);
  useEffect(() => { if (!activeId && chats[0]) setActiveId(chats[0].id); }, [activeId, chats]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('my-chatgpt-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [active?.messages, loading]);

  function updateActive(fn) { if (!active) return; setChats(prev => prev.map(c => c.id === active.id ? fn(c) : c)); }
  function newConversation() { const c = newChat(); setChats(p => [c, ...p]); setActiveId(c.id); setInput(''); }
  function deleteChat(id) { setChats(p => { const next = p.filter(c => c.id !== id); const safe = next.length ? next : [newChat()]; if (id === activeId) setActiveId(safe[0].id); return safe; }); }

  async function runTools(text) {
    if (shouldCalc(text)) {
      const expression = text.replace(/^(calculate|what is)\s+/i, '');
      setToolStatus('Calculating...');
      const r = await fetch(api(`/api/calc?expression=${encodeURIComponent(expression)}`));
      if (r.ok) return { kind: 'calculator', data: await r.json() };
    }
    if (!shouldSearch(text)) return null;
    setToolStatus('Searching the web...');
    const r = await fetch(api(`/api/search?q=${encodeURIComponent(text)}`));
    if (!r.ok) throw new Error('Web search failed');
    return { kind: 'search', data: await r.json() };
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading || !active) return;
    setInput(''); setLoading(true); setToolStatus('');
    const user = { id: uid(), role: 'user', content: text, time: Date.now() };
    const history = [...active.messages, user].slice(-12).map(m => ({ role: m.role, content: m.content }));
    updateActive(c => ({ ...c, title: c.messages.length ? c.title : text.slice(0, 42), messages: [...c.messages, user] }));
    try {
      const tool = await runTools(text);
      let context = '';
      if (tool?.kind === 'calculator') context = `Calculator result: ${tool.data.result}`;
      if (tool?.kind === 'search') context = `Web search results for: ${tool.data.query}\n` + tool.data.results.map((x, i) => `${i + 1}. ${x.title}\nURL: ${x.url}\n${x.snippet}`).join('\n\n');
      setToolStatus('Thinking...');
      const system = `You are My ChatGPT, a helpful coding and research assistant. Give accurate, practical answers. For code, provide complete runnable code and explain where it goes. If web results are supplied, use them and cite their URLs. Do not reveal private chain-of-thought. Keep answers clear and useful.\n${context ? `TOOL CONTEXT:\n${context}` : ''}`;
      const r = await fetch(api('/api/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: system }, ...history] }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.error || `Backend returned ${r.status}`);
      const assistant = { id: uid(), role: 'assistant', content: data.answer || 'I could not generate a response.', time: Date.now(), tool };
      updateActive(c => ({ ...c, messages: [...c.messages, assistant] }));
      setModelStatus('Backend local AI ready');
    } catch (err) {
      updateActive(c => ({ ...c, messages: [...c.messages, { id: uid(), role: 'assistant', content: `I could not get a reply from the backend.\n\n${err.message}\n\nMake sure the Render backend is running and VITE_API_URL points to its URL.`, time: Date.now() }] }));
      setModelStatus('Backend connection error');
    } finally { setLoading(false); setToolStatus(''); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? 'open' : 'closed'}`}>
      <div className="side-top"><button className="icon-btn" onClick={() => setSidebar(false)}><X size={19}/></button><span className="brand-mini">My ChatGPT</span></div>
      <button className="new-chat" onClick={newConversation}><Plus size={18}/> New chat</button>
      <div className="history-label">Chats</div>
      <div className="chat-list">{chats.map(c => <button key={c.id} className={`chat-item ${c.id === active?.id ? 'selected' : ''}`} onClick={() => setActiveId(c.id)}><MessageSquarePlus size={16}/><span>{c.title}</span><Trash2 className="delete-chat" size={15} onClick={e => { e.stopPropagation(); deleteChat(c.id); }}/></button>)}</div>
      <div className="side-bottom"><button onClick={() => setShowSettings(true)}><Settings size={17}/> Settings</button><div className="local-badge"><span></span> No AI API key</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="icon-btn" onClick={() => setSidebar(true)}><Menu size={20}/></button><div className="model-picker"><Sparkles size={17}/><strong>My ChatGPT</strong><ChevronDown size={15}/></div><div className="top-actions"><button className="icon-btn" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="icon-btn" onClick={() => setShowSettings(true)}><Settings size={18}/></button></div></header>
      <section className="conversation">
        {active?.messages.length === 0 ? <div className="welcome"><div className="logo-orb"><Bot size={30}/></div><h1>What can I help with?</h1><p>Local AI on your Render backend, web search, coding tools, and chat history. No OpenRouter or OpenAI API key.</p><div className="suggestions"><button onClick={() => setInput('Build a responsive React dashboard with a sidebar and charts')}>💻 Build a website</button><button onClick={() => setInput('Search the web for the latest JavaScript features')}>🌐 Search the web</button><button onClick={() => setInput('Explain recursion with a simple example')}>🧠 Explain a concept</button><button onClick={() => setInput('Calculate (144 * 25) / 6')}>🧮 Calculate</button></div><div className="model-note"><Sparkles size={15}/> {modelStatus}</div></div> : active.messages.map(m => <Message key={m.id} message={m}/>) }
        {loading && <div className="message-row assistant"><div className="avatar"><Bot size={17}/></div><div className="bubble thinking"><span></span><span></span><span></span><em>{toolStatus || 'Thinking...'}</em></div></div>}<div ref={bottomRef}/>
      </section>
      <form className="composer-wrap" onSubmit={sendMessage}><div className="composer"><button type="button" className="attach"><Paperclip size={19}/></button><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} placeholder="Message My ChatGPT..." rows="1"/><button className="send" disabled={!input.trim() || loading}><Send size={18}/></button></div><div className="composer-note">Replies are generated by the local AI model running on the backend. No AI API key is used.</div></form>
    </main>
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><h2>Settings</h2><button className="icon-btn" onClick={() => setShowSettings(false)}><X size={19}/></button></div><div className="setting"><div><strong>AI engine</strong><p>Qwen 2.5 0.5B runs on the Render backend through Transformers.js and WASM.</p></div><span className="pill">No API</span></div><div className="setting"><div><strong>Web search</strong><p>DuckDuckGo search runs through the backend when fresh information is needed.</p></div><span className="pill">Enabled</span></div><div className="setting"><div><strong>Theme</strong><p>Switch between dark and light mode.</p></div><button className="theme-toggle" onClick={() => setDark(!dark)}>{dark ? 'Dark' : 'Light'}</button></div><div className="danger"><button onClick={() => { localStorage.removeItem(STORAGE); location.reload(); }}><Trash2 size={16}/> Clear all chats</button></div></div></div>}
  </div>;
}

function Message({ message }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1200); }
  return <div className={`message-row ${message.role}`}><div className="avatar">{message.role === 'assistant' ? <Bot size={17}/> : 'N'}</div><div className="bubble-wrap"><div className="bubble">{message.content.split(/(```[\s\S]*?```)/g).map((part, i) => part.startsWith('```') ? <pre key={i}><code>{part.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '')}</code><button onClick={() => navigator.clipboard.writeText(part.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, ''))}><Copy size={14}/></button></pre> : <p key={i}>{part}</p>)}</div>{message.tool?.kind === 'search' && <div className="sources"><Globe size={14}/><strong>Web sources</strong>{message.tool.data.results.map((x, i) => <a key={i} href={x.url} target="_blank" rel="noreferrer">{x.title}</a>)}</div>}<button className="copy-answer" onClick={copy}>{copied ? 'Copied' : <><Copy size={14}/> Copy</>}</button></div></div>;
}

createRoot(document.getElementById('root')).render(<App/>);

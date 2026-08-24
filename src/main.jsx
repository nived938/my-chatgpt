import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE = 'my-chatgpt-chats-v3';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = (path) => `${API_BASE}${path}`;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeChat() {
  return { id: uid(), title: 'New chat', messages: [] };
}

function loadChats() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE));
    return Array.isArray(value) && value.length ? value : [makeChat()];
  } catch {
    return [makeChat()];
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function Message({ message }) {
  const isUser = message.role === 'user';
  const parts = String(message.content || '').split(/(```[\s\S]*?```)/g);
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">{isUser ? 'You' : 'AI'}</div>
      <div className="message-body">
        {parts.map((part, index) => {
          if (part.startsWith('```')) {
            const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
            return <pre key={index}><code>{code}</code><button type="button" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button></pre>;
          }
          return part.split('\n').map((line, i) => <React.Fragment key={`${index}-${i}`}>{line}{i < part.split('\n').length - 1 && <br />}</React.Fragment>);
        })}
      </div>
    </div>
  );
}

function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => loadChats()[0]?.id);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('my-chatgpt-theme') !== 'light');
  const [sidebar, setSidebar] = useState(true);
  const [error, setError] = useState('');

  const active = chats.find(chat => chat.id === activeId) || chats[0];

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('my-chatgpt-theme', dark ? 'dark' : 'light');
  }, [dark]);

  function newChat() {
    const chat = makeChat();
    setChats(current => [chat, ...current]);
    setActiveId(chat.id);
    setInput('');
    setError('');
  }

  function selectChat(id) {
    setActiveId(id);
    setError('');
  }

  function deleteChat(id) {
    setChats(current => {
      const remaining = current.filter(chat => chat.id !== id);
      const next = remaining.length ? remaining : [makeChat()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function addMessages(id, messages) {
    setChats(current => current.map(chat => chat.id === id ? { ...chat, messages: [...chat.messages, ...messages] } : chat));
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading || !active) return;

    setInput('');
    setError('');
    setLoading(true);

    const userMessage = { id: uid(), role: 'user', content: text };
    const chatId = active.id;
    const history = [...active.messages, userMessage].slice(-10).map(m => ({ role: m.role, content: m.content }));

    setChats(current => current.map(chat => chat.id === chatId ? {
      ...chat,
      title: chat.messages.length ? chat.title : text.slice(0, 40),
      messages: [...chat.messages, userMessage]
    } : chat));

    try {
      const response = await fetch(api('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || `Backend returned ${response.status}`);

      addMessages(chatId, [{ id: uid(), role: 'assistant', content: data.answer || 'The AI returned an empty response.' }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addMessages(chatId, [{ id: uid(), role: 'assistant', content: `I could not get a response from the backend.\n\n${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? 'open' : 'closed'}`}>
        <div className="brand-row"><strong>My ChatGPT</strong><button type="button" onClick={() => setSidebar(false)}>×</button></div>
        <button type="button" className="new-chat" onClick={newChat}>＋ New chat</button>
        <div className="history-title">Chats</div>
        <div className="chat-list">
          {chats.map(chat => (
            <div key={chat.id} className={`chat-item ${chat.id === active?.id ? 'selected' : ''}`}>
              <button type="button" onClick={() => selectChat(chat.id)}>{chat.title}</button>
              <button type="button" className="delete" onClick={() => deleteChat(chat.id)}>×</button>
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button type="button" onClick={() => setSidebar(true)}>☰</button>
          <strong>My ChatGPT</strong>
          <button type="button" onClick={() => setDark(value => !value)}>{dark ? '☀' : '☾'}</button>
        </header>

        <section className="conversation">
          {!active?.messages.length && !loading ? (
            <div className="welcome">
              <div className="welcome-logo">AI</div>
              <h1>What can I help with?</h1>
              <p>Local AI running on your Render backend. No OpenAI or OpenRouter API.</p>
              <div className="suggestions">
                <button type="button" onClick={() => setInput('Build a responsive React website')}>Build a website</button>
                <button type="button" onClick={() => setInput('Explain JavaScript promises')}>Explain a concept</button>
                <button type="button" onClick={() => setInput('Search the web for the latest JavaScript news')}>Search the web</button>
              </div>
            </div>
          ) : null}

          {active?.messages.map(message => <Message key={message.id} message={message} />)}
          {loading && <div className="loading">AI is thinking...</div>}
          {error && <div className="error-box">Backend error: {error}</div>}
        </section>

        <form className="composer-wrap" onSubmit={sendMessage}>
          <div className="composer">
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(event);
                }
              }}
              placeholder="Message My ChatGPT..."
              rows="1"
            />
            <button type="submit" disabled={!input.trim() || loading}>Send</button>
          </div>
          <small>No AI API key is used. The response is generated by the backend's local model.</small>
        </form>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

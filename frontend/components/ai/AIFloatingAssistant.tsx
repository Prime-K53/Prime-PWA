import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { generateAIResponse } from '../../services/geminiService';

const AIFloatingAssistant: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hi! Ask me anything about your business data.' },
  ]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    const resp = await generateAIResponse(q);
    setMessages(prev => [...prev, { role: 'assistant', content: resp }]);
    setLoading(false);
  };

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, zIndex: 9999,
          width: 360, maxHeight: 500, background: '#fff', borderRadius: 20,
          boxShadow: '0 20px 60px rgba(15,23,42,0.18)', border: '1px solid rgba(15,23,42,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'kpi-slide-in 0.25s ease-out',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color="#8b5cf6" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>AI Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 340 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                background: m.role === 'user' ? '#8b5cf6' : '#f1f5f9',
                color: m.role === 'user' ? '#fff' : '#0f172a',
                fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
              }}>{m.content}</div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 14, background: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                <Loader2 size={14} className="animate-spin" /> Thinking...
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask anything..."
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', fontSize: 13, outline: 'none', color: '#0f172a' }}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} style={{
              border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer', width: 38, height: 38, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading || !input.trim() ? 0.5 : 1,
            }}><Send size={16} /></button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        width: 52, height: 52, borderRadius: 16, border: 'none',
        background: '#8b5cf6', color: '#fff', cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(139,92,246,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  );
};

export default AIFloatingAssistant;
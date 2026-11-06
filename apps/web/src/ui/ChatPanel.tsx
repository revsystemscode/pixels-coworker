import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@pixels/shared';
import { useApp } from '../store.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ selfId }: { selfId: string }) {
  const messages = useApp((s) => s.messages);
  const sendChat = useApp((s) => s.sendChat);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mantiene el scroll abajo al llegar mensajes nuevos.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  // Enter fuera del chat abre el chat; Escape dentro devuelve el control al juego.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setText('');
  };

  return (
    <aside className="chat panel" aria-label="Chat de la sala">
      <h2>Chat</h2>
      <ol className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">Todavía no hay mensajes.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.sessionId === selfId ? 'mine' : undefined}>
            <span className="chat-meta">
              <strong>{m.name}</strong> <time>{timeFormat.format(m.at)}</time>
            </span>
            <span className="chat-text">{m.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={onSubmit}>
        <input
          ref={inputRef}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Escribe un mensaje (Enter)"
          aria-label="Mensaje"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') inputRef.current?.blur();
          }}
        />
      </form>
    </aside>
  );
}

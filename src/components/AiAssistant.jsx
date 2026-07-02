import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import styles from './AiAssistant.module.css';

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ask-jarvis', {
        body: { question },
      });

      if (error) throw error;

      setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Ошибка: ${err.message || 'не удалось получить ответ'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <button
        className={styles.fab}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Открыть AI-помощника"
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>Джарвис</div>

          <div className={styles.messages} ref={listRef}>
            {messages.length === 0 && (
              <div className={styles.hint}>
                Спросите что-нибудь, например: «что у нас есть из дуба?»
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? styles.userMsg : styles.assistantMsg}
              >
                {m.text}
              </div>
            ))}
            {loading && <div className={styles.assistantMsg}>Думаю…</div>}
          </div>

          <div className={styles.inputRow}>
            <textarea
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ваш вопрос…"
              rows={1}
            />
            <button className={styles.sendBtn} onClick={handleSend} disabled={loading}>
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

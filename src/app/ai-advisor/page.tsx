'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type Message = {
  id: string;
  role: string;
  content: string;
};

export default function AIAdvisorPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const startConversation = async () => {
    const result = await api.createConversation();
    if (result.data?.id) {
      setConversationId(result.data.id);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!conversationId || !input.trim()) return;

    setLoading(true);
    const result = await api.sendMessage(conversationId, input);
    
    if (result.data) {
      const { userMessage, assistantMessage } = result.data as {
        userMessage: Message;
        assistantMessage: Message;
      };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput('');
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>AI 자산 상담</h1>
      
      {!conversationId ? (
        <div style={{ marginTop: '2rem' }}>
          <button
            onClick={startConversation}
            style={{
              padding: '1rem 2rem',
              fontSize: '1rem',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            새 상담 시작
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '2rem' }}>
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1rem',
              minHeight: '400px',
              maxHeight: '500px',
              overflowY: 'auto',
              marginBottom: '1rem'
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  backgroundColor: msg.role === 'user' ? '#e3f2fd' : '#f5f5f5',
                  borderRadius: '8px'
                }}
              >
                <strong>{msg.role === 'user' ? '나' : 'AI'}:</strong>
                <p style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              </div>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="질문을 입력하세요..."
              style={{
                flex: 1,
                padding: '1rem',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '8px'
              }}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                padding: '1rem 2rem',
                fontSize: '1rem',
                backgroundColor: loading ? '#ccc' : '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? '전송 중...' : '전송'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

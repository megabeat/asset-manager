'use client';

import { useEffect, useState } from 'react';
import { api, ChatMessage, Conversation } from '@/lib/api';

export default function AIAdvisorPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadConversations() {
    const result = await api.getConversations();
    if (result.data) {
      const sorted = [...result.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setConversations(sorted);
    }
    if (result.error) {
      setMessage(`대화 조회 실패: ${result.error.message}`);
    }
  }

  useEffect(() => {
    loadConversations();
  }, []);

  const loadMessages = async (id: string) => {
    const result = await api.getMessages(id);
    if (result.data) {
      setMessages(result.data);
    }
    if (result.error) {
      setMessage(`메시지 조회 실패: ${result.error.message}`);
    }
  };

  const startConversation = async () => {
    setMessage(null);
    const result = await api.createConversation();
    if (result.data?.id) {
      setConversationId(result.data.id);
      setMessages([]);
      await loadConversations();
    } else if (result.error) {
      setMessage(`대화 시작 실패: ${result.error.message}`);
    }
  };

  const sendMessage = async () => {
    if (!conversationId || !input.trim()) return;

    setMessage(null);
    setLoading(true);
    const result = await api.sendMessage(conversationId, input);
    
    if (result.data) {
      const { userMessage, assistantMessage } = result.data as {
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
      };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput('');
    } else if (result.error) {
      setMessage(`전송 실패: ${result.error.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>AI 자산 상담</h1>
      {message && <p style={{ marginTop: '0.75rem' }}>{message}</p>}

      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <button
          onClick={startConversation}
          style={{
            padding: '0.8rem 1.2rem',
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

      {conversations.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <strong>기존 대화</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={async () => {
                  setConversationId(conversation.id);
                  await loadMessages(conversation.id);
                }}
                style={{
                  padding: '0.45rem 0.7rem',
                  borderRadius: 6,
                  border: '1px solid #d0d0d0',
                  backgroundColor: conversation.id === conversationId ? '#e3f2fd' : '#fff',
                  cursor: 'pointer'
                }}
              >
                {conversation.title?.trim() || '새 대화'}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {!conversationId ? (
        <div style={{ marginTop: '2rem' }}>상담을 시작하거나 기존 대화를 선택하세요.</div>
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

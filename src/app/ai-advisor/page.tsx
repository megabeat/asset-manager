'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, ChatMessage, Conversation } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';

export default function AIAdvisorPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversations, conversationId]
  );

  function formatKoreanDate(iso?: string): string {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

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

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ padding: '1rem 0' }}>
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0 }}>AI 자산 상담</h1>
            <p className="helper-text" style={{ marginTop: '0.45rem' }}>
              Mr. Money가 현재 자산/지출 컨텍스트를 바탕으로 실행 가능한 금융 전략을 제안합니다.
            </p>
          </div>
          <button onClick={startConversation} className="btn-primary" style={{ minWidth: 132 }}>
            새 상담 시작
          </button>
        </div>
      </SectionCard>

      {message && <p style={{ marginTop: '0.8rem' }}>{message}</p>}

      <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <SectionCard style={{ padding: '0.85rem', height: '640px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 0.65rem' }}>대화 목록</h3>
          <div style={{ overflowY: 'auto', display: 'grid', gap: '0.45rem' }}>
            {conversations.length === 0 ? (
              <p className="helper-text">아직 저장된 상담이 없습니다.</p>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === conversationId;
                return (
                  <button
                    key={conversation.id}
                    onClick={async () => {
                      setConversationId(conversation.id);
                      await loadMessages(conversation.id);
                    }}
                    className={selected ? 'btn-primary' : 'btn-subtle'}
                    style={{ textAlign: 'left', padding: '0.65rem 0.7rem' }}
                  >
                    <strong style={{ display: 'block' }}>{conversation.title?.trim() || '새 대화'}</strong>
                    <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.79rem', opacity: 0.9 }}>
                      {formatKoreanDate(conversation.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </SectionCard>

        <SectionCard style={{ padding: '0.9rem', height: '640px', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: '0.7rem' }}>
          <div style={{ borderBottom: '1px solid #eef2f7', paddingBottom: '0.55rem' }}>
            <strong>{activeConversation?.title?.trim() || (conversationId ? '상담 진행 중' : '상담 시작 전')}</strong>
            <p className="helper-text" style={{ marginTop: '0.25rem' }}>
              Enter 전송 · Shift+Enter 줄바꿈
            </p>
          </div>

          <div style={{ overflowY: 'auto', paddingRight: '0.2rem' }}>
            {!conversationId ? (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                <p className="helper-text">새 상담을 시작하거나 기존 대화를 선택하세요.</p>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                <p className="helper-text">첫 질문을 입력하면 상담이 시작됩니다.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'grid',
                        justifyItems: isUser ? 'end' : 'start'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '82%',
                          border: '1px solid #e5e7eb',
                          borderRadius: 12,
                          padding: '0.7rem 0.8rem',
                          background: isUser ? '#e9f3ff' : '#f8fafc'
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.35rem' }}>
                          {isUser ? '나' : 'Mr. Money'}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{msg.content}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="예: 월 잉여자금으로 ETF 포트폴리오를 어떻게 구성하면 좋을까?"
              rows={3}
              disabled={loading || !conversationId}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <p className="helper-text">금융 상담은 정보 제공 목적이며 최종 투자 판단은 본인 책임입니다.</p>
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim() || !conversationId}
                className="btn-primary"
                style={{ minWidth: 96 }}
              >
                {loading ? '전송 중...' : '전송'}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

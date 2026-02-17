'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, ChatMessage, Conversation } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { useConfirmModal } from '@/hooks/useConfirmModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import ReactMarkdown from 'react-markdown';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { LoginPrompt } from '@/components/ui/AuthGuard';

export default function AIAdvisorPage() {
  const authStatus = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();
  const { confirmState, confirm, onConfirm: onModalConfirm, onCancel: onModalCancel } = useConfirmModal();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversations, conversationId]
  );

  function getConversationLabel(conversation: Conversation, isSelected: boolean): string {
    const title = conversation.title?.trim();
    if (title) {
      return title;
    }
    return isSelected ? '새 대화' : '지난 대화';
  }

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
      setErrorMessage('대화 조회 실패', result.error);
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
      setErrorMessage('메시지 조회 실패', result.error);
    }
  };

  const startConversation = async () => {
    clearMessage();
    const result = await api.createConversation();
    if (result.data?.id) {
      setConversationId(result.data.id);
      if (result.data.greetingMessage) {
        setMessages([result.data.greetingMessage]);
      } else {
        await loadMessages(result.data.id);
      }
      await loadConversations();
    } else if (result.error) {
      setErrorMessage('대화 시작 실패', result.error);
    }
  };

  const deleteConversation = async (id: string) => {
    const yes = await confirm('이 대화를 삭제하시겠습니까?', { title: '대화 삭제', confirmLabel: '삭제' });
    if (!yes) return;
    clearMessage();
    const result = await api.deleteConversation(id);
    if (result.error) {
      setErrorMessage('대화 삭제 실패', result.error);
      return;
    }

    setConversations((prev) => prev.filter((item) => item.id !== id));

    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!conversationId || !input.trim() || loading) return;

    clearMessage();
    const pendingText = input.trim();
    const tempUserMessageId = `temp-user-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: tempUserMessageId,
        role: 'user',
        content: pendingText,
        createdAt: new Date().toISOString()
      }
    ]);
    setInput('');

    setLoading(true);

    try {
      const result = await api.sendMessage(conversationId, pendingText);

      if (result.error) {
        setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessageId));
        setErrorMessage('전송 실패', result.error);
        return;
      }

      const payload = result.data as
        | { userMessage?: ChatMessage; assistantMessage?: ChatMessage }
        | null;
      const assistantMessage = payload?.assistantMessage;

      if (!assistantMessage) {
        await loadMessages(conversationId);
        return;
      }

      setMessages((prev) => {
        const withoutTempUser = prev.filter((msg) => msg.id !== tempUserMessageId);
        const next = [...withoutTempUser];
        if (payload.userMessage) {
          next.push(payload.userMessage);
        }
        next.push(assistantMessage);
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  if (authStatus === 'loading') return <LoadingSpinner />;
  if (authStatus !== 'authenticated') return <LoginPrompt />;

  return (
    <div className="py-4">
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="m-0">AI 자산 상담</h1>
            <p className="helper-text mt-1.5">
              Mr. Money가 현재 자산/지출 컨텍스트를 바탕으로 실행 가능한 금융 전략을 제안합니다.
            </p>
          </div>
          <button onClick={startConversation} className="btn-primary min-w-[132px]">
            새 상담 시작
          </button>
        </div>
      </SectionCard>

      <FeedbackBanner feedback={feedback} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SectionCard className="flex h-[420px] flex-col p-3.5 sm:h-[520px] lg:h-[640px]">
          <h3 className="mb-2.5 mt-0">대화 목록</h3>
          <div className="grid gap-2 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="helper-text">아직 저장된 상담이 없습니다.</p>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === conversationId;
                return (
                  <div
                    key={conversation.id}
                    className={`${selected ? 'btn-primary' : 'btn-subtle'} grid grid-cols-[1fr_auto] items-start gap-1.5 px-2 py-1.5 text-left`}
                  >
                    <button
                      onClick={async () => {
                        setConversationId(conversation.id);
                        await loadMessages(conversation.id);
                      }}
                      className="w-full border-none bg-transparent p-0 text-left text-inherit"
                    >
                      <strong className="block">{getConversationLabel(conversation, selected)}</strong>
                      <span className="mt-1 block text-[0.79rem] opacity-90">
                        {formatKoreanDate(conversation.createdAt)}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteConversation(conversation.id)}
                      title="대화 삭제"
                      aria-label="대화 삭제"
                      className="border-none bg-transparent px-1 py-0 font-bold leading-none text-inherit"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </SectionCard>

        <SectionCard className="grid h-[520px] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4 sm:h-[620px] lg:h-[640px]">
          <div className="border-b border-[var(--line)] pb-2">
            <strong>{activeConversation?.title?.trim() || (conversationId ? '상담 진행 중' : '상담 시작 전')}</strong>
            <p className="helper-text mt-1">
              Enter 전송 · Shift+Enter 줄바꿈
            </p>
          </div>

          <div className="overflow-y-auto pr-1">
            {!conversationId ? (
              <div className="grid h-full place-items-center">
                <p className="helper-text">새 상담을 시작하거나 기존 대화를 선택하세요.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="grid h-full place-items-center">
                <p className="helper-text">첫 질문을 입력하면 상담이 시작됩니다.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`grid ${isUser ? 'justify-items-end' : 'justify-items-start'}`}
                    >
                      <div
                        className={`ai-chat-bubble ${isUser ? 'ai-chat-bubble-user' : 'ai-chat-bubble-assistant'}`}
                      >
                        <div className="ai-chat-meta">
                          {isUser ? '나' : 'Mr. Money'}
                        </div>
                        {isUser ? (
                          <div className="whitespace-pre-wrap leading-[1.45]">{msg.content}</div>
                        ) : (
                          <div className="ai-markdown prose prose-sm max-w-none leading-[1.55]">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {loading ? (
                  <div className="grid justify-items-start">
                    <div
                      className="ai-chat-bubble ai-chat-bubble-assistant"
                    >
                      <div className="ai-chat-meta">
                        Mr. Money
                      </div>
                      <div className="helper-text">답변 작성 중...</div>
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="예: 월 잉여자금으로 ETF 포트폴리오를 어떻게 구성하면 좋을까?"
              rows={3}
              disabled={loading || !conversationId}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="helper-text">금융 상담은 정보 제공 목적이며 최종 투자 판단은 본인 책임입니다.</p>
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim() || !conversationId}
                className="btn-primary min-w-[96px]"
              >
                {loading ? '전송 중...' : '전송'}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant="danger"
        onConfirm={onModalConfirm}
        onCancel={onModalCancel}
      />
    </div>
  );
}

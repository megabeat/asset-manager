import { useState, useCallback } from 'react';

export type FeedbackType = 'success' | 'error' | 'info';

export type FeedbackMessage = {
  text: string;
  type: FeedbackType;
} | null;

function toMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  if (error instanceof Error && error.message) return error.message;
  return '알 수 없는 오류';
}

export function useFeedbackMessage() {
  const [feedback, setFeedback] = useState<FeedbackMessage>(null);

  const clearMessage = useCallback(() => setFeedback(null), []);

  const setMessageText = useCallback((text: string) => setFeedback({ text, type: 'info' }), []);

  const setSuccessMessage = useCallback((text: string) => setFeedback({ text, type: 'success' }), []);

  const setErrorMessage = useCallback((prefix: string, error: unknown) => {
    setFeedback({ text: `${prefix}: ${toMessage(error)}`, type: 'error' });
  }, []);

  // backward compat: expose message as string | null for pages that read .message
  const message = feedback?.text ?? null;

  return {
    message,
    feedback,
    clearMessage,
    setMessageText,
    setSuccessMessage,
    setErrorMessage,
  };
}

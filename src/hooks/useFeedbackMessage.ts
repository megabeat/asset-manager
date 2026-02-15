import { useState } from 'react';

function toMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '알 수 없는 오류';
}

export function useFeedbackMessage() {
  const [message, setMessage] = useState<string | null>(null);

  const clearMessage = () => setMessage(null);

  const setMessageText = (text: string) => setMessage(text);

  const setSuccessMessage = (text: string) => setMessage(text);

  const setErrorMessage = (prefix: string, error: unknown) => {
    setMessage(`${prefix}: ${toMessage(error)}`);
  };

  return {
    message,
    clearMessage,
    setMessageText,
    setSuccessMessage,
    setErrorMessage,
  };
}

import type { FeedbackMessage } from '@/hooks/useFeedbackMessage';

const STYLE_MAP = {
  success: 'feedback-banner feedback-success',
  error: 'feedback-banner feedback-error',
  info: 'feedback-banner feedback-info',
};

export function FeedbackBanner({ feedback }: { feedback: FeedbackMessage }) {
  if (!feedback) return null;

  return (
    <div className={STYLE_MAP[feedback.type]} role={feedback.type === 'error' ? 'alert' : 'status'}>
      <span className="feedback-icon">
        {feedback.type === 'success' && '✓'}
        {feedback.type === 'error' && '✕'}
        {feedback.type === 'info' && 'ℹ'}
      </span>
      <span>{feedback.text}</span>
    </div>
  );
}

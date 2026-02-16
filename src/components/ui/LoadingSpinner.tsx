export function LoadingSpinner({ text = '로딩 중...' }: { text?: string }) {
  return (
    <div className="loading-wrap">
      <div className="loading-spinner" />
      <p className="loading-text">{text}</p>
    </div>
  );
}

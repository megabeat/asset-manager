export function AppLogo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="1.5" y="1.5" width="27" height="27" rx="8" fill="var(--surface)" stroke="var(--line)" />
        <path
          d="M7 18.2L12 13.3L15.4 16.7L21 11"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="21" cy="11" r="1.8" fill="var(--brand)" />
        <rect x="7" y="20.8" width="16" height="1.8" rx="0.9" fill="var(--line)" />
      </svg>
      <span className="font-extrabold tracking-[-0.01em]">자산관리</span>
    </span>
  );
}

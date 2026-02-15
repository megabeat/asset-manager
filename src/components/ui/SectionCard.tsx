import { CSSProperties, ReactNode } from 'react';

type SectionCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SectionCard({ children, className, style }: SectionCardProps) {
  return (
    <section
      className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-shadow duration-200 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]${className ? ` ${className}` : ''}`}
      style={style}
    >
      {children}
    </section>
  );
}

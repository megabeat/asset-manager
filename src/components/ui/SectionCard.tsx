import { CSSProperties, ReactNode } from 'react';

type SectionCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SectionCard({ children, className, style }: SectionCardProps) {
  return (
    <section className={`section-card${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </section>
  );
}

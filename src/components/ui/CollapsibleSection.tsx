'use client';

import { forwardRef, ReactNode } from 'react';
import { SectionCard } from './SectionCard';

type CollapsibleSectionProps = {
  open: boolean;
  onToggle: () => void;
  title: string;
  editTitle?: string;
  isEditing?: boolean;
  className?: string;
  children: ReactNode;
};

export const CollapsibleSection = forwardRef<HTMLElement, CollapsibleSectionProps>(
  function CollapsibleSection({ open, onToggle, title, editTitle, isEditing, className, children }, ref) {
    return (
      <SectionCard className={className} ref={ref}>
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between bg-transparent border-0 cursor-pointer p-0 text-left"
        >
          <h3 className="m-0 text-base font-semibold">
            {isEditing && editTitle ? editTitle : title}
          </h3>
          <span
            className={`text-[var(--color-text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </button>

        {open && <div className="mt-3">{children}</div>}
      </SectionCard>
    );
  }
);

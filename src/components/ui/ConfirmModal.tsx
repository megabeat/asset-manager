'use client';

import { useCallback, useEffect, useRef } from 'react';

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title = '확인',
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      confirmButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    },
    [onCancel]
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) {
        onCancel();
      }
    },
    [onCancel]
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto rounded-xl border border-[var(--line)] bg-[var(--bg)] p-0 shadow-xl backdrop:bg-black/40"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <div className="w-[min(90vw,400px)] p-6">
        <h3 className="m-0 mb-2 text-base font-semibold">{title}</h3>
        <p className="m-0 mb-5 whitespace-pre-line text-sm text-[var(--fg-muted)]">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg-hover)]"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={
              variant === 'danger'
                ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
                : 'btn-primary px-4 py-2 text-sm'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

import { useState, useCallback } from 'react';

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  resolve: ((value: boolean) => void) | null;
};

const defaultState: ConfirmState = {
  open: false,
  title: '확인',
  message: '',
  confirmLabel: '확인',
  resolve: null
};

export function useConfirmModal() {
  const [confirmState, setConfirmState] = useState<ConfirmState>(defaultState);

  const confirm = useCallback(
    (message: string, options?: { title?: string; confirmLabel?: string }): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmState({
          open: true,
          title: options?.title ?? '확인',
          message,
          confirmLabel: options?.confirmLabel ?? '확인',
          resolve
        });
      });
    },
    []
  );

  const onConfirm = useCallback(() => {
    confirmState.resolve?.(true);
    setConfirmState(defaultState);
  }, [confirmState]);

  const onCancel = useCallback(() => {
    confirmState.resolve?.(false);
    setConfirmState(defaultState);
  }, [confirmState]);

  return { confirmState, confirm, onConfirm, onCancel };
}

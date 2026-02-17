import { useState, useEffect, useCallback } from 'react';
import { getCurrentMonthKey } from '@/lib/dateUtils';

type SettleSummary = {
  targetMonth: string;
  createdCount: number;
  skippedCount: number;
  reflectedCount: number;
  totalSettledAmount: number;
};

type RollbackSummary = {
  targetMonth: string;
  deletedCount: number;
  reversedAmount: number;
};

type ApiResult<T> = { data?: T | null; error?: unknown };

export interface UseSettlementOptions {
  /** 정산 상태 확인 API */
  checkSettled: (month: string) => Promise<ApiResult<{ targetMonth: string; settled: boolean }>>;
  /** 정산 실행 API */
  settle: (month: string) => Promise<ApiResult<SettleSummary>>;
  /** 정산 취소(롤백) API */
  rollback: (month: string) => Promise<ApiResult<RollbackSummary>>;
  /** 정산 후 데이터 새로고침 */
  reload: () => Promise<void>;
  /** 정산 취소 확인 다이얼로그 표시 */
  confirm: (message: string, options: { title: string; confirmLabel: string }) => Promise<boolean>;
  /** 롤백 확인 메시지에 들어갈 엔티티 설명 (예: "지출", "수입") */
  entityLabel: string;
  /** 안내 문구 (미정산 상태일 때 표시) */
  guideText: string;
  /** 메시지 콜백들 */
  clearMessage: () => void;
  setMessageText: (text: string) => void;
  setSuccessMessage: (text: string) => void;
  setErrorMessage: (prefix: string, error: unknown) => void;
  /** useEffect 의존성 배열에 전달할 항목 목록 (정산 상태 재확인 트리거) */
  deps: unknown[];
}

export function useSettlement(options: UseSettlementOptions) {
  const {
    checkSettled, settle, rollback, reload, confirm,
    entityLabel, guideText,
    clearMessage, setMessageText, setSuccessMessage, setErrorMessage,
    deps,
  } = options;

  const [settling, setSettling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [isMonthSettled, setIsMonthSettled] = useState(false);
  const [settlementMonth, setSettlementMonth] = useState(getCurrentMonthKey());

  const checkSettledStatus = useCallback(async (month: string) => {
    const result = await checkSettled(month);
    setIsMonthSettled(result.data?.settled ?? false);
  }, [checkSettled]);

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(settlementMonth)) {
      checkSettledStatus(settlementMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementMonth, ...deps]);

  const onSettleMonth = useCallback(async () => {
    clearMessage();
    if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
      setMessageText('정산월 형식이 올바르지 않습니다. (YYYY-MM)');
      return;
    }

    if (isMonthSettled) {
      setMessageText('이미 정산이 완료된 월입니다. 재정산하려면 먼저 정산 취소를 해주세요.');
      return;
    }

    setSettling(true);
    const result = await settle(settlementMonth);

    if (result.error) {
      setErrorMessage('월마감 자동 반영 실패', result.error);
      setSettling(false);
      return;
    }

    const summary = result.data;
    setSuccessMessage(
      `${summary?.targetMonth ?? settlementMonth} 자동반영 완료: 생성 ${summary?.createdCount ?? 0}건, 중복건너뜀 ${summary?.skippedCount ?? 0}건, 총 ${Math.round(summary?.totalSettledAmount ?? 0).toLocaleString()}원`
    );
    await reload();
    setSettling(false);
  }, [settlementMonth, isMonthSettled, settle, reload, clearMessage, setMessageText, setSuccessMessage, setErrorMessage]);

  const onRollbackMonth = useCallback(async () => {
    clearMessage();
    if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
      setMessageText('정산월 형식이 올바르지 않습니다. (YYYY-MM)');
      return;
    }

    const yes = await confirm(
      `${settlementMonth} 정산을 취소하시겠습니까?\n자동 생성된 ${entityLabel} 내역이 삭제되고 자산이 복원됩니다.`,
      { title: '정산 취소', confirmLabel: '정산 취소' }
    );
    if (!yes) return;

    setRollingBack(true);
    const result = await rollback(settlementMonth);

    if (result.error) {
      setErrorMessage('정산 취소 실패', result.error);
      setRollingBack(false);
      return;
    }

    const summary = result.data;
    setSuccessMessage(
      `${summary?.targetMonth ?? settlementMonth} 정산 취소 완료: 삭제 ${summary?.deletedCount ?? 0}건, 복원금액 ${Math.round(summary?.reversedAmount ?? 0).toLocaleString()}원`
    );
    await reload();
    setRollingBack(false);
  }, [settlementMonth, rollback, reload, confirm, entityLabel, clearMessage, setMessageText, setSuccessMessage, setErrorMessage]);

  return {
    settling,
    rollingBack,
    isMonthSettled,
    settlementMonth,
    setSettlementMonth,
    onSettleMonth,
    onRollbackMonth,
    guideText,
  };
}

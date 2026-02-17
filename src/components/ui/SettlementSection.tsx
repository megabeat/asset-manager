'use client';

import { SectionCard } from './SectionCard';
import { FormField } from './FormField';

interface SettlementSectionProps {
  settling: boolean;
  rollingBack: boolean;
  isMonthSettled: boolean;
  settlementMonth: string;
  setSettlementMonth: (value: string) => void;
  onSettleMonth: () => void;
  onRollbackMonth: () => void;
  guideText: string;
}

export default function SettlementSection({
  settling,
  rollingBack,
  isMonthSettled,
  settlementMonth,
  setSettlementMonth,
  onSettleMonth,
  onRollbackMonth,
  guideText,
}: SettlementSectionProps) {
  return (
    <SectionCard className="mt-5 max-w-[980px]">
      <h3 className="mb-3 mt-0">월마감 정산</h3>
      <div className="form-grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <FormField label="정산월">
          <input
            type="month"
            value={settlementMonth}
            onChange={(event) => setSettlementMonth(event.target.value)}
          />
        </FormField>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="btn-primary w-[180px]"
            onClick={onSettleMonth}
            disabled={settling || isMonthSettled}
          >
            {settling ? '월마감 반영 중...' : isMonthSettled ? '정산 완료됨' : '월마감 실행'}
          </button>
          {isMonthSettled && (
            <button
              type="button"
              className="btn-danger-outline w-[180px]"
              onClick={onRollbackMonth}
              disabled={rollingBack}
            >
              {rollingBack ? '취소 중...' : '정산 취소'}
            </button>
          )}
        </div>
        <FormField label="안내" fullWidth>
          <input
            value={isMonthSettled
              ? `${settlementMonth} 정산이 이미 완료되었습니다. 재정산하려면 정산 취소 후 다시 실행하세요.`
              : guideText}
            readOnly
          />
        </FormField>
      </div>
    </SectionCard>
  );
}

export const ASSET_CATEGORY_LABELS: Record<string, string> = {
  cash: '현금',
  deposit: '예금',
  stock: '주식',
  stock_kr: '국내주식',
  stock_us: '미국주식',
  real_estate: '부동산',
  realestate: '부동산',
  realestate_kr: '국내부동산',
  realestate_us: '해외부동산',
  etc: '기타',
  pension: '연금',
  pension_national: '국민연금',
  pension_personal: '개인연금',
  pension_retirement: '퇴직연금(IPA)'
};

export function getAssetCategoryLabel(category?: string): string {
  if (!category) {
    return '기타';
  }

  const normalized = String(category).trim().toLowerCase();
  return ASSET_CATEGORY_LABELS[normalized] ?? '기타';
}

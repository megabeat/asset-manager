/**
 * 큰 숫자를 억/만 단위로 compact하게 표현.
 * 예: 523450000 → "5억 2,345만"
 *     3200000  → "320만"
 *     850000   → "85만"
 *     9500     → "9,500"  (만원 미만은 그대로)
 *
 * suffix를 붙이면: formatCompact(523450000, '원') → "5억 2,345만원"
 */
export function formatCompact(value: number | null | undefined, suffix = '원'): string {
  if (value == null) return `-${suffix}`;

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_0000_0000) {
    // 억 단위
    const eok = Math.floor(abs / 1_0000_0000);
    const remainder = Math.round((abs % 1_0000_0000) / 1_0000);
    if (remainder > 0) {
      return `${sign}${eok}억 ${remainder.toLocaleString()}만${suffix}`;
    }
    return `${sign}${eok}억${suffix}`;
  }

  if (abs >= 1_0000) {
    // 만 단위
    const man = Math.round(abs / 1_0000);
    return `${sign}${man.toLocaleString()}만${suffix}`;
  }

  // 만원 미만은 그대로
  return `${sign}${Math.round(abs).toLocaleString()}${suffix}`;
}

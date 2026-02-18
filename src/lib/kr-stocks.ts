/**
 * Popular Korean stocks — name → code mapping.
 * Used for autocomplete when user types Korean stock names.
 * Source: KRX top-traded stocks (KOSPI + KOSDAQ).
 */
export type KrStock = { code: string; name: string };

export const krStockList: KrStock[] = [
  // KOSPI 대형주
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '373220', name: 'LG에너지솔루션' },
  { code: '207940', name: '삼성바이오로직스' },
  { code: '005380', name: '현대차' },
  { code: '006400', name: '삼성SDI' },
  { code: '051910', name: 'LG화학' },
  { code: '000270', name: '기아' },
  { code: '035420', name: 'NAVER' },
  { code: '005490', name: 'POSCO홀딩스' },
  { code: '105560', name: 'KB금융' },
  { code: '055550', name: '신한지주' },
  { code: '035720', name: '카카오' },
  { code: '003550', name: 'LG' },
  { code: '066570', name: 'LG전자' },
  { code: '096770', name: 'SK이노베이션' },
  { code: '034730', name: 'SK' },
  { code: '012330', name: '현대모비스' },
  { code: '003670', name: '포스코퓨처엠' },
  { code: '068270', name: '셀트리온' },
  { code: '028260', name: '삼성물산' },
  { code: '259960', name: '크래프톤' },
  { code: '323410', name: '카카오뱅크' },
  { code: '086790', name: '하나금융지주' },
  { code: '316140', name: '우리금융지주' },
  { code: '017670', name: 'SK텔레콤' },
  { code: '030200', name: 'KT' },
  { code: '032830', name: '삼성생명' },
  { code: '010130', name: '고려아연' },
  { code: '009150', name: '삼성전기' },
  { code: '018260', name: '삼성에스디에스' },
  { code: '034020', name: '두산에너빌리티' },
  { code: '011200', name: 'HMM' },
  { code: '000810', name: '삼성화재' },
  { code: '329180', name: '현대중공업' },
  { code: '036570', name: '엔씨소프트' },
  { code: '015760', name: '한국전력' },
  { code: '033780', name: 'KT&G' },
  { code: '010950', name: 'S-Oil' },
  { code: '011170', name: '롯데케미칼' },
  { code: '047050', name: '포스코인터내셔널' },
  { code: '026960', name: '동서' },
  { code: '090430', name: '아모레퍼시픽' },
  { code: '251270', name: '넷마블' },
  { code: '302440', name: 'SK바이오사이언스' },
  { code: '361610', name: 'SK아이이테크놀로지' },
  { code: '352820', name: '하이브' },
  { code: '011790', name: 'SKC' },
  { code: '267250', name: '현대건설' },
  { code: '009240', name: '한샘' },
  // KOSDAQ 주요 종목
  { code: '247540', name: '에코프로비엠' },
  { code: '086520', name: '에코프로' },
  { code: '041510', name: 'SM' },
  { code: '263750', name: '펄어비스' },
  { code: '112040', name: '위메이드' },
  { code: '293490', name: '카카오게임즈' },
  { code: '403870', name: 'HPSP' },
  { code: '196170', name: '알테오젠' },
  { code: '028300', name: 'HLB' },
  { code: '145020', name: '휴젤' },
  { code: '058470', name: '리노공업' },
  { code: '357780', name: '솔브레인' },
  { code: '005935', name: '삼성전자우' },
  { code: '000990', name: 'DB하이텍' },
  { code: '035900', name: 'JYP Ent.' },
  { code: '377300', name: '카카오페이' },
  { code: '036490', name: '한국가스공사' },
  { code: '039490', name: '키움증권' },
  { code: '003490', name: '대한항공' },
  { code: '180640', name: '한진칼' },
  { code: '004020', name: '현대제철' },
  { code: '047810', name: '한국항공우주' },
  { code: '010140', name: '삼성중공업' },
  { code: '009540', name: '한국조선해양' },
  { code: '042700', name: '한미반도체' },
  { code: '241560', name: '두산밥캣' },
  { code: '006800', name: '미래에셋증권' },
  { code: '161390', name: '한국타이어앤테크놀로지' },
  { code: '024110', name: '기업은행' },
  { code: '000100', name: '유한양행' },
  { code: '128940', name: '한미약품' },
  { code: '005387', name: '현대차2우B' },
  { code: '035250', name: '강원랜드' },
  { code: '139480', name: '이마트' },
  { code: '097950', name: 'CJ제일제당' },
  { code: '069500', name: 'KODEX 200' },
  { code: '229200', name: 'KODEX 코스닥150' },
  { code: '305720', name: 'KODEX 2차전지산업' },
  { code: '364690', name: 'KODEX Fn반도체' },
  { code: '461500', name: 'KODEX 미국S&P500TR' },
  { code: '379800', name: 'KODEX 미국나스닥100TR' },
  { code: '133690', name: 'TIGER 미국나스닥100' },
  { code: '360750', name: 'TIGER 미국S&P500' },
  { code: '381180', name: 'TIGER 미국테크TOP10 INDXX' },
  { code: '371460', name: 'TIGER 차이나전기차SOLACTIVE' },
];

/**
 * Search Korean stock list by name (partial match) or code (prefix match).
 * Returns up to `limit` results.
 */
export function searchKrStocks(query: string, limit = 8): KrStock[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // If query looks like a number, match by code prefix
  if (/^\d+$/.test(q)) {
    return krStockList.filter((s) => s.code.startsWith(q)).slice(0, limit);
  }

  // Otherwise match by name (case-insensitive contains)
  return krStockList.filter((s) => s.name.toLowerCase().includes(q)).slice(0, limit);
}

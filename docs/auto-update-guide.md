# 자산 자동 시세 업데이트 가이드

## 설정 방법

### 1. 자산 등록 시 필드 포함
미국 주식을 자동 업데이트하려면 다음 필드를 포함해서 자산을 등록:

```json
{
  "category": "investment",
  "name": "Apple Inc.",
  "currentValue": 15000000,
  "symbol": "AAPL",
  "exchange": "NASDAQ",
  "priceSource": "stooq",
  "autoUpdate": true,
  "quantity": 100
}
```

### 2. 지원 거래소
- `NASDAQ`
- `NYSE`

### 3. 자동 업데이트 시간
- 매일 **07:00 KST** (UTC 22:00)
- 전날 종가 기준으로 업데이트

### 4. 업데이트 대상
- `autoUpdate: true`
- `priceSource: "stooq"`
- `category: "investment"`
- `symbol` 필드 있음

## 한국 주식
한국 주식은 **수동 입력**으로 유지.
- `priceSource`를 비우거나 `autoUpdate: false`로 설정
- 직접 `/api/assets/{assetId}` PUT 요청으로 `currentValue` 갱신

## 히스토리 기록
자동 업데이트 시 `assetHistory`에도 자동 기록됨 (`note: "auto price update"`).

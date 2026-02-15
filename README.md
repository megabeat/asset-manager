# 자산관리 앱 - 프로젝트 개요

Azure 기반 개인 자산관리 SWA(Static Web Apps) 애플리케이션

## 기술 스택

- **프론트엔드**: Next.js 14 (App Router), React 18, TypeScript
- **백엔드**: Azure Functions (Node.js)
- **데이터베이스**: Azure Cosmos DB (NoSQL API)
- **AI**: Azure OpenAI Service
- **배포**: Azure Static Web Apps

## 주요 기능

### 1. 대시보드
- 총 자산/부채/순자산 요약
- 24시간/7일/30일 자산 변동 그래프
- 월 고정지출 요약

### 2. 자산 관리
- 다양한 자산 종류 관리 (현금, 주식, 부동산, 동산 등)
- 자산 변동 히스토리 기록
- 미국 주식 자동 시세 업데이트 (Stooq API)

### 3. 지출 관리
- 고정지출 및 구독료 관리
- 월별 지출 집계

### 4. 교육비 시뮬레이션
- 자녀별 교육비 계획
- 인플레이션 고려 누적 비용 계산

### 5. AI 자산 상담
- Azure OpenAI 기반 맞춤형 재무 조언
- 사용자 실제 데이터 기반 컨텍스트 제공
- 대화 이력 유지

## 프로젝트 구조

```
/home/kevin/myproject/asset/
├── api/                          # Azure Functions
│   ├── shared/                   # 공통 유틸
│   │   ├── auth.ts              # SWA 인증
│   │   ├── cosmosClient.ts      # Cosmos DB 클라이언트
│   │   ├── openai.ts            # Azure OpenAI 클라이언트
│   │   ├── context-builder.ts   # AI 컨텍스트 빌더
│   │   ├── responses.ts         # 응답 헬퍼
│   │   └── validators.ts        # 입력 검증
│   ├── profile/                 # 프로파일 API
│   ├── children/                # 자녀 API
│   ├── assets/                  # 자산 API
│   ├── asset-history/           # 자산 히스토리 API
│   ├── expenses/                # 지출 API
│   ├── liabilities/             # 부채 API
│   ├── incomes/                 # 수입 API
│   ├── education-plans/         # 교육비 API
│   ├── dashboard/               # 대시보드 집계 API
│   ├── ai-conversations/        # AI 상담 세션 API
│   ├── ai-messages/             # AI 메시지 API
│   └── price-updater/           # 자동 시세 업데이트 (타이머)
├── src/                         # Next.js 프론트엔드
│   ├── app/                     # 페이지 (App Router)
│   │   ├── dashboard/
│   │   ├── assets/
│   │   ├── expenses/
│   │   ├── education/
│   │   ├── ai-advisor/
│   │   └── profile/
│   └── lib/
│       └── api.ts               # API 클라이언트
├── scripts/                     # 배포/설정 스크립트
│   ├── setup-cosmos.js          # Cosmos DB 초기화
│   └── package.json
└── docs/                        # 문서
    ├── deployment.md            # 배포 가이드
    ├── openai-setup.md          # OpenAI 설정
    └── auto-update-guide.md     # 자동 시세 업데이트

```

## 빠른 시작

### 1. 로컬 개발

```bash
# 의존성 설치
npm install
cd api && npm install && cd ..

# Cosmos DB Emulator 실행 (별도 터미널)
# https://learn.microsoft.com/azure/cosmos-db/emulator

# Cosmos DB 초기화
cd scripts
npm install
export COSMOS_ENDPOINT="https://localhost:8081/"
export COSMOS_KEY="C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
npm run setup-cosmos
cd ..

# API 실행 (터미널 1)
cd api
npm start

# 프론트엔드 실행 (터미널 2)
npm run dev
```

브라우저에서 http://localhost:3000 접속

### 2. Azure 배포

상세 가이드: [docs/deployment.md](docs/deployment.md)

## 환경 변수

### API (api/local.settings.json)
```json
{
  "Values": {
    "COSMOS_ENDPOINT": "",
    "COSMOS_KEY": "",
    "COSMOS_DATABASE_ID": "AssetManagement",
    "AZURE_OPENAI_ENDPOINT": "",
    "AZURE_OPENAI_API_KEY": "",
    "AZURE_OPENAI_DEPLOYMENT_NAME": "gpt-4"
  }
}
```

### Azure Static Web Apps (Configuration)
프로덕션 배포 시 Azure Portal에서 설정

## API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| /api/profile | GET, POST, PUT | 프로파일 관리 |
| /api/children | GET, POST, PUT, DELETE | 자녀 관리 |
| /api/assets | GET, POST, PUT, DELETE | 자산 관리 |
| /api/assets/{id}/history | GET, POST | 자산 히스토리 |
| /api/expenses | GET, POST, PUT, DELETE | 지출 관리 |
| /api/liabilities | GET, POST, PUT, DELETE | 부채 관리 |
| /api/incomes | GET, POST, PUT, DELETE | 수입 관리 |
| /api/education-plans | GET, POST, PUT, DELETE | 교육비 계획 |
| /api/education-plans/{id}/simulate | POST | 교육비 시뮬레이션 |
| /api/dashboard/summary | GET | 대시보드 요약 |
| /api/dashboard/asset-trend | GET | 자산 변동 그래프 |
| /api/ai/conversations | GET, POST | AI 상담 세션 |
| /api/ai/conversations/{id}/messages | GET, POST | AI 메시지 |

## 데이터 모델

상세 스키마: 기획서 참조

## 라이선스

MIT

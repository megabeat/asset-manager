# Cosmos DB 설정 가이드

## 1. 환경 변수 설정

스크립트 실행 전 다음 환경 변수를 설정하세요:

```bash
export COSMOS_ENDPOINT="https://your-account.documents.azure.com:443/"
export COSMOS_KEY="your-primary-key"
export COSMOS_DATABASE_ID="AssetManagement"
```

Windows (PowerShell):
```powershell
$env:COSMOS_ENDPOINT="https://your-account.documents.azure.com:443/"
$env:COSMOS_KEY="your-primary-key"
$env:COSMOS_DATABASE_ID="AssetManagement"
```

## 2. 스크립트 실행

```bash
cd scripts
npm install
npm run setup-cosmos
```

## 3. 생성되는 컨테이너

| 컨테이너 | 파티션 키 | 설명 |
|---------|----------|------|
| users | /userId | 사용자 프로파일 |
| children | /userId | 자녀 정보 |
| assets | /userId | 자산 목록 |
| assetHistory | [/userId, /assetId] | 자산 변동 이력 (HPK) |
| expenses | /userId | 고정지출/구독료 |
| educationPlans | /userId | 교육비 계획 |
| aiConversations | /userId | AI 상담 세션 |
| aiMessages | [/userId, /conversationId] | AI 메시지 (HPK) |
| liabilities | /userId | 부채 |
| incomes | /userId | 수입 |

## 4. Azure Portal에서 확인

1. Azure Portal → Cosmos DB 계정 선택
2. Data Explorer → 데이터베이스 `AssetManagement` 확인
3. 각 컨테이너의 파티션 키 확인

## 5. 로컬 개발용 Emulator

로컬 개발 시 Cosmos DB Emulator 사용 가능:

```bash
export COSMOS_ENDPOINT="https://localhost:8081/"
export COSMOS_KEY="C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
```

Emulator 다운로드: https://learn.microsoft.com/azure/cosmos-db/emulator

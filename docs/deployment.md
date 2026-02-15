# 배포 가이드

## Azure Static Web Apps 배포

### 1. Azure 리소스 생성

#### Cosmos DB
```bash
# 리소스 그룹 생성
az group create --name asset-mgmt-rg --location koreacentral

# Cosmos DB 계정 생성
az cosmosdb create \
  --name asset-mgmt-cosmos \
  --resource-group asset-mgmt-rg \
  --locations regionName=koreacentral

# 연결 정보 확인
az cosmosdb keys list \
  --name asset-mgmt-cosmos \
  --resource-group asset-mgmt-rg
```

#### Azure OpenAI
```bash
# Azure OpenAI 리소스 생성
az cognitiveservices account create \
  --name asset-mgmt-openai \
  --resource-group asset-mgmt-rg \
  --kind OpenAI \
  --sku S0 \
  --location koreacentral

# 모델 배포 (Portal에서 수행)
```

#### Static Web App
```bash
# SWA 생성
az staticwebapp create \
  --name asset-mgmt-app \
  --resource-group asset-mgmt-rg \
  --location koreacentral
```

### 2. Cosmos DB 초기화

```bash
cd scripts
export COSMOS_ENDPOINT="https://asset-mgmt-cosmos.documents.azure.com:443/"
export COSMOS_KEY="<your-key>"
npm install
npm run setup-cosmos
```

### 3. 환경 변수 설정

Azure Portal → Static Web App → Configuration에서 다음 변수 추가:

```
COSMOS_ENDPOINT=https://asset-mgmt-cosmos.documents.azure.com:443/
COSMOS_KEY=<your-key>
COSMOS_DATABASE_ID=AssetManagement

AZURE_OPENAI_ENDPOINT=https://asset-mgmt-openai.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
```

### 4. GitHub Actions 배포

`.github/workflows/azure-static-web-apps.yml` 파일이 자동 생성됩니다.

프로젝트를 GitHub에 푸시하면 자동 배포됩니다:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 5. 수동 배포 (SWA CLI)

```bash
# SWA CLI 설치
npm install -g @azure/static-web-apps-cli

# 빌드
npm run build

# 배포
swa deploy --deployment-token <your-token>
```

## 로컬 개발 환경

### 1. 환경 변수 설정 (api/local.settings.json)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_ENDPOINT": "https://localhost:8081/",
    "COSMOS_KEY": "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
    "COSMOS_DATABASE_ID": "AssetManagement",
    "AZURE_OPENAI_ENDPOINT": "https://your-resource.openai.azure.com/",
    "AZURE_OPENAI_API_KEY": "your-key",
    "AZURE_OPENAI_DEPLOYMENT_NAME": "gpt-4"
  }
}
```

### 2. Cosmos DB Emulator 실행

Emulator 다운로드 및 실행:
https://learn.microsoft.com/azure/cosmos-db/emulator

### 3. 의존성 설치

```bash
# 프론트엔드
npm install

# API
cd api
npm install
```

### 4. 로컬 실행

터미널 1 (Functions):
```bash
cd api
npm start
```

터미널 2 (Next.js):
```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## 프로덕션 체크리스트

- [ ] Cosmos DB 컨테이너 생성 완료
- [ ] Azure OpenAI 모델 배포 완료
- [ ] SWA 환경 변수 설정 완료
- [ ] GitHub Actions 배포 성공 확인
- [ ] 인증 설정 (SWA Auth) 확인
- [ ] 도메인 연결 (선택)
- [ ] 모니터링 설정 (Application Insights)

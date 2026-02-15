# 빠른 배포 가이드 (현재 상황)

## 현재 상태
✅ Resource Group: `asset-mgmt-rg` 생성 완료
✅ Cosmos DB: `asset-cosmos-1771118571` 생성 완료
❌ Cosmos DB 컨테이너 미생성 (10개)
❌ Azure OpenAI 미생성
❌ Static Web App 미생성

## 빠른 완료 방법 (PowerShell 사용)

### 1. PowerShell 관리자 권한으로 실행

```powershell
# 프로젝트 디렉토리로 이동
cd C:\Users\...\myproject\asset\scripts

# 실행 정책 변경 (한 번만)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 배포 스크립트 실행
.\deploy-azure.ps1
```

**소요 시간:** 약 3-5분

### 2. 또는 Azure Portal에서 수동 설정

#### A. Cosmos DB 컨테이너 생성
```powershell
cd scripts
npm install
$env:COSMOS_ENDPOINT="https://asset-cosmos-1771118571.documents.azure.com:443/"
$env:COSMOS_KEY=(az cosmosdb keys list --name asset-cosmos-1771118571 --resource-group asset-mgmt-rg --query primaryMasterKey --output tsv)
$env:COSMOS_DATABASE_ID="AssetManagement"
node setup-cosmos.js
```

#### B. Static Web App 생성 (Portal)
1. https://portal.azure.com
2. Create → Static Web App
3. 설정:
   - Resource Group: `asset-mgmt-rg`
   - Name: `asset-manager`
   - GitHub: megabeat/asset-manager (main)
   - Build: App=`/`, API=`api`, Output=`.next`

#### C. 환경 변수 설정 (Portal)
Static Web App → Configuration → Application settings:
```
COSMOS_ENDPOINT=https://asset-cosmos-1771118571.documents.azure.com:443/
COSMOS_KEY=(Portal에서 복사)
COSMOS_DATABASE_ID=AssetManagement
AZURE_OPENAI_ENDPOINT=(OpenAI 생성 후)
AZURE_OPENAI_API_KEY=(OpenAI 생성 후)
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
```

## 추천 방법

**PowerShell 스크립트 사용 (가장 빠름)**
```powershell
cd C:\Users\kevin\myproject\asset\scripts
.\deploy-azure.ps1
```

실행 후 GitHub Actions에서 자동 배포 확인:
https://github.com/megabeat/asset-manager/actions

## 문제 해결

### Cosmos DB 키 확인
```bash
az cosmosdb keys list \
  --name asset-cosmos-1771118571 \
  --resource-group asset-mgmt-rg \
  --query primaryMasterKey
```

### 구독 확인/변경
```bash
az account list --output table
az account set --subscription 787cd3d1-4bc4-4e33-bc00-93ff4c46169f
```

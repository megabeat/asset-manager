# PowerShell 배포 스크립트
# 사용법: PowerShell에서 실행

$SUBSCRIPTION_ID = "787cd3d1-4bc4-4e33-bc00-93ff4c46169f"
$RESOURCE_GROUP = "asset-mgmt-rg"
$COSMOS_ACCOUNT = "asset-cosmos-1771118571"
$DATABASE_NAME = "AssetManagement"
$GITHUB_REPO = "megabeat/asset-manager"

# GitHub Token은 환경 변수에서 가져오기
if (-not $env:GITHUB_TOKEN) {
    Write-Host "GITHUB_TOKEN 환경 변수가 설정되지 않았습니다."
    Write-Host "https://github.com/settings/tokens 에서 생성 후:"
    Write-Host '$env:GITHUB_TOKEN="your_token_here"'
    exit 1
}
$GITHUB_TOKEN = $env:GITHUB_TOKEN

Write-Host "======================================"
Write-Host "Azure 자산관리 앱 배포 (PowerShell)"
Write-Host "======================================"
Write-Host ""

# 1. 구독 설정
Write-Host "[1/5] Azure 구독 설정..."
az account set --subscription $SUBSCRIPTION_ID

# 2. Cosmos DB 컨테이너 초기화
Write-Host ""
Write-Host "[2/5] Cosmos DB 컨테이너 생성..."
$COSMOS_ENDPOINT = "https://$COSMOS_ACCOUNT.documents.azure.com:443/"
$COSMOS_KEY = az cosmosdb keys list --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --query primaryMasterKey --output tsv

$env:COSMOS_ENDPOINT = $COSMOS_ENDPOINT
$env:COSMOS_KEY = $COSMOS_KEY
$env:COSMOS_DATABASE_ID = $DATABASE_NAME

Set-Location scripts
npm install
node setup-cosmos.js
Set-Location ..

Write-Host "✓ Cosmos DB 초기화 완료"

# 3. Azure OpenAI 생성
Write-Host ""
Write-Host "[3/5] Azure OpenAI 생성..."
$OPENAI_ACCOUNT = "asset-openai-$(Get-Date -Format 'yyyyMMddHHmmss')"

az cognitiveservices account create `
  --name $OPENAI_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --kind OpenAI `
  --sku S0 `
  --location koreacentral `
  --custom-domain $OPENAI_ACCOUNT `
  --yes

if ($LASTEXITCODE -eq 0) {
    $OPENAI_ENDPOINT = "https://$OPENAI_ACCOUNT.openai.azure.com/"
    $OPENAI_KEY = az cognitiveservices account keys list --name $OPENAI_ACCOUNT --resource-group $RESOURCE_GROUP --query key1 --output tsv
    Write-Host "✓ OpenAI 생성 완료"
} else {
    Write-Host "⚠ OpenAI 생성 실패 (나중에 Portal에서 수동 생성)"
    $OPENAI_ENDPOINT = ""
    $OPENAI_KEY = ""
}

# 4. Static Web App 생성
Write-Host ""
Write-Host "[4/5] Static Web App 생성..."
$SWA_NAME = "asset-manager-$(Get-Date -Format 'yyyyMMddHHmmss')"

az staticwebapp create `
  --name $SWA_NAME `
  --resource-group $RESOURCE_GROUP `
  --source "https://github.com/$GITHUB_REPO" `
  --branch main `
  --app-location "/" `
  --api-location "api" `
  --output-location ".next" `
  --login-with-github `
  --token $GITHUB_TOKEN

Write-Host "✓ Static Web App 생성 완료"

# 5. 환경 변수 설정
Write-Host ""
Write-Host "[5/5] 환경 변수 설정..."

az staticwebapp appsettings set `
  --name $SWA_NAME `
  --resource-group $RESOURCE_GROUP `
  --setting-names `
    COSMOS_ENDPOINT=$COSMOS_ENDPOINT `
    COSMOS_KEY=$COSMOS_KEY `
    COSMOS_DATABASE_ID=$DATABASE_NAME `
    AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT `
    AZURE_OPENAI_API_KEY=$OPENAI_KEY `
    AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

Write-Host "✓ 환경 변수 설정 완료"

# 결과
Write-Host ""
Write-Host "======================================"
Write-Host "✓ 배포 완료!"
Write-Host "======================================"
Write-Host ""

$SWA_URL = az staticwebapp show --name $SWA_NAME --resource-group $RESOURCE_GROUP --query defaultHostname --output tsv

Write-Host "앱 URL: https://$SWA_URL"
Write-Host ""
Write-Host "⚠ OpenAI 모델 배포는 Azure Portal에서 수동 진행:"
Write-Host "1. Portal → $OPENAI_ACCOUNT"
Write-Host "2. Model deployments → Create → gpt-4"
Write-Host ""
Write-Host "GitHub Actions: https://github.com/$GITHUB_REPO/actions"

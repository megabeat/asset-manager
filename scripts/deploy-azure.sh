#!/bin/bash

# Azure Static Web Apps 자동 배포 스크립트
# 사용법: ./deploy-azure.sh

set -e

echo "======================================"
echo "Azure 자산관리 앱 자동 배포"
echo "======================================"
echo ""

# 변수 설정
RESOURCE_GROUP="asset-mgmt-rg"
LOCATION="koreacentral"
SWA_NAME="asset-manager-$(date +%s)"
COSMOS_ACCOUNT="asset-cosmos-$(date +%s)"
OPENAI_ACCOUNT="asset-openai-$(date +%s)"
DATABASE_NAME="AssetManagement"

# GitHub 정보
GITHUB_REPO_URL="https://github.com/megabeat/asset-manager"
GITHUB_BRANCH="main"

echo "설정:"
echo "- Resource Group: $RESOURCE_GROUP"
echo "- Location: $LOCATION"
echo "- SWA Name: $SWA_NAME"
echo "- Cosmos DB: $COSMOS_ACCOUNT"
echo "- OpenAI: $OPENAI_ACCOUNT"
echo ""

read -p "계속하시겠습니까? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "취소됨"
    exit 1
fi

# 1. Azure 로그인 확인
echo ""
echo "[1/7] Azure 로그인 확인..."
az account show > /dev/null 2>&1 || az login

# 2. Resource Group 생성
echo ""
echo "[2/7] Resource Group 생성..."
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION \
  --output table

# 3. Cosmos DB 생성
echo ""
echo "[3/7] Cosmos DB 생성 (5-10분 소요)..."
az cosmosdb create \
  --name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --locations regionName=$LOCATION \
  --default-consistency-level Session \
  --enable-free-tier false \
  --output table

# Cosmos DB 키 가져오기
echo "Cosmos DB 키 가져오는 중..."
COSMOS_ENDPOINT="https://${COSMOS_ACCOUNT}.documents.azure.com:443/"
COSMOS_KEY=$(az cosmosdb keys list \
  --name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query primaryMasterKey \
  --output tsv)

echo "✓ Cosmos DB 생성 완료"

# 4. Cosmos DB 초기화
echo ""
echo "[4/7] Cosmos DB 컨테이너 생성..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
npm install --silent
COSMOS_ENDPOINT=$COSMOS_ENDPOINT COSMOS_KEY=$COSMOS_KEY COSMOS_DATABASE_ID=$DATABASE_NAME node setup-cosmos.js
echo "✓ Cosmos DB 초기화 완료"

# 5. Azure OpenAI 생성
echo ""
echo "[5/7] Azure OpenAI 생성..."
az cognitiveservices account create \
  --name $OPENAI_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --kind OpenAI \
  --sku S0 \
  --location koreacentral \
  --custom-domain $OPENAI_ACCOUNT \
  --output table || echo "⚠ OpenAI 생성 실패 (수동 생성 필요)"

OPENAI_ENDPOINT="https://${OPENAI_ACCOUNT}.openai.azure.com/"
OPENAI_KEY=$(az cognitiveservices account keys list \
  --name $OPENAI_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query key1 \
  --output tsv 2>/dev/null || echo "")

if [ -z "$OPENAI_KEY" ]; then
  echo "⚠ OpenAI 키 가져오기 실패 (나중에 수동 설정)"
  OPENAI_ENDPOINT=""
  OPENAI_KEY=""
fi

# 6. Static Web App 생성
echo ""
echo "[6/7] Static Web App 생성..."

# GitHub 토큰 확인
if [ -z "$GITHUB_TOKEN" ]; then
  echo "⚠ GITHUB_TOKEN 환경 변수가 설정되지 않았습니다."
  echo "GitHub Personal Access Token을 입력하세요 (repo 권한 필요):"
  echo "생성: https://github.com/settings/tokens"
  read -s GITHUB_TOKEN
  echo ""
fi

az staticwebapp create \
  --name $SWA_NAME \
  --resource-group $RESOURCE_GROUP \
  --source $GITHUB_REPO_URL \
  --branch $GITHUB_BRANCH \
  --app-location "/" \
  --api-location "api" \
  --output-location ".next" \
  --login-with-github \
  --token $GITHUB_TOKEN \
  --output table

echo "✓ Static Web App 생성 완료"

# 7. 환경 변수 설정
echo ""
echo "[7/7] 환경 변수 설정..."

az staticwebapp appsettings set \
  --name $SWA_NAME \
  --resource-group $RESOURCE_GROUP \
  --setting-names \
    COSMOS_ENDPOINT=$COSMOS_ENDPOINT \
    COSMOS_KEY=$COSMOS_KEY \
    COSMOS_DATABASE_ID=$DATABASE_NAME \
    AZURE_OPENAI_ENDPOINT=$OPENAI_ENDPOINT \
    AZURE_OPENAI_API_KEY=$OPENAI_KEY \
    AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4 \
  --output table

echo "✓ 환경 변수 설정 완료"

# 결과 출력
echo ""
echo "======================================"
echo "✓ 배포 완료!"
echo "======================================"
echo ""
echo "리소스 정보:"
echo "- Resource Group: $RESOURCE_GROUP"
echo "- Static Web App: $SWA_NAME"
echo "- Cosmos DB: $COSMOS_ACCOUNT"
echo "- OpenAI: $OPENAI_ACCOUNT"
echo ""

SWA_URL=$(az staticwebapp show \
  --name $SWA_NAME \
  --resource-group $RESOURCE_GROUP \
  --query defaultHostname \
  --output tsv)

echo "앱 URL: https://${SWA_URL}"
echo ""
echo "⚠ OpenAI 모델 배포는 Azure Portal에서 수동으로 진행해주세요:"
echo "1. Azure Portal → $OPENAI_ACCOUNT"
echo "2. Model deployments → Create → gpt-4"
echo ""
echo "GitHub Actions에서 배포가 자동으로 시작됩니다."
echo "확인: https://github.com/megabeat/asset-manager/actions"

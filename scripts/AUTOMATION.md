# 자동화 배포 가이드

## Azure CLI를 통한 완전 자동화

### 준비 사항

1. **Azure CLI 설치**
```bash
# Linux/WSL
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# macOS
brew install azure-cli

# Windows
# https://aka.ms/installazurecliwindows
```

2. **GitHub Personal Access Token 생성**
- https://github.com/settings/tokens/new
- Scope: `repo` (전체 저장소 액세스)
- 토큰 복사해두기

### 자동 배포 실행

```bash
cd /home/kevin/myproject/asset/scripts

# GitHub 토큰 설정 (선택사항, 실행 시 입력도 가능)
export GITHUB_TOKEN="your_github_token"

# 스크립트 실행
./deploy-azure.sh
```

**스크립트가 자동으로 수행하는 작업:**
1. ✅ Azure 로그인 확인
2. ✅ Resource Group 생성
3. ✅ Cosmos DB 생성 (5-10분)
4. ✅ Cosmos DB 컨테이너 초기화 (10개)
5. ✅ Azure OpenAI 리소스 생성
6. ✅ Static Web App 생성 + GitHub 연동
7. ✅ 환경 변수 자동 설정

### 수동 작업 (마지막 1단계만)

**Azure OpenAI 모델 배포** (Portal에서):
1. Azure Portal → 생성된 OpenAI 리소스
2. Model deployments → Create
3. Model: `gpt-4` (또는 `gpt-35-turbo`)
4. Deployment name: `gpt-4`

### 배포 확인

```bash
# Static Web App URL 확인
az staticwebapp show \
  --name <생성된-이름> \
  --resource-group asset-mgmt-rg \
  --query defaultHostname \
  --output tsv
```

GitHub Actions에서 자동 빌드/배포 진행:
https://github.com/megabeat/asset-manager/actions

---

## Terraform을 통한 자동화 (고급)

완전 자동화를 원하면 Terraform 사용:

```hcl
# terraform/main.tf
resource "azurerm_static_site" "main" {
  name                = "asset-manager"
  resource_group_name = azurerm_resource_group.main.name
  location           = "Korea Central"
  
  app_settings = {
    COSMOS_ENDPOINT = azurerm_cosmosdb_account.main.endpoint
    COSMOS_KEY     = azurerm_cosmosdb_account.main.primary_key
    # ...
  }
}
```

실행:
```bash
terraform init
terraform plan
terraform apply
```

---

## 비용 최적화

자동 생성된 리소스는 Free Tier 사용:
- Static Web Apps: Free
- Cosmos DB: 프로비저닝 최소 (400 RU/s)
- OpenAI: Pay-as-you-go

**예상 월 비용**: ~$25-50 (Cosmos DB 대부분)

### 비용 절감 옵션
```bash
# Cosmos DB Serverless 모드로 변경
az cosmosdb create \
  --name asset-cosmos \
  --resource-group asset-mgmt-rg \
  --capabilities EnableServerless
```

---

## 리소스 정리

모든 리소스 삭제:
```bash
az group delete --name asset-mgmt-rg --yes --no-wait
```

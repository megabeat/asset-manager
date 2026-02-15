# GitHub 및 Azure 배포 가이드

## 현재 상태
✅ Git 저장소 초기화 완료
✅ 초기 커밋 완료 (55개 파일)
✅ 원격 저장소 추가 완료
✅ GitHub에 푸시 완료  
✅ Azure Static Web Apps 생성 (WaitingForDeployment)
✅ Cosmos DB 초기화 완료 (모든 컨테이너 생성됨)

## 다음 단계

### 1. GitHub에 저장소 생성

1. https://github.com/new 접속
2. Repository name: `asset-manager`
3. Public 또는 Private 선택
4. **"Initialize this repository with"** 옵션은 **모두 체크 해제**
5. Create repository 클릭

### 2. GitHub에 푸시

터미널에서 다음 명령어 실행:

```bash
cd /home/kevin/myproject/asset
git push -u origin main
```

GitHub 인증 요청 시:
- Username: megabeat
- Password: Personal Access Token (PAT) 사용
  - 생성: https://github.com/settings/tokens
  - Scope: `repo` 권한 필요

### 3. Azure Static Web Apps 생성

#### Azure Portal에서:

1. Azure Portal (https://portal.azure.com) 접속
2. "Static Web Apps" 검색 → Create
3. 기본 정보:
   - Resource group: 새로 생성 또는 기존 선택
   - Name: `asset-manager`
   - Region: Korea Central
4. GitHub 연결:
   - Sign in to GitHub
   - Organization: megabeat
   - Repository: asset-manager
   - Branch: main
5. Build Details:
   - Build Presets: Custom
   - App location: `/`
   - Api location: `api`
   - Output location: `.next`
6. Review + Create → Create

**중요**: Azure가 자동으로 GitHub Actions 워크플로우를 업데이트하고 `AZURE_STATIC_WEB_APPS_API_TOKEN` 시크릿을 추가합니다.

### 4. 환경 변수 설정

Azure Portal → Static Web App → Configuration → Application settings:

```
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-primary-key
COSMOS_DATABASE_ID=AssetManagement
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
```

### 5. Cosmos DB 초기화

```bash
cd scripts
export COSMOS_ENDPOINT="https://your-account.documents.azure.com:443/"
export COSMOS_KEY="your-primary-key"
npm install
npm run setup-cosmos
```

### 6. 배포 확인

1. GitHub → Actions 탭에서 워크플로우 실행 확인
2. Azure Portal → Static Web App → Browse로 앱 접속

## 트러블슈팅

### 배포는 성공했는데 화면이 예전 상태일 때 (중요)

`코드는 최신인데 UI가 안 바뀌는` 대부분의 원인은 **다른 Static Web App으로 배포**되고 있는 경우입니다.

아래를 반드시 같은 대상으로 맞추세요.

1. **GitHub Actions 시크릿**
   - 이름: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - 값: 지금 실제로 접속 중인 SWA 리소스의 Deployment Token

2. **접속 URL 확인**
   - 브라우저에서 보는 URL이 위 토큰의 SWA URL과 동일해야 함

3. **워크플로우 확인**
   - `.github/workflows/azure-static-web-apps-*.yml`에서
   - `azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}` 사용 중인지 확인

4. **검증 방법**
   - `main`에 커밋 푸시 후 배포 완료 대기
   - `Ctrl+Shift+R` 강력 새로고침
   - 메뉴/페이지(` /pensions ` 등) 반영 확인

### Git 푸시 인증 실패
```bash
# SSH 키 사용 (권장)
git remote set-url origin git@github.com:megabeat/asset-manager.git
```

### GitHub Actions 실패
- Azure Portal에서 deployment token 확인
- GitHub Secrets에 `AZURE_STATIC_WEB_APPS_API_TOKEN` 있는지 확인

### 빌드 실패
- package.json 의존성 확인
- Azure Functions runtime 버전 확인 (Node 18)

## 유용한 명령어

```bash
# 현재 상태 확인
git status

# 로그 확인
git log --oneline

# 원격 저장소 확인
git remote -v

# 강제 푸시 (주의: 기존 내용 덮어씀)
git push -f origin main
```

## 배포 요약

### 완료된 작업
1. ✅ GitHub 저장소 생성 및 푸시
2. ✅ Azure Static Web Apps 자동 생성 (GitHub Actions 설정 완료)
3. ✅ Cosmos DB 초기화 (모든 컨테이너 생성)

### 리소스 정보
- **Static Web App**: asset-manager-1771119196
- **Cosmos DB**: asset-cosmos-1771118151
- **Region**: Korea Central
- **Resource Group**: asset-mgmt-rg

### 필수 환경 변수 설정 (Azure Portal)
Static Web App → Configuration → Application settings에 다음을 추가하세요:

```
COSMOS_ENDPOINT=https://asset-cosmos-1771118151.documents.azure.com:443/
COSMOS_KEY=your-primary-key
COSMOS_DATABASE_ID=AssetManagement
```

### 다음 단계
1. Azure Portal에서 Static Web App의 환경 변수 설정 완료 대기
2. 배포 완료 후 앱 URL에서 정상 작동 확인
3. (선택) Azure OpenAI 사용 시 AZURE_OPENAI_* 환경 변수 추가
git push -f origin main
```

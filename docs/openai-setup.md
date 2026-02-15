# Azure OpenAI 연동 설정 가이드

## 필수 환경 변수

AI 상담 기능을 사용하려면 다음 환경 변수를 설정해야 합니다:

```bash
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
```

## Azure OpenAI 리소스 생성

1. Azure Portal에서 Azure OpenAI 리소스 생성
2. 모델 배포 (예: GPT-4, GPT-3.5-turbo)
3. 키 및 엔드포인트 확인

## AI 상담 기능

### 제공되는 컨텍스트
- 총 자산/부채/순자산
- 월 수입/지출
- 자산 구성 (카테고리별)
- 주요 지출 항목 (상위 5개)
- 최근 대화 이력 (최대 10개)

### 사용 예시
```bash
POST /api/ai/conversations/{conversationId}/messages
{
  "message": "내 자산 구성에서 개선할 점이 있을까요?"
}
```

### 응답 예시
AI는 사용자의 실제 재무 데이터를 기반으로 맞춤형 조언을 제공합니다:
- 자산 배분 조언
- 지출 절감 제안
- 리스크 분석
- 목표 설정 가이드

## 로컬 테스트

환경 변수를 `local.settings.json`에 추가:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AZURE_OPENAI_ENDPOINT": "https://...",
    "AZURE_OPENAI_API_KEY": "...",
    "AZURE_OPENAI_DEPLOYMENT_NAME": "..."
  }
}
```

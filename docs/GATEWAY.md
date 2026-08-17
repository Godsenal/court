# Vercel AI Gateway 연동

court는 게이트웨이 없이도 동작한다(claude CLI 폴백). 게이트웨이를 붙이면
**어떤 모델이든 `provider/model` 문자열 하나로 교체**되고, 관측/폴백/BYOK가 생긴다.

## 1. 키 발급 & 기본 연동 (llm 러너)

1. https://vercel.com/ai-gateway → API Key 생성
2. `export AI_GATEWAY_API_KEY=...` 후 court 서버 재시작

이것만으로 llm 러너(재상/화공/감찰/학사)와 judge/loop 평가가 게이트웨이를 탄다.
- OpenAI 호환 엔드포인트: `https://ai-gateway.vercel.sh/v1/chat/completions`
- 모델 ID: `anthropic/claude-opus-5`, `anthropic/claude-sonnet-5`, `openai/gpt-5.x`,
  `google/gemini-*`, `xai/grok-*` … (`GET /v1/models`로 목록 확인)
- 역할별 모델은 `~/.court/roles/*.json`으로 오버라이드

## 2. Claude Code(장인 러너)까지 게이트웨이로 (선택)

Claude Code 전용 엔드포인트가 있다: `https://ai-gateway.vercel.sh/claude-code`

```bash
export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh/claude-code"
export ANTHROPIC_AUTH_TOKEN="$AI_GATEWAY_API_KEY"
export ANTHROPIC_API_KEY=""    # 반드시 빈 값 — CC가 이걸 먼저 읽는다
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1   # /model에 게이트웨이 전 모델 노출
```

또는 `vercel ai-gateway coding-agents setup --agent claude-code`가 자동 설정.

⚠️ 이렇게 하면 Claude 구독이 아니라 **게이트웨이 크레딧으로 과금**된다.
구독 유지 + 게이트웨이 트레이스만 원하면: BASE_URL만 설정하고 키는
`ANTHROPIC_CUSTOM_HEADERS="x-ai-gateway-api-key: Bearer <key>"`로 전달.

court에서는 `~/.court/runners.json`에 게이트웨이 러너를 하나 더 정의하는 방식을 권장
(기본 claude 러너는 구독으로 두고, 필요할 때만 스위치):

```json
{
  "claude-gw": {
    "type": "claude",
    "env": {
      "ANTHROPIC_BASE_URL": "https://ai-gateway.vercel.sh/claude-code",
      "ANTHROPIC_AUTH_TOKEN": "<AI_GATEWAY_API_KEY>",
      "ANTHROPIC_API_KEY": ""
    }
  }
}
```

그래프 노드에서 `"runner": "claude-gw"` 지정하면 그 스텝만 게이트웨이로 실행.

## 3. 알아둘 것

- **BYOK**: 대시보드(팀 레벨)에 프로바이더 키 등록 가능(유료 티어). 실패 시 Vercel 키로
  재시도되며 그건 크레딧 과금.
- **폴백/라우팅**: `providerOptions.gateway.models: [...]`(모델 폴백), `order`/`only`/`sort`.
- **관측**: 대시보드에서 모델별 요청/TTFT/비용, 로그 페이지, `GET /v1/credits`.
- 무료 티어는 일부 모델만 + 낮은 레이트리밋. 크레딧 구매 시 월 무료 크레딧 소멸.
- 모델 ID는 문서보다 `GET /v1/models` 실측이 정확.

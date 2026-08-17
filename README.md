# Court

개인용 AI 오케스트레이션 플랫폼. 목표를 입력하면 역할 기반 에이전트 팀(PM/Developer/Reviewer…)이
그래프 파이프라인으로 실행하고, 대시보드에서 실시간으로 관제한다.

cmux · loops · palace 스택과 통합되는 로컬 도구.

## 시작하기

```bash
bun install
bun run --filter '@court/dashboard' build   # 대시보드 빌드
./scripts/install-launchd.sh                # 상주 데몬 설치 (http://localhost:8433)
```

cmux Feed 연동(알림에서 원클릭 승인)을 쓰려면 `~/.config/cmux/cmux.json`에서
`automation.socketControlMode`를 `"automation"`으로 설정.

## 대시보드 — http://localhost:8433

- **실시간 스트리밍** — 에이전트의 텍스트·도구 호출이 토큰 단위로 흐른다
- **팔로우업** — 실행 중이거나 끝난 작업의 에이전트에게 추가 지시 (같은 세션에 이어짐)
- **승인 게이트** — 위험한 단계 전에 멈추고 대시보드/cmux Feed/CLI 어디서든 승인·거절
- **재시도 / 취소 / 보관**, git 변경사항(diff) 뷰, 각 단계의 지시 내용 열람
- **역할 편집기** — 시스템 프롬프트, 티어별 모델, 러너, 도구 권한, 자동 승인 한도
- **스케줄** — 주기 실행 작업 (기본: cmux 포크 upstream 동기화 24h)
- ⌘K 명령 팔레트 · ⌘N 새 작업

## CLI

```bash
court go "kr-it-jobs에 다크모드 추가" --template auto --cwd ~/LTH/kr-it-jobs
court runs / show <id> / approve <id> <gate> / cancel <id>
```

## 동작 방식

| 개념 | 설명 |
| --- | --- |
| 작업 (Mission) | 목표 하나. 템플릿 또는 커스텀 그래프로 실행 |
| 템플릿 | `auto`(AI가 그래프 설계) · `pipeline`(계획→승인→구현→검토) · `breakdown`(분해→병렬) · `polish`(개선 루프) |
| 역할 (Role) | 시스템 프롬프트 + 티어별 모델 + 러너 + 도구 권한. 내장: pm/designer/developer/reviewer/researcher, 오버라이드: `~/.court/roles/*.json` |
| 노드 | agent · gate(승인) · judge(패널 검증 + 결정적 셸 체크) · fanout(병렬) · loop(반복) · tool(browser/shell/computer) |
| 게이트 정책 | risk < autoApproveBelow면 자동 통과, 아니면 사람 호출 (먼저 응답한 채널이 이김) |
| 모델 라우팅 | planner/executor/cheap 티어. `AI_GATEWAY_API_KEY` 설정 시 Vercel AI Gateway로 어떤 모델이든 `provider/model` 문자열 하나로 교체 (docs/GATEWAY.md), 미설정 시 claude CLI |
| 러너 | claude(Claude Code, 파일·셸 접근) · codex(Codex CLI) · llm(순수 완성). 멀티 계정: `~/.court/runners.json` |

## 구조

```
packages/
  engine/     이벤트 소싱 그래프 엔진 (순수 로직, 테스트 완비)
  adapters/   claude / codex / cmux / gateway / browser / tools
  server/     Bun HTTP+WS API :8433, ~/.court/runs/*.jsonl 영속화
  dashboard/  React + Vite + Tailwind v4
  cli/        court CLI
```

## 환경

- `AI_GATEWAY_API_KEY` — Vercel AI Gateway (선택, 멀티 모델)
- `COURT_VISIBLE=1` — claude 단계를 cmux 워크스페이스 터미널에서 가시 실행
- `COURT_PORT` — 기본 8433

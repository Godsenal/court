# 👑 court — AI 궁정

왕(당신)이 어명을 내리면 AI 신하들이 그래프 파이프라인으로 일하고,
어전회의(대시보드)에서 모든 작업을 관제하는 개인 AI 오케스트레이션 플랫폼.

palace · loops · cmux-remote 생태계의 두뇌. cmux 위에서 동작한다.

## 빠른 시작

```bash
bun install
bun run --filter '@court/dashboard' build   # 대시보드 빌드
./scripts/install-launchd.sh                # 상주 데몬 설치 (권장; http://localhost:8433)
# 또는 일회성 실행: bun packages/server/src/main.ts
```

cmux Feed 연동을 쓰려면 `~/.config/cmux/cmux.json`에서 `automation.socketControlMode`를
`"automation"`으로 (같은 유저의 로컬 자동화 프로세스 허용).

```bash
court go "kr-it-jobs에 다크모드 추가해줘" --cwd ~/LTH/kr-it-jobs   # 어명
court runs                                   # 런 목록
court show <runId>                           # 상세
court approve <runId> plan-gate              # 게이트 윤허
```

대시보드: http://localhost:8433 — 실시간 런/노드 상태, 승인 카드, 어명 작성.

## 개념

| 개념 | 설명 |
| --- | --- |
| **어명 (Mission)** | 목표 하나. 템플릿(파이프라인/분할정복/반복개선) 또는 커스텀 그래프로 실행 |
| **신하 (Role)** | 재상(PM)·화공(Designer)·장인(Developer)·감찰(Reviewer)·학사(Researcher). 역할 = 시스템 프롬프트 + 모델 정책 + 러너 |
| **그래프 노드** | agent / gate(휴먼 승인) / judge(패널 검증) / fanout(병렬) / loop(반복) / tool(browser·shell·computer) |
| **게이트 정책** | risk < autoApproveBelow 면 자동 승인, 아니면 사람 호출 — cmux 알림 + **cmux Feed 질문 카드(윤허/불허 원클릭)** + 대시보드 승인 카드 + CLI, 먼저 답한 쪽이 이긴다 |
| **자동 설계 (auto)** | 재상 planner 모델이 목표를 보고 그래프(노드/게이트/검증 배치)를 직접 설계 |
| **반복 어명** | ~/.court/schedules.json 주기 미션 (기본: cmux 포크 upstream 동기화 24h) |
| **모델 라우팅** | planner/executor/cheap 티어별 모델. Vercel AI Gateway(`AI_GATEWAY_API_KEY`) 설정 시 어떤 모델이든 문자열 하나로 교체, 미설정 시 claude CLI 폴백 |
| **러너** | claude(헤드리스 Claude Code) · codex(Codex CLI) · llm(순수 완성). `COURT_VISIBLE=1`이면 claude 스텝이 cmux 워크스페이스에서 보이게 실행 |

## 구조

```
packages/
  engine/     이벤트 소싱 그래프 엔진 (순수 로직, 테스트 완비)
  adapters/   claude / codex / cmux / gateway / ego-browser / tools
  server/     Bun HTTP+WS API :8433 (+대시보드 서빙, ~/.court/runs/*.jsonl 영속화)
  dashboard/  어전회의 (React + Vite + Tailwind v4)
  cli/        court CLI
```

## 환경

- `AI_GATEWAY_API_KEY` — Vercel AI Gateway 키 (선택; 멀티 모델 라우팅 — docs/GATEWAY.md)
- `~/.court/runners.json` — 멀티 계정 러너 (CLAUDE_CONFIG_DIR/CODEX_HOME env 오버라이드)
- `~/.court/roles/*.json` — 역할(신하) 오버라이드: 프롬프트·모델 티어·도구 권한·자동승인 한도
- `COURT_VISIBLE=1` — claude 스텝을 cmux 워크스페이스 터미널에서 가시적으로 실행
- `COURT_PORT` — 서버 포트 (기본 8433)

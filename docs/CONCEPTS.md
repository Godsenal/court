# court가 적용한 오케스트레이션 개념

최신 AI 오케스트레이션 패턴 중 court에 실제로 구현된 것들과 그 위치.
(리서치: 2026-08-17, loops 프로덕션 교훈 + cmux/게이트웨이 조사 반영)

## 그래프 엔지니어링

| 개념 | 구현 |
| --- | --- |
| **DAG 오케스트레이션** — 작업을 의존성 그래프로 선언, 준비된 노드부터 병렬 실행 | `engine.ts` tick/dispatch. LangGraph류의 상태머신 대신 이벤트 소싱 + 의존성 스케줄러 |
| **AI가 그래프를 설계** — planner 모델이 목표를 보고 노드/게이트/검증 배치를 직접 결정 | `planner.ts` (template=auto). 그래프 DSL을 시스템 프롬프트로 주고 JSON 검증 |
| **동적 확장** — 런타임에 노드 추가 (fanout 자식, loop 반복) | `runFanout`/`runLoop`의 `node.added` 이벤트 |
| **이벤트 소싱** — 모든 상태 변화는 append-only 이벤트, 리플레이로 복구 | `reducer.ts` + `store.ts` (~/.court/runs/*.jsonl) + `hydrate`/`recover` |

## 멀티 에이전트

| 개념 | 구현 |
| --- | --- |
| **역할 위임(role delegation)** — 역할 = 시스템 프롬프트 + 모델 정책 + 도구 권한 | `roles.ts` 신하 프로필. PM/디자이너는 llm, 개발자는 claude CLI(파일 접근) |
| **구조적 권한 제어** — 프롬프트가 아니라 도구 로드 레벨에서 능력 차단 (loops 실측: "prefer X" 프롬프트는 로드된 도구를 이기지 못한다. 364판정 중 0회) | `RolePolicy.allowedTools/disallowedTools` → claude CLI `--allowedTools` 플래그 |
| **이종 에이전트 협업** — claude가 만들고 codex가 리뷰 (교차 검증) | `RoutingAgentExecutor` + 노드별 runner 오버라이드. S7 검증됨 |
| **멀티 계정** — 같은 CLI를 다른 계정으로 병렬 운용 | `~/.court/runners.json` (CLAUDE_CONFIG_DIR / CODEX_HOME env 오버라이드) |

## 검증(verification)

| 개념 | 구현 |
| --- | --- |
| **저지 패널** — N명의 독립 검증자 다수결 | judge 노드 (`runJudge`, 기본 3표) |
| **결정적 플로어** — LLM 판단 전에 셸 체크 실행; 실패한 체크는 LLM이 뒤집을 수 없다 (loops 교훈: LLM은 플로어를 악화만 가능) | `JudgeNodeSpec.checks` — 실패 시 `pinnedBy: "checks"` |
| **루프-until** — 조건 충족까지 반복, cheap 모델이 조건 평가 | loop 노드 (`until` + maxIterations) |

## 휴먼 인 더 루프

| 개념 | 구현 |
| --- | --- |
| **정책 기반 게이트** — risk < 정책이면 자동 승인, 아니면 사람 호출 | gate 노드 + `strictestAutoApprove` (mission 기본 medium, 역할이 더 낮출 수만 있음) |
| **다채널 알림** — 게이트 대기 시 cmux 데스크탑 알림 (→ cmux-remote로 폰 푸시) | server gatekeeper → `cmux notify` |
| **승인 UI** — 대시보드 승인 카드(윤허/불허/메모) + CLI approve/deny | `RunDetail.tsx` ApprovalCard, S2 e2e 검증 |

## 모델 라우팅

| 개념 | 구현 |
| --- | --- |
| **thinker/doer 분리** — 사고는 고성능, 실행은 빠른 모델 | `ModelTier` (planner/executor/cheap) × 역할 정책. S4 검증 |
| **모델 문자열 스위칭** — 어떤 프로바이더든 `provider/model` 한 줄 | Vercel AI Gateway (`gateway.ts`, docs/GATEWAY.md). 키 없으면 claude CLI 폴백 |
| **CLI 별칭 매핑** — 게이트웨이 ID ↔ claude CLI 별칭 자동 변환 | `toClaudeCliModel` (opus/sonnet/haiku) |

## 실행 환경

| 개념 | 구현 |
| --- | --- |
| **헤드리스 우선 + 가시화 옵션** — 엔진은 터미널 앱에 의존하지 않고, 보고 싶을 때만 cmux 워크스페이스에 붙인다 (loops의 최대 교훈: cmux 탭 의존이 단일 장애점이었다) | 기본 headless `claude -p`; `COURT_VISIBLE=1`이면 cmux 워크스페이스 실행 |
| **브라우저 에이전트** — 자연어 웹 작업 | tool:browser → ego-browser를 쓰는 헤드리스 claude. S6 검증 |
| **컴퓨터 사용** — GUI 작업 | tool:computer → screencapture/cliclick 기반 claude 에이전트 (v1) |
| **반복 어명(스케줄)** — 주기적 미션 자동 발행 (예: cmux upstream 동기화) | `scheduler.ts` + ~/.court/schedules.json |
| **재시작 복구** — in-flight는 정직하게 실패 처리, 게이트는 유지 | `Engine.recover()` |

## 아직 안 한 것 (다음 후보)

- SQLite 영속화 (JSONL로 충분해질 때까지 보류 — loops의 "Linear가 DB" 교훈은 반영)
- 노드 재시도 정책 / 부분 재실행 (resume-from-node)
- loops의 watchdog/self-heal 계층 이식 (court 서버 자체의 launchd 상주화와 함께)
- cmux Feed(승인)와 게이트 양방향 브리지 — 현재는 알림만; `feed.*` rpc로 원클릭 승인 가능
- 비용 추적 (loops의 costs.jsonl 패턴)

# court — AI 궁정

> 왕(사용자)이 AI 신하들에게 어떤 역할이든 위임하고, 어전회의(대시보드)에서 모든 작업을 관제하는 개인 AI 오케스트레이션 플랫폼.

palace(관제 데스크탑) · loops(자율 루프) · cmux-remote(모바일) 생태계의 두뇌 역할.

## 핵심 원칙

1. **cmux 위에 선다** — 에이전트는 cmux workspace에서 실행되고, `cmux events` 스트림과
   `~/.cmuxterm/*.jsonl`로 관측하며, Feed(승인)와 notify(알림)로 사람과 만난다.
   cmux 포크(`Godsenal/cmux`, godsenal 브랜치)는 upstream을 계속 머지하며 발전시킨다.
2. **역할 위임(Ministers)** — PM/Designer/Developer/QA/Reviewer 등 역할을 "신하" 프로필로
   정의한다. 역할 = 시스템 프롬프트 + 모델 정책 + 도구 권한 + 검증 정책. 왕은 목표만 준다.
3. **그래프 오케스트레이션** — 작업은 노드(에이전트 스텝)와 엣지(데이터/승인 흐름)로 이루어진
   그래프. 루프(자율 반복), 팬아웃(병렬), 저지 패널(검증), 게이트(휴먼 승인)를 1급 개념으로.
4. **모델 라우팅** — 기본은 Claude. Vercel AI Gateway로 어떤 모델이든 문자열 하나로 교체.
   역할별 이원화: 사고(planner)는 고성능 모델, 실행(executor)은 빠른 모델.
5. **휴먼 루프는 정책** — 승인이 필요한 조건(위험도, 비용, 외부 영향)을 정책으로 선언하면
   필요할 때만 cmux Feed/notify/cmux-remote 푸시로 왕을 부른다. 나머지는 자동 진행.
6. **멀티 에이전트 CLI** — claude, codex 등 여러 CLI/계정을 어댑터로 추상화. cmux hooks가
   이미 세션 추적을 제공하는 에이전트는 그대로 관측한다.
7. **AI-native 개발** — 이 저장소 자체가 AI가 개발하기 좋게: CLAUDE.md, 스킬, 명확한 모듈
   경계, 문서-코드 동기화.
8. **브라우저/컴퓨터 사용** — ego-browser로 웹 작업, computer-use 패턴으로 GUI 작업을
   에이전트 능력으로 노출.

## 구성 요소 (초안)

- `engine/` — 그래프 실행 엔진 (Bun + TS): 노드 스케줄링, 상태 저장(JSONL/SQLite), 재개
- `adapters/` — claude(Agent SDK/CLI), codex, gateway(Vercel AI Gateway), cmux(소켓/CLI),
  ego-browser, computer-use
- `roles/` — 신하 프로필 (마크다운 + 정책 YAML)
- `server/` — Bun HTTP/WS 서버: REST + 실시간 이벤트 브로드캐스트
- `dashboard/` — 어전회의 웹 대시보드 (React, beautifului.dev)
- `cli/` — `court` CLI: 목표 제출, 상태 확인, 승인 처리
- `docs/` — 이 문서들

## 검증 기준 (완료 정의)

왕이 실제로 일하는 방식들이 court로 굴러가는지 시나리오로 검증한다:

- [x] S1: 목표 하나로 PM→Dev→Review 파이프라인이 자동 실행되고 대시보드에서 관측된다
      (2026-08-17: plan→auto-gate→build(claude, cwd)→judge 3/3 PASS, hello.txt 정확 생성)
- [x] S2: 위험한 스텝에서 휴먼 게이트가 발동하고, 승인하면 재개된다
      (2026-08-17: API + 대시보드 UI 양쪽 e2e — ego-browser로 윤허 클릭 → human 승인 → 재개 완료)
- [~] S3: 모델을 Claude→다른 모델로 문자열 하나로 교체해 같은 파이프라인이 돈다
      (게이트웨이 어댑터 계약 테스트 통과 — 모델 문자열 스위칭/인증/에러. 실 호출은 AI_GATEWAY_API_KEY 필요: vercel.com/ai-gateway에서 발급 후 env 설정)
- [x] S4: planner/executor 모델 이원화가 실제로 동작한다
      (2026-08-17: planner tier→opus, executor tier→sonnet 라우팅이 세션에 기록·대시보드 표시)
- [x] S5: cmux 포크 개발 워크플로우(빌드/upstream 머지)가 돌아간다
      (2026-08-17: sync-upstream.sh 태그 기반 머지 ✓, v0.64.22 기반 godsenal 브랜치 +
      Xcode16 호환 캐리 패치로 `reload.sh --tag court-fork` Debug 빌드 성공 ✓ — FORK.md 참고)
- [x] S6: 브라우저 작업(ego-browser)이 파이프라인 스텝으로 실행된다
      (2026-08-17: tool:browser 노드가 example.com 제목/헤딩 정확 보고)
- [x] S7: claude + codex 멀티 에이전트가 같은 그래프에서 협업한다
      (2026-08-17: claude(장인) add.py 작성/실행 → codex(감찰) PASS 리뷰)
- [x] S8: AI가 그래프를 직접 설계한다 (template=auto, 재상 planner 모델의 graph engineering)
      (2026-08-17: research→draft→judge→final 그래프 설계·완주)
- [x] S9: 메타 도그푸드 — court가 court 자신에 실제 기능을 구현한다
      (2026-08-17: /api/stats — 재상 계획 → cmux Feed 원클릭 승인 → 장인 구현 →
      결정적 체크(bun test+tsc) + 감찰 패널 검수 → 머지. run-msx3x0k1-vc2q)

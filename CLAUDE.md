# court — AI 궁정 (agent notes)

개인 AI 오케스트레이션 플랫폼. 왕(사용자)이 목표를 주면 AI 신하(역할 에이전트)들이
그래프 파이프라인으로 일하고, 어전회의(대시보드)에서 관제한다. `docs/VISION.md` 먼저 읽기.

## Stack

- Bun 워크스페이스 모노레포, TypeScript strict, ESM only
- `packages/engine` — 그래프 실행 엔진 (외부 IO 없음, 순수 로직 + 어댑터 주입)
- `packages/adapters` — claude/codex/gateway/cmux/browser 어댑터
- `packages/server` — Bun HTTP+WS 서버 (port 8433)
- `packages/dashboard` — React + Vite 대시보드
- `packages/cli` — `court` CLI
- 상태는 `~/.court/`에 저장 (runs/*.jsonl 이벤트 소싱 + snapshot.json)

## 명령

```bash
bun install
bun run typecheck      # 전 패키지 tsc --noEmit
bun test               # bun:test
bun run dev            # server + dashboard dev
```

## 규칙

- 엔진은 이벤트 소싱: 모든 상태 변화는 append-only 이벤트 → 리듀서로 스냅샷. 재시작 시 재생.
- 어댑터는 `packages/adapters/src/types.ts`의 인터페이스만 구현. 엔진은 어댑터 구현을 모른다.
- cmux 통합: 소켓 CLI(`/Applications/cmux.app/Contents/Resources/bin/cmux`)와
  `cmux events --json` 스트림, `~/.cmuxterm/*.jsonl` 읽기. cmux 코드는 건드리지 않는다
  (cmux 포크는 별도 저장소 ~/LTH/cmux).
- 모델 호출은 전부 Vercel AI Gateway 경유 가능해야 함. 모델 ID는 `provider/model` 문자열.
- 사용자-facing 텍스트는 한국어, 코드/로그는 영어.

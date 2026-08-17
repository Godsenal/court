# beautifului.dev — vendored sources

[beautifului.dev](https://www.beautifului.dev/)의 AI-native UI 컴포넌트 19종 원본.
**MIT License, © 2026 Shane Levine** (Turbo, [turbodesign.co](https://turbodesign.co/)).

사이트는 npm 패키지/저장소 없이 복붙 전용이라 여기 벤더링해 보존한다
(2026-08-17 사이트 RSC 페이로드에서 바이트 정확 추출).

## 사용법

- 스택: React + TypeScript + Tailwind CSS v4, `"use client"`, 다크모드는 `.dark` 클래스.
- **그대로는 컴파일되지 않는다**: `bg-surface`, `text-ink-2` 등 ~40개 시맨틱 토큰과
  `beautifului-required.css`(키프레임 9종 + 커스텀 클래스 163종)에 의존.
  대시보드에 이식할 때는 우리 토큰으로 리네이밍해서 가져갈 것
  (`packages/dashboard/src/components/bui.tsx`가 TaskRows 문법을 이식한 예).
- 의존성: 16/19는 React 훅만 사용. 예외 — `PromptBar`(glimm), `InsightCards`(liveline),
  `SelectionActions`(iconoir-react + 미공개 Shimmer/StreamText 아톰 → 그대로는 사용 불가).

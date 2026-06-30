---
"@pyreon/zero": minor
---

Add the build-time per-route performance advisor (opt-in via `zero({ perfAdvisor: true })`). After the client build it reads the Vite manifest + dist and prints, per route, the perf opportunities it finds — route JS over budget (static-closure bytes, islands-safe) and `content-visibility: auto` without `contain-intrinsic-size` (CLS) — and writes `dist/_pyreon-perf-advisor.json` for CI. Advisory only: never fails the build, silent when there's nothing to report. Configure the JS budget with `perfAdvisor: { jsBudget }` (default 150 KB). `perfAdvisorPlugin` + the pure check core (`runAdvisor` / `RouteAdvisorInput` / …) are exported from `@pyreon/zero/server` for standalone use and a future `pyreon doctor --perf` gate. The `collapse-off` + `hero-not-avif` checks ship in the core (tested) and are wired into the plugin in a follow-up (they need source scanning + HTML-preload parsing).

---
"@pyreon/zero": patch
---

Add the build perf-advisor check core (`src/perf-advisor/checks.ts`) — pure, fixture-tested functions that flag per-route performance opportunities: `collapse` off with collapsible rocketstyle sites, `content-visibility: auto` without `contain-intrinsic-size` (CLS), route JS over budget, and a preloaded hero image with no AVIF variant. This is the reusable foundation (consumed by both the upcoming `perfAdvisorPlugin` build-time reporter and a future `pyreon doctor --perf` gate); the `closeBundle` wiring that populates the inputs from the Vite manifest + dist is a follow-up. Internal module — not yet exported from any entry, so no consumer-facing surface and zero main-entry bundle impact.

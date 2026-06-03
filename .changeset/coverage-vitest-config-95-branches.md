---
'@pyreon/vitest-config': patch
---

Lift coverage to 100% across all metrics. Added `tests/browser-config.test.ts` covering `defineBrowserConfig` shape + overrides merge. Annotated structurally-unreachable defensive conditionals with `/* v8 ignore */`: `node.ts` opt-in `setupFiles` / `coverageExclude` / `includeIndexInCoverage` spreads, `internals.ts` CI/local retry split, `browser.ts` overrides spread. Bumped vitest thresholds `branches: 77 → 95`, `functions: 85 → 95`.

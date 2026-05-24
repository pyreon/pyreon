---
'@pyreon/reactivity': patch
---

Docs + migration guide for the bullet-proof cross-module-instance architecture (PR F of `.claude/plans/jaunty-herding-kazoo.md`).

Documentation-only PR landing the user-facing migration story for the singleton sentinel architecture from PR A (#883), the Vite dedupe from PR B (#884), and the doctor gate from PR E (#889):

- **`CLAUDE.md`** — new "Cross-Module-Instance State (the duplicate-load bug class)" section explaining defense-in-depth across 4 layers. Doc-page count claim bumped 82 → 83 (`check-doc-claims` green).
- **`.claude/rules/anti-patterns.md`** — 2 new entries: (a) re-introducing γ-style `globalThis.Symbol.for` state sharing in framework code (deliberately wrong direction); (b) sentinel opt-out for legitimate dual-load (the `rocketstyle-collapse` precedent — scope to smallest async window).
- **`docs/docs/migration.md`** — NEW end-user migration guide for the v0.x cutover. Covers what changed, immediate `PYREON_SINGLE_INSTANCE=warn` mitigation, lockfile diagnostic + per-package-manager fix recipes (bun / pnpm / npm / Yarn / workspace), non-Vite bundler config (Webpack `resolve.alias`, Rollup `dedupe`, esbuild), legitimate dual-load scenarios with the scoped-opt-out reference implementation, and rollback safety. Wired into the VitePress sidebar under "Getting Started".

Stacks on PR A (#883). Test flip happens in PR A's `singleton-sentinel.test.ts` directly — no separate reproducer package needed (the synthetic-`file://`-URL approach proves the same contract without filesystem dual-load harness).

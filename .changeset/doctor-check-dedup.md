---
'@pyreon/cli': minor
---

`pyreon doctor --check-dedup` audit (PR E of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

New gate that walks `bun.lock` / `package-lock.json` / `pnpm-lock.yaml` for any `@pyreon/*` package with more than one resolved version installed. Emits an `error`-severity finding per duplicated package naming every version + the concrete fix (lockfile rewrite, reinstall, `PYREON_SINGLE_INSTANCE=warn` mitigation).

**Defense-in-depth Layer 3.** Pairs with:
- Layer 1 (PR B / #884): `@pyreon/vite-plugin` injects `resolve.dedupe` — BUNDLER prevention
- Layer 2 (PR A / #883): every `@pyreon/*` calls `registerSingleton` — RUNTIME detection
- **Layer 3 (THIS PR): static lockfile scan — CI gate, catches duplicate installs before deploy**

Three pure parsers exported as `_internal` for unit-testability without filesystem dependencies:
- `_parseBunLock(raw)` — bun.lock JSON format (`lockfileVersion: 1`); skips `workspace:*` resolutions
- `_parseNpmLock(raw)` — package-lock.json v2/v3 format (matches nested `node_modules/.../@pyreon/<name>` paths)
- `_parsePnpmLock(raw)` — pnpm-lock.yaml v6 + v9+ formats via keyed-line regex

Wired into the doctor orchestrator as a fast-set gate (runs by default). Gate count: 10 fast + 2 slow = 12 with `--full`.

CLI: `pyreon doctor --check-dedup [--json]` (via the `--only <gate>` shortcut convention).

Test coverage: 20 specs covering each parser, the duplicate detector, and the full `runCheckDedupGate` integration against temp-dir fixtures. Bisect-verified — neutralizing the detection loop fails 5 detection tests; restored passes 20/20. Also includes a regression spec that runs the gate against the actual workspace `bun.lock` and asserts zero findings (every `@pyreon/*` is `workspace:*`).

// ─── A spec that silently skips is a gate that cannot fail ───────────────────
//
// Seven specs across three packages guarded themselves on `existsSync(lib/…)`,
// because they measure the BUILT output rather than the source: the plot
// families' tree-shaking, `@pyreon/store`'s dev-gate stripping, and — the
// sharpest one — `@pyreon/lint`'s proof that its published `bin` actually
// invokes the CLI, which exists because a shipped bin was once a total no-op
// in every published version.
//
// The guard is right locally: a fresh worktree has no `lib/`, and a hard
// failure there would tell a contributor to fix something that is not broken.
// It is wrong in CI, where `lib/` is guaranteed (the test cells are gated on
// the Bootstrap job) and a skip means the suite proved NOTHING while reporting
// green — the same class as `check-gates-wired`'s unwired gate, one layer down.
//
// So the skip stays, and it becomes IMPOSSIBLE TO HIDE: it prints what it
// skipped and why, and under `PYREON_REQUIRE_BUILT_LIB=1` (which CI sets, the
// way it sets `PYREON_REQUIRE_NATIVE_VALIDATE=1` for the native toolchain
// gates) an absent artifact is a hard failure naming the artifact.

import { existsSync } from 'node:fs'

/** Set by CI on the jobs that run after Bootstrap, where `lib/` is guaranteed. */
const REQUIRE = 'PYREON_REQUIRE_BUILT_LIB'

// Reached through `globalThis` rather than the bare `process` global: several
// packages typecheck against a NARROWED `process` shape (no `@types/node`), so
// `process.stderr` is a type error there even though the value exists at
// runtime. This helper is only ever loaded by a test file under vitest.
interface MinimalProcess {
  env?: Record<string, string | undefined> | undefined
  stderr?: { write(s: string): unknown } | undefined
}
const proc = (globalThis as { process?: MinimalProcess }).process

/**
 * Whether a built artifact this suite MEASURES is present.
 *
 * `false` means the specs guarded on it will skip — and says so on stderr, so
 * the skip is visible in the run rather than inferred from a test count. Under
 * `PYREON_REQUIRE_BUILT_LIB=1` an absent artifact THROWS instead, because a
 * skip there would be a green suite that measured nothing.
 *
 * @param path  the artifact, as an absolute path
 * @param what  what the guarded specs prove, for the message
 */
export function hasBuiltLib(path: string, what: string): boolean {
  if (existsSync(path)) return true
  const fix = `Run \`bun scripts/bootstrap.ts\` (or \`bun install\`) to build it.`
  if (proc?.env?.[REQUIRE] === '1') {
    throw new Error(
      `[pyreon] ${what} needs the BUILT artifact ${path}, which is missing, and ${REQUIRE}=1 says this environment guarantees it. `
        + `Skipping here would report a green suite that measured nothing. ${fix}`,
    )
  }
  // Not `console.warn`: vitest prints stderr per file, so this lands next to
  // the suite it belongs to instead of at the end of the run.
  const line = `[pyreon] SKIPPING: ${what} — no built artifact at ${path}. ${fix}\n`
  if (proc?.stderr !== undefined) proc.stderr.write(line)
  else console.warn(line)
  return false
}

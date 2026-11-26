#!/usr/bin/env bun
/**
 * check-scripts-typecheck — `scripts/` typechecks with zero diagnostics.
 *
 * The repo's scripts (gates, benches, generators) are not a package, so
 * `bun run typecheck` (per package) never saw them. A script importing a
 * workspace export that was renamed or removed broke only when someone ran it:
 * `bench:loom` died on `detectPeerMismatch` after loom retired it, while every
 * gate stayed green (#4751 review).
 *
 * This runs `tsc -p scripts/tsconfig.json` and fails on ANY diagnostic. It
 * started (#4751) failing only on the import-resolution class, because 22
 * ordinary type errors had accumulated (bench code against untyped competitor
 * packages, `exactOptionalPropertyTypes` drift); those were fixed (#4765), so
 * a type error in a script now fails like one in a package.
 *
 * Bench-only third-party modules that ship no types are declared in
 * `scripts/bench/core/untyped-modules.d.ts`; anything with an `@types/*`
 * package gets that package instead.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Every `error TS1234:` line in tsc output (`file(line,col): error TS…` and
 * the file-less config / type-library form), trimmed.
 */
export function tscDiagnostics(tscOutput: string): string[] {
  return tscOutput
    .split('\n')
    .filter((line) => /error TS\d+:/.test(line))
    .map((line) => line.trim())
}

if (import.meta.main) {
  const project = fileURLToPath(new URL('./tsconfig.json', import.meta.url))
  const r = spawnSync('bunx', ['tsc', '-p', project], { encoding: 'utf8' })
  const output = `${r.stdout}\n${r.stderr}`
  const diagnostics = tscDiagnostics(output)
  if (diagnostics.length > 0) {
    console.error(`✗ check-scripts-typecheck — ${diagnostics.length} tsc diagnostic(s) in scripts/:`)
    for (const d of diagnostics) console.error(`  ${d}`)
    console.error(
      'Fix the type error (or the import, if the export was renamed or removed). A bench-only third-party module without types goes in scripts/bench/core/untyped-modules.d.ts; never `any` or @ts-ignore.',
    )
    process.exit(1)
  }
  if (r.status !== 0 || r.error) {
    // tsc failed without printing a diagnostic (not installed, crashed): never pass on silence.
    console.error(`✗ check-scripts-typecheck — tsc did not run cleanly (exit ${r.status}): ${r.error?.message ?? output.trim()}`)
    process.exit(1)
  }
  console.log('✓ check-scripts-typecheck — scripts/ typechecks with no diagnostics')
}

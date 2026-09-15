/**
 * Per-package attribution of a batched `bun run --filter=… build` exit.
 *
 * bun prefixes every line of a filtered script's output with the workspace
 * name and script (`@pyreon/core build: …`) and reports a non-zero script
 * with `<name> build: Exited with code N` (or `Signaled with code SIGKILL`).
 * The batch as a whole exits non-zero, which is a single boolean; this reads
 * the per-package verdicts back out of the captured output so bootstrap can
 * withhold the "successfully built" manifest hash from EXACTLY the packages
 * whose build failed — including packages that produce no `lib/` and whose
 * exit status was therefore the only success signal there ever was.
 */
const FAILED_LINE = /^(\S+) build: (?:Exited with code (?!0$)\d+|Signaled with code \S+)\s*$/gm

export function attributeBuildFailures(output: string): Set<string> {
  const failed = new Set<string>()
  for (const m of output.matchAll(FAILED_LINE)) failed.add(m[1]!)
  return failed
}

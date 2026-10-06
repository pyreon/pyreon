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

import { captureProcess } from './bounded-process'

/**
 * Stream and capture build output. Bound pipe drainage after parent exit and
 * stop owned descendants before settling, so the bootstrap runtime can exit.
 * An incomplete drain fails closed instead of accepting partial attribution.
 */
export async function spawnBatchAttributed(
  cmd: string,
  args: string[],
  opts: {
    cwd: string
    timeoutMs: number
    stdout?: (d: Buffer) => void
    stderr?: (d: Buffer) => void
  },
): Promise<{ ok: boolean; output: string; timedOut: boolean }> {
  const result = await captureProcess(cmd, args, {
    cwd: opts.cwd,
    env: process.env,
    timeoutMs: opts.timeoutMs,
    stdout: opts.stdout,
    stderr: opts.stderr,
    exitDrainMs: 250,
  })
  const problem =
    result.error || (result.timedOut ? `build timed out after ${opts.timeoutMs}ms` : '')
  const diagnostic = problem ? `[bootstrap] ${problem}\n` : ''
  if (diagnostic) opts.stderr?.(Buffer.from(diagnostic))
  return {
    ok: result.code === 0 && !result.signal && !result.error && !result.timedOut,
    output: result.output + diagnostic,
    timedOut: result.timedOut,
  }
}

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

import { spawn } from 'node:child_process'

/**
 * Spawn the batch, STREAMING its output while CAPTURING it, and resolve on the
 * batch's own EXIT. `exit`, NOT `close`: `close` waits for every stdio pipe to
 * reach EOF, and the per-package builds bun spawns INHERIT the pipe — killing
 * the batch on the timeout left those orphans holding it open, so `close`
 * never fired and the postinstall hung forever (measured). Whatever tail an
 * orphan still writes after the batch exits is simply not attributed, which
 * is the fail-closed direction (an unattributed failure withholds every hash).
 */
export function spawnBatchAttributed(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; stdout?: (d: Buffer) => void; stderr?: (d: Buffer) => void },
): Promise<{ ok: boolean; output: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    child.stdout.on('data', (d: Buffer) => {
      output += d.toString()
      opts.stdout?.(d)
    })
    child.stderr.on('data', (d: Buffer) => {
      output += d.toString()
      opts.stderr?.(d)
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, opts.timeoutMs)
    child.on('error', () => {
      clearTimeout(timer)
      resolvePromise({ ok: false, output, timedOut })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolvePromise({ ok: code === 0, output, timedOut })
    })
  })
}

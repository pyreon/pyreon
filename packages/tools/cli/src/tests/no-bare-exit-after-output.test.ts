/**
 * The class lock for #4799: no Pyreon command entry calls a bare
 * `process.exit(…)` once it may have printed.
 *
 * On a pipe stdout and stderr are written asynchronously (macOS, Node and
 * Bun), and `process.exit` drops whatever is still queued: `pyreon doctor --ci
 * --json | jq` received 64 KiB of a 130 KiB report. A command exits through
 * `exitAfterFlush` (`@pyreon/ansi`; the hand-written bins get it re-exported
 * from their own `lib/`), sets `process.exitCode` and returns, or exits from
 * the callback of its last write. Every remaining bare call is listed below
 * with the reason it cannot lose output.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..', '..', '..')

/** The entry points of every published command, and the trees they dispatch into. */
const SCANNED = [
  'packages/tools/cli/src/index.ts',
  'packages/tools/lint/src/cli.ts',
  'packages/tools/lint/bin',
  'packages/tools/atlas/bin',
  'packages/tools/loom/bin',
  'packages/tools/lathe/bin',
  'packages/tools/mcp/src/index.ts',
  'packages/native/cli/bin',
  'packages/native/cli/src/cli.ts',
  'packages/zero/cli/src',
  'packages/zero/create-zero/src',
  'packages/zero/create-multiplatform/bin',
  'packages/zero/create-multiplatform/src',
]

/** `file` → why its bare `process.exit` calls cannot drop output. */
const ALLOWED_FILES: Record<string, string> = {
  'packages/zero/create-zero/src/prompts.ts':
    'interactive cancellation: one short `p.cancel` line, which libuv writes synchronously (only the part past a full pipe buffer is queued); the prompt tests mock `process.exit` to assert each abort',
}

/** Exact line text → why it is safe. */
const ALLOWED_LINES: Record<string, string> = {
  "if (error?.code === 'EPIPE') process.exit(0)": 'the reader closed the pipe (`| head`): nothing more can be delivered',
}

function files(path: string): string[] {
  const abs = join(ROOT, path)
  if (!statSync(abs).isDirectory()) return [abs]
  return readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|js|mjs)$/.test(f) && !/(^|\/)(tests?|__tests__)\//.test(f) && !f.endsWith('.test.ts'))
    .map((f) => join(abs, f))
}

describe('no bare process.exit after output in a command entry (#4799)', () => {
  it('every process.exit call is a flushed exit or listed with its reason', () => {
    const offenders: string[] = []
    for (const path of SCANNED) {
      for (const file of files(path)) {
        const rel = relative(ROOT, file)
        if (rel in ALLOWED_FILES) continue
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const code = line.trim()
            if (!code.includes('process.exit(')) return
            if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
            if (code in ALLOWED_LINES) return
            // Exiting from the callback of the last write waits for that write.
            if (/\.write\(.*,\s*\(\)\s*=>\s*process\.exit\(/.test(code) || /^\(\)\s*=>\s*process\.exit\(/.test(code)) return
            offenders.push(`${rel}:${i + 1}  ${code}`)
          })
      }
    }
    expect(offenders).toEqual([])
  })

  it('the allowlist has no stale entries', () => {
    for (const file of Object.keys(ALLOWED_FILES)) {
      expect(readFileSync(join(ROOT, file), 'utf8')).toContain('process.exit(')
    }
    const all = SCANNED.flatMap(files).map((f) => readFileSync(f, 'utf8')).join('\n')
    for (const line of Object.keys(ALLOWED_LINES)) expect(all).toContain(line)
  })
})

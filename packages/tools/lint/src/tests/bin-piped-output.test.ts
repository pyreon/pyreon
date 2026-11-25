/**
 * The published `pyreon-lint` bin over a pipe (#4799, #4810 review).
 *
 * - A slow reader gets the whole `--format json` report: the bin exits through
 *   `exitAfterFlush`, and the report is written with `writeOut`, because Bun's
 *   `console.log` drops what a full pipe does not take.
 * - A reader that closes early (`| head`) ends the bin with its own exit code:
 *   under Bun the stdout is then errored but not destroyed, and waiting on it
 *   hung forever.
 *
 * Runs the shipped bin (`bin/pyreon-lint.js` over `lib/`) under Node and, when
 * installed, Bun. Bisect: drop the `isClosed` check from `afterStreamsFlush`
 * (`@pyreon/ansi`) and rebuild `lib/`; the Bun early-close case is killed by
 * the 15 s guard. Put `console.log(formatJSON(result))` back in `src/cli.ts`
 * and rebuild; the Bun slow-reader case receives 65,536 bytes.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasBuiltLib } from '@pyreon/test-utils/built-lib'

const PKG = resolve(__dirname, '..', '..')
const BIN = join(PKG, 'bin', 'pyreon-lint.js')
const built = hasBuiltLib(join(PKG, 'lib', 'cli.js'), "the pyreon-lint bin's piped output")
const hasBun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0
const runtimes = [['node', process.execPath], ...(hasBun ? [['bun', 'bun']] : [])] as const

let dir = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-piped-'))
  mkdirSync(join(dir, 'src'))
  // An error-severity finding per file (`pyreon/no-signal-call-write`), enough
  // files for a report well past one 64 KiB pipe buffer.
  for (let i = 0; i < 400; i++) {
    writeFileSync(join(dir, 'src', `f${i}.ts`), `const count${i} = signal(0)\nexport function inc${i}() { count${i}(5) }\n`)
  }
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function run(runtime: string, closeEarly: boolean): Promise<{ bytes: number; stdout: string; code: number | null; hung: boolean }> {
  return new Promise((done, reject) => {
    const child = spawn(runtime, [BIN, '--format', 'json', 'src'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    let hung = false
    const guard = setTimeout(() => {
      hung = true
      child.kill('SIGKILL')
    }, 15_000)
    if (closeEarly) child.stdout.once('data', () => child.stdout.destroy())
    else {
      child.stdout.pause()
      setTimeout(() => child.stdout.resume(), 300)
      child.stdout.on('data', (c: Buffer) => chunks.push(c))
    }
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(guard)
      const out = Buffer.concat(chunks)
      done({ bytes: out.length, stdout: out.toString('utf8'), code, hung })
    })
  })
}

describe.skipIf(!built)('pyreon-lint bin over a pipe', () => {
  for (const [name, runtime] of runtimes) {
    it(`${name}: a slow reader gets the whole --format json report`, async () => {
      const r = await run(runtime, false)
      expect(r.bytes).toBeGreaterThan(64 * 1024)
      expect((JSON.parse(r.stdout) as { totalErrors: number }).totalErrors).toBeGreaterThan(0)
      expect(r.code).toBe(1)
    }, 60_000)

    it(`${name}: a reader that closes early ends it with its own exit code`, async () => {
      const r = await run(runtime, true)
      expect(r.hung).toBe(false)
      expect(r.code).toBe(1)
    }, 60_000)
  }
})

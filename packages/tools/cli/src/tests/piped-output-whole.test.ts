/**
 * #4799: `pyreon doctor --ci --json | jq` got the first 64 KiB of the report.
 *
 * The bin printed the report and then called `process.exit()`. On a pipe
 * stdout is written asynchronously (macOS, Node and Bun), so the exit dropped
 * everything the reader had not taken yet; redirected to a file the report was
 * whole. Every command now exits through `exitAfterFlush` (`@pyreon/ansi`).
 *
 * This runs the SHIPPED bin (`bin/pyreon.js` over `lib/`) under Node, the bin's runtime,
 * with a reader that waits 300 ms before it starts reading, and asserts the
 * JSON parses and the exit code survives. Bisect: put `process.exit(…)` back
 * in `src/index.ts`, rebuild (`bun scripts/bootstrap.ts`), and both cases
 * receive 65,536 bytes of unterminated JSON on macOS.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { hasBuiltLib } from '@pyreon/test-utils/built-lib'

const PKG = resolve(__dirname, '..', '..')
const BIN = join(PKG, 'bin', 'pyreon.js')
const LIB = join(PKG, 'lib', 'index.js')
const built = hasBuiltLib(LIB, "the pyreon bin's piped --json output")

// React habits: several `react-patterns` findings per file, so 160 files give
// a report far past one 64 KiB pipe buffer.
const reactFile = (i: number) => `import { useState, useEffect } from 'react'
export function C${i}() {
  const [v, setV] = useState(0)
  useEffect(() => { setV(1) }, [])
  return <div className="x" htmlFor="y" onChange={() => setV(2)}>{v}</div>
}
`

// An error-severity lint finding (`pyreon/no-stale-for-item-field`), so
// `doctor --ci` exits 1 — the path that called `process.exit`.
const staleRow = `import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
export function List() {
  const rows = signal([{ id: 'a', done: false }])
  const toggle = (id) => rows.set(rows().map((r) => (r.id === id ? { ...r, done: !r.done } : r)))
  return <ul><For each={rows} by={(r) => r.id}>{(r) => <li class={r.done ? 'done' : ''} onClick={() => toggle(r.id)}>{r.id}</li>}</For></ul>
}
`

let dir = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-piped-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'piped', private: true, type: 'module' }))
  mkdirSync(join(dir, 'src'))
  for (let i = 0; i < 160; i++) writeFileSync(join(dir, 'src', `C${i}.tsx`), reactFile(i))
  writeFileSync(join(dir, 'src', 'List.tsx'), staleRow)
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/** Run the bin with a reader that starts 300 ms late; collect stdout and the code. */
function runPiped(args: string[], runtime = process.execPath): Promise<{ stdout: string; code: number | null }> {
  return new Promise((done, reject) => {
    const child = spawn(runtime, [BIN, ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    child.stdout.pause()
    setTimeout(() => child.stdout.resume(), 300)
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.on('error', reject)
    child.on('close', (code) => done({ stdout: Buffer.concat(chunks).toString('utf8'), code }))
  })
}

const hasBun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0

describe.skipIf(!built)('a piped --json report is whole and keeps its exit code (#4799)', () => {
  it('pyreon check --json (exit 1 on findings)', async () => {
    const r = await runPiped(['check', '--json', 'src'])
    expect(r.stdout.length).toBeGreaterThan(64 * 1024)
    const report = JSON.parse(r.stdout) as { findingCount: number }
    expect(report.findingCount).toBeGreaterThan(0)
    expect(r.code).toBe(1)
  }, 60_000)

  it('pyreon doctor --ci --json (exit 1 on an error finding)', async () => {
    const r = await runPiped(['doctor', '--only', 'react-patterns,lint', '--ci', '--json'])
    expect(r.stdout.length).toBeGreaterThan(64 * 1024)
    const report = JSON.parse(r.stdout) as { totals: { errors: number } }
    expect(report.totals.errors).toBeGreaterThan(0)
    expect(r.code).toBe(1)
  }, 60_000)
})

/**
 * The same under Bun (`bun <bin>`). Bun's `console.log` drops what a full pipe
 * does not take once `process.stdout` has been touched, even with no exit at
 * all, so the reports go through `writeOut` (`process.stdout.write`, waiting
 * for `drain`). Bisect: print the doctor report with `console.log` again
 * (`doctor.ts`) and rebuild; Bun delivers 65,536 bytes of a >1 MB report.
 */
describe.skipIf(!built || !hasBun)('under Bun, a piped report over 1 MB is whole (#4799)', () => {
  it('bun bin/pyreon.js doctor --ci --json', async () => {
    const r = await runPiped(['doctor', '--only', 'react-patterns,lint', '--ci', '--json'], 'bun')
    expect(Buffer.byteLength(r.stdout)).toBeGreaterThan(1024 * 1024)
    const report = JSON.parse(r.stdout) as { totals: { errors: number } }
    expect(report.totals.errors).toBeGreaterThan(0)
    expect(r.code).toBe(1)
  }, 60_000)

  it('bun bin/pyreon.js check --json', async () => {
    const r = await runPiped(['check', '--json', 'src'], 'bun')
    expect(r.stdout.length).toBeGreaterThan(64 * 1024)
    expect((JSON.parse(r.stdout) as { findingCount: number }).findingCount).toBeGreaterThan(0)
    expect(r.code).toBe(1)
  }, 60_000)
})

/**
 * The library entry runs nothing on import. It used to be the bin as well, so
 * `zero doctor` (which imports `doctor` from it) ran the whole `pyreon` CLI a
 * second time with zero's argv: two reports, two JSON documents on one stdout
 * (`zero doctor --json` was not valid JSON), and under `--ci` an exit that cut
 * the second one off. Bisect: put the unconditional `main()` call back at the
 * bottom of `src/index.ts` and rebuild; the import prints the version.
 */
describe.skipIf(!built)('importing @pyreon/cli runs nothing', () => {
  it('an import with CLI-shaped argv prints nothing and exits 0', async () => {
    const script = `await import(${JSON.stringify(LIB)})`
    const r = await new Promise<{ stdout: string; code: number | null }>((done, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script, '--', 'argv1', '--version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      let stdout = ''
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => done({ stdout, code }))
    })
    expect(r.stdout).toBe('')
    expect(r.code).toBe(0)
  }, 30_000)

  it('the bin still runs the CLI', async () => {
    const r = await runPiped(['--version'])
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
    expect(r.code).toBe(0)
  }, 30_000)
})

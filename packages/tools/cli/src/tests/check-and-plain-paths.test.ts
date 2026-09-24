/**
 * `pyreon check` and `pyreon plain` — which files they look at, and what
 * they say about them.
 *
 * Both take optional path arguments and fall back to a default set, and
 * both exit non-zero on findings. That makes the file-selection layer
 * the load-bearing part: a path arg that silently expands to nothing
 * produces "no anti-patterns found" and exit 0, which is
 * indistinguishable from a clean project. It is the same empty-scan
 * failure the doctor's workspace resolver exists to prevent, one command
 * over.
 *
 * The exit code matters as much as the output — both are usable in CI,
 * so a finding that prints but exits 0 is a gate that cannot fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { check } from '../check'
import { plain } from '../plain'

let cwd: string

/** Source carrying a detector-visible Pyreon anti-pattern. */
const BAD = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function bump() { count(1) }
`
/** Source with nothing to report. */
const GOOD = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function bump() { count.set(1) }
`
/** Classic source the plain codemod can convert. */
const CLASSIC = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function read() { return count() }
`

const write = (rel: string, body: string): string => {
  const abs = join(cwd, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

/** Run a command with stdout/stderr captured rather than printed. */
async function run(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const chunks: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    chunks.push(a.map(String).join(' '))
  })
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    chunks.push(a.map(String).join(' '))
  })
  const code = await fn()
  log.mockRestore()
  err.mockRestore()
  return { code, out: chunks.join('\n') }
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'pyreon-cli-paths-'))
  mkdirSync(join(cwd, 'src'), { recursive: true })
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('check reports a finding and exits non-zero', () => {
  it('finds the anti-pattern and fails', async () => {
    // The control. Every "is clean" assertion below is worthless
    // against a command that reports nothing at all.
    write('src/a.ts', BAD)
    const r = await run(() => check({ paths: ['src/a.ts'], cwd, json: false, fix: false }))
    expect(r.code, 'a finding must fail the command').not.toBe(0)
    expect(r.out).toContain('a.ts')
  })

  it('exits 0 and says so for clean source', async () => {
    write('src/a.ts', GOOD)
    const r = await run(() => check({ paths: ['src/a.ts'], cwd, json: false, fix: false }))
    expect(r.code).toBe(0)
    expect(r.out.toLowerCase()).toMatch(/no .*anti-pattern|✓/)
  })

  it('emits machine-readable JSON with --json', async () => {
    // The shape a CI step or an assistant parses. A human-formatted
    // string here means every consumer scrapes ansi codes.
    write('src/a.ts', BAD)
    const r = await run(() => check({ paths: ['src/a.ts'], cwd, json: true, fix: false }))
    const parsed = JSON.parse(r.out) as { findings?: unknown[] }
    expect(Array.isArray(parsed.findings)).toBe(true)
    expect(parsed.findings!.length).toBeGreaterThan(0)
  })

  it('emits VALID JSON when there is nothing to report', async () => {
    // An empty string here breaks every parser downstream.
    write('src/a.ts', GOOD)
    const r = await run(() => check({ paths: ['src/a.ts'], cwd, json: true, fix: false }))
    expect(() => JSON.parse(r.out)).not.toThrow()
  })

  it('orders findings by file then line, so two runs read the same', async () => {
    write('src/b.ts', BAD)
    write('src/a.ts', BAD)
    const r = await run(() => check({ paths: ['src'], cwd, json: true, fix: false }))
    const files = (JSON.parse(r.out) as { findings: Array<{ file: string }> })
      .findings.map((f) => f.file)
    expect(files, 'stable ordering').toEqual([...files].sort())
  })
})

describe('check expands its path arguments', () => {
  it('expands a DIRECTORY to the source files under it', async () => {
    write('src/nested/deep.ts', BAD)
    const r = await run(() => check({ paths: ['src'], cwd, json: true, fix: false }))
    expect(r.out).toContain('deep.ts')
  })

  it('skips a non-source file named explicitly', async () => {
    // Running the detectors over a `.md` or a `.json` would report
    // nonsense positions in a file that has no code.
    write('src/notes.md', 'signal(0)')
    const r = await run(() => check({ paths: ['src/notes.md'], cwd, json: true, fix: false }))
    expect((JSON.parse(r.out) as { findings: unknown[] }).findings).toEqual([])
  })

  it('skips a declaration file', () => {
    // A `.d.ts` has no runtime behaviour; findings there are noise.
    write('src/types.d.ts', 'export declare const x: number')
    return run(() => check({ paths: ['src'], cwd, json: true, fix: false }))
      .then((r) => {
        expect(r.out).not.toContain('types.d.ts')
      })
  })

  it('REPORTS a path that does not exist rather than silently scanning nothing', async () => {
    // The empty-scan failure: exiting 0 with no findings for a typo'd
    // path is indistinguishable from a clean project.
    const r = await run(() => check({ paths: ['src/nope.ts'], cwd, json: false, fix: false }))
    expect(r.out.toLowerCase(), 'the bad path must be named').toContain('not found')
  })

  it('accepts an ABSOLUTE path as well as a relative one', async () => {
    const abs = write('src/a.ts', BAD)
    const r = await run(() => check({ paths: [abs], cwd, json: true, fix: false }))
    expect((JSON.parse(r.out) as { findings: unknown[] }).findings.length).toBeGreaterThan(0)
  })

  it('does not scan node_modules when given the project root', async () => {
    // Scanning a dependency tree reports findings the author cannot fix
    // and takes minutes doing it.
    write('node_modules/dep/index.ts', BAD)
    write('src/a.ts', GOOD)
    const r = await run(() => check({ paths: ['.'], cwd, json: true, fix: false }))
    expect(r.out).not.toContain('node_modules')
  })

  it('deduplicates a file named twice', async () => {
    // `pyreon check src src/a.ts` — the same finding reported twice
    // makes a count that does not match reality.
    write('src/a.ts', BAD)
    const r = await run(() => check({ paths: ['src', 'src/a.ts'], cwd, json: true, fix: false }))
    const findings = (JSON.parse(r.out) as { findings: Array<{ file: string; line: number }> })
      .findings
    const keys = findings.map((f) => `${f.file}:${f.line}`)
    expect(new Set(keys).size, 'no duplicate finding').toBe(keys.length)
  })
})

describe('plain reports convertibility per file', () => {
  it('reports a convertible file and exits 0', async () => {
    // `plain` without `--write` is a readiness REPORT, not a gate —
    // exiting non-zero would fail a build for asking a question.
    write('src/a.ts', CLASSIC)
    const r = await run(() => plain({ paths: ['src/a.ts'], cwd, json: false, write: false }))
    expect(r.code).toBe(0)
    expect(r.out).toContain('a.ts')
  })

  it('emits machine-readable JSON with --json', async () => {
    write('src/a.ts', CLASSIC)
    const r = await run(() => plain({ paths: ['src/a.ts'], cwd, json: true, write: false }))
    expect(() => JSON.parse(r.out)).not.toThrow()
  })

  it('does NOT modify the file without --write', async () => {
    // A readiness report that edits source is the least expected thing
    // a dry run can do.
    const abs = write('src/a.ts', CLASSIC)
    await run(() => plain({ paths: ['src/a.ts'], cwd, json: false, write: false }))
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(abs, 'utf8')).toBe(CLASSIC)
  })

  it('expands a directory and skips node_modules', async () => {
    write('src/nested/a.ts', CLASSIC)
    write('node_modules/dep/b.ts', CLASSIC)
    const r = await run(() => plain({ paths: ['.'], cwd, json: true, write: false }))
    expect(r.out).toContain('a.ts')
    expect(r.out).not.toContain('node_modules')
  })

  it('skips a non-source file named explicitly', async () => {
    write('src/notes.md', 'const a = 1')
    const r = await run(() => plain({ paths: ['src/notes.md'], cwd, json: true, write: false }))
    expect(r.out).not.toContain('notes.md')
  })

  it('handles a path that does not exist without throwing', async () => {
    await expect(
      run(() => plain({ paths: ['src/nope.ts'], cwd, json: true, write: false })),
    ).resolves.toBeDefined()
  })

  it('emits JSON for an EMPTY project, not prose', async () => {
    // The one consumer `--json` exists for is a parser. Printing
    // `No source files matched.` on this branch is the only case where
    // the flag hands it something it cannot read — and "no files" is
    // exactly when a script is deciding whether to proceed.
    const r = await run(() => plain({ paths: ['src'], cwd, json: true, write: false }))
    const parsed = JSON.parse(r.out) as { files: unknown[]; matched: number }
    expect(parsed.files).toEqual([])
    expect(parsed.matched).toBe(0)
  })

  it('still prints a human line for an empty project WITHOUT --json', async () => {
    // The fix must not cost the readable message.
    const r = await run(() => plain({ paths: ['src'], cwd, json: false, write: false }))
    expect(r.out).toContain('No source files')
  })
})

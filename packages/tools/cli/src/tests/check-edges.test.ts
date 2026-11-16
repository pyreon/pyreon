import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createTerm, stripAnsi } from '@pyreon/ansi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type CheckOptions, type CheckRun, check, type Finding, renderCheckText } from '../check'

let tmp: string
let logs: string[]
let errs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-check-edges-'))
  logs = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errs.push(a.map(String).join(' '))
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

const opts = (over: Partial<CheckOptions>): CheckOptions => ({
  paths: [],
  cwd: tmp,
  json: false,
  fix: false,
  ...over,
})
const write = (name: string, src: string): string => {
  const p = join(tmp, name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, src, 'utf8')
  return p
}

const BAD = `import { signal } from '@pyreon/reactivity'
export function C() {
  const count = signal(0)
  count(5)
  return <For each={[1, 2, 3]}>{(n) => <li>{n}</li>}</For>
}
`

describe('pyreon check — paths', () => {
  it('names a path that does not exist and checks nothing', async () => {
    expect(await check(opts({ paths: ['nope/missing.ts'] }))).toBe(0)
    expect(stripAnsi(errs.join('\n'))).toContain('path not found: nope/missing.ts')
    expect(stripAnsi(logs.join('\n'))).toContain('No source files matched')
  })

  it('expands a directory recursively, skipping node_modules, build output, declarations and non-source files', async () => {
    write('src/a.ts', 'export const a = 1\n')
    write('src/deep/b.tsx', 'export const b = 2\n')
    write('src/types.d.ts', 'export type T = 1\n')
    write('src/notes.md', '# x\n')
    write('node_modules/pkg/index.ts', BAD)
    write('dist/out.js', BAD)
    mkdirSync(join(tmp, 'src', 'folder.ts'))
    const code = await check(
      opts({ paths: ['src', 'node_modules/pkg/../../src/a.ts'], json: true }),
    )
    expect(code).toBe(0)
    const parsed = JSON.parse(logs.join('\n')) as { fileCount: number }
    // a.ts (once, though named twice) and deep/b.tsx; the directory named folder.ts is not a file.
    expect(parsed.fileCount).toBe(2)
  })

  it('accepts an absolute path and reports the finding relative to the cwd', async () => {
    const f = write('abs/bad.tsx', BAD)
    expect(await check(opts({ paths: [f], json: true }))).toBe(1)
    const parsed = JSON.parse(logs.join('\n')) as { findings: Finding[] }
    expect(parsed.findings.every((x) => x.file === join('abs', 'bad.tsx'))).toBe(true)
  })
})

describe('pyreon check — empty runs in machine modes', () => {
  it('--json with nothing to check is an empty, parseable result', async () => {
    expect(await check(opts({ paths: ['none.ts'], json: true }))).toBe(0)
    expect(JSON.parse(logs.join('\n'))).toEqual({
      findings: [],
      fileCount: 0,
      findingCount: 0,
      fixedCount: 0,
    })
  })

  it('--gha with nothing to check prints nothing', async () => {
    expect(await check(opts({ paths: ['none.ts'], gha: true }))).toBe(0)
    expect(logs).toEqual([])
  })

  it('--gha with findings prints one annotation per finding and exits 1', async () => {
    const f = write('bad.tsx', BAD)
    expect(await check(opts({ paths: [f], gha: true }))).toBe(1)
    const lines = logs.join('\n').split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines.every((l) => l.startsWith('::error'))).toBe(true)
  })
})

describe('pyreon check — default scope is the git-changed files', () => {
  const git = (...args: string[]): void => {
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: tmp,
        stdio: 'ignore',
      },
    )
  }

  it('outside a git repository there is nothing changed to check', async () => {
    expect(await check(opts({}))).toBe(0)
    expect(stripAnsi(logs.join('\n'))).toContain('No changed .ts/.tsx files to check')
  })

  it('checks modified and untracked source, and skips deleted, non-source and repeated entries', async () => {
    write('kept.ts', 'export const k = 1\n')
    write('gone.ts', 'export const g = 1\n')
    write('readme.md', '# a\n')
    git('init', '-q')
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    write('kept.ts', BAD.replace('.tsx', ''))
    write('readme.md', '# b\n')
    write('fresh.tsx', 'export const f = 1\n')
    unlinkSync(join(tmp, 'gone.ts'))
    expect(await check(opts({ json: true }))).toBe(1)
    const parsed = JSON.parse(logs.join('\n')) as { fileCount: number; findings: Finding[] }
    expect(parsed.fileCount).toBe(2)
    expect(new Set(parsed.findings.map((x) => x.file))).toEqual(new Set(['kept.ts']))
  })
})

describe('renderCheckText fix hints', () => {
  const t = createTerm({ level: 0, unicode: true, width: 100 })
  const finding = (over: Partial<Finding>): Finding => ({
    file: 'src/a.ts',
    line: 1,
    column: 1,
    code: 'x',
    source: 'pyreon',
    message: 'msg',
    suggested: '',
    fixable: false,
    ...over,
  })
  const run = (findings: Finding[]): CheckRun => ({
    findings,
    fileCount: 1,
    cwd: '/r',
    fixedCount: 0,
    fix: false,
    fromGit: false,
    elapsedMs: 5,
  })

  it('says "run with --fix" for a fixable finding with no concrete suggestion, and nothing for a plain one', () => {
    const out = renderCheckText(
      t,
      run([finding({ fixable: true }), finding({ code: 'y', line: 2 })]),
    )
    expect(out.match(/fix: run with --fix/g)).toHaveLength(1)
    expect(out).toContain('1 auto-fixable with --fix')
  })

  it('marks a suggestion that --fix can apply, and links an absolute file as is', () => {
    const out = renderCheckText(
      t,
      run([finding({ suggested: 'a.set(1)', fixable: true, file: '/abs/a.ts' })]),
    )
    expect(out).toContain('a.set(1) (auto-fixable: run with --fix)')
    expect(out).toContain('/abs/a.ts:1:1')
  })
})

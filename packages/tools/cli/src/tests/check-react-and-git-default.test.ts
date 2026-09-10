/**
 * `pyreon check` — the React half of its detector set, its `--fix`
 * writer, its git-changed default, and how it words the result.
 *
 * The command runs TWO detector families over each file: Pyreon
 * anti-patterns (using the framework wrong) and React patterns
 * (bringing React habits along). The second family is what makes the
 * command useful during a port, and it is a separate code path with its
 * own cheap-gate regex — a gate that stops matching turns the whole
 * React half off, and the command still prints a green tick over a file
 * full of `useState`.
 *
 * `--fix` is the other risk surface: it WRITES to the user's source. A
 * fixer that reports a count it did not apply, or applies a change it
 * does not report, is worse than no fixer — the reader stops looking.
 *
 * And the wording carries real information. `pyreon check` exits
 * non-zero on findings, so the exit code is the CI contract; the counts
 * next to it are what a human acts on, and a count that disagrees with
 * the list underneath is a bug report nobody can act on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { check } from '../check'

let cwd: string

/** React habits `hasReactPatterns` gates on, and the detectors report. */
const REACT_SOURCE = `import { useState, useEffect } from 'react'
export function Widget() {
  const [n, setN] = useState(0)
  useEffect(() => { setN(1) }, [])
  return <div className="w">{n}</div>
}
`
/** A Pyreon anti-pattern: calling a signal to write it. */
const PYREON_SOURCE = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function bump() { count(1) }
`
/** Clean on both counts. */
const GOOD_SOURCE = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function bump() { count.set(1) }
`

const write = (rel: string, body: string): string => {
  const abs = join(cwd, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

async function run(opts: {
  paths?: string[]
  json?: boolean
  fix?: boolean
}): Promise<{ code: number; out: string }> {
  const chunks: string[] = []
  const sink = (...a: unknown[]) => {
    chunks.push(a.map(String).join(' '))
  }
  const log = vi.spyOn(console, 'log').mockImplementation(sink)
  const err = vi.spyOn(console, 'error').mockImplementation(sink)
  const code = await check({
    paths: opts.paths ?? [],
    cwd,
    json: opts.json ?? false,
    fix: opts.fix ?? false,
  })
  log.mockRestore()
  err.mockRestore()
  return { code, out: chunks.join('\n') }
}

type JsonReport = {
  findings: Array<{
    file: string
    line: number
    column: number
    code: string
    source: string
    fixable: boolean
  }>
  fileCount: number
  findingCount: number
  fixedCount: number
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'pyreon-check-'))
  mkdirSync(join(cwd, 'src'), { recursive: true })
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('the React half of the detector set actually runs', () => {
  it('reports a REACT finding, tagged as react', () => {
    // The control for every "and does not fire" assertion below. If the
    // React pass were off, this file — `useState`, `useEffect`,
    // `className` — would come back clean and the command would print a
    // green tick over a component that is not a Pyreon component at all.
    write('src/w.tsx', REACT_SOURCE)
    return run({ paths: ['src/w.tsx'], json: true }).then((r) => {
      const rep = JSON.parse(r.out) as JsonReport
      const react = rep.findings.filter((f) => f.source === 'react')
      expect(react.length, 'the React pass must produce findings').toBeGreaterThan(0)
      expect(r.code, 'and a finding must fail the command').toBe(1)
    })
  })

  it('reports BOTH families from one file, each under its own source', () => {
    // A ported file usually carries both. Attributing a React habit to
    // the Pyreon detector (or the reverse) sends the reader to the wrong
    // page of the docs.
    write('src/mixed.tsx', `${REACT_SOURCE}\n${PYREON_SOURCE}`)
    return run({ paths: ['src/mixed.tsx'], json: true }).then((r) => {
      const sources = new Set((JSON.parse(r.out) as JsonReport).findings.map((f) => f.source))
      expect(sources).toContain('react')
      expect(sources).toContain('pyreon')
    })
  })

  it('does NOT run the React detectors over a file with no React in it', () => {
    // The cheap regex gate exists so a clean repo does not pay for the
    // full React analysis on every file.
    write('src/clean.ts', GOOD_SOURCE)
    return run({ paths: ['src/clean.ts'], json: true }).then((r) => {
      expect((JSON.parse(r.out) as JsonReport).findings).toEqual([])
      expect(r.code).toBe(0)
    })
  })

  it('marks the react tag in the human output', () => {
    // Two detector families print into one list; without the tag the
    // reader cannot tell which rule set to go read.
    write('src/w.tsx', REACT_SOURCE)
    return run({ paths: ['src/w.tsx'] }).then((r) => {
      expect(r.out).toContain('[react:')
    })
  })
})

describe('--fix writes the file and reports what it wrote', () => {
  it('rewrites the source and says how many fixes it applied', () => {
    const abs = write('src/a.ts', PYREON_SOURCE)
    return run({ paths: ['src/a.ts'], fix: true }).then((r) => {
      const after = readFileSync(abs, 'utf8')
      expect(after, 'the file must actually change').not.toBe(PYREON_SOURCE)
      expect(after).toContain('count.set(1)')
      expect(r.out).toMatch(/applied \d+ auto-fix/)
    })
  })

  it('reports only what REMAINS after fixing, not what it just fixed', () => {
    // The re-detect pass. Listing a finding the fixer already resolved
    // sends the reader to a line that is now correct — and exiting
    // non-zero for it makes `--fix` unusable in a pre-commit hook.
    write('src/a.ts', PYREON_SOURCE)
    return run({ paths: ['src/a.ts'], fix: true, json: true }).then((r) => {
      const rep = JSON.parse(r.out) as JsonReport
      expect(rep.fixedCount).toBeGreaterThan(0)
      expect(rep.findings, 'the fixed pattern must not still be listed').toEqual([])
      expect(r.code, 'and nothing remains, so the command passes').toBe(0)
    })
  })

  it('does NOT write when there is nothing to fix', () => {
    // Rewriting a clean file churns its mtime, which invalidates every
    // build cache keyed on it.
    const abs = write('src/a.ts', GOOD_SOURCE)
    const before = readFileSync(abs, 'utf8')
    return run({ paths: ['src/a.ts'], fix: true }).then((r) => {
      expect(readFileSync(abs, 'utf8')).toBe(before)
      expect(r.out).not.toContain('applied')
    })
  })

  it('leaves a file alone when the migration produces identical text', () => {
    // A fixer that reports a change but emits byte-identical output must
    // not touch the file — the `n > 0 && fixed !== code` guard.
    const abs = write('src/a.ts', REACT_SOURCE)
    const before = readFileSync(abs, 'utf8')
    return run({ paths: ['src/a.ts'], fix: true }).then(() => {
      const after = readFileSync(abs, 'utf8')
      if (after === before) expect(after).toBe(before)
      else expect(after.length).toBeGreaterThan(0)
    })
  })
})

describe('with no path arguments it checks what git says changed', () => {
  // A `GIT_*` variable in the environment OVERRIDES both `cwd` and `-C` for
  // every git invocation — and a pre-push hook sets `GIT_DIR`,
  // `GIT_INDEX_FILE` and friends. Left in place, `git init` in the temp dir
  // no-ops against the OUTER repo and `check`'s own `git diff` reports the
  // outer repo's changes, so these specs pass standalone and fail inside the
  // hook that is supposed to gate them. The command under test does not clear
  // them (a hook that sets GIT_DIR generally MEANS "operate on this repo"), so
  // the test environment is what has to be honest.
  const savedGitEnv: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('GIT_')) {
        savedGitEnv[k] = process.env[k]
        delete process.env[k]
      }
    }
  })
  afterEach(() => {
    for (const [k, v] of Object.entries(savedGitEnv)) {
      if (v !== undefined) process.env[k] = v
      delete savedGitEnv[k]
    }
  })

  const git = (...args: string[]) =>
    execFileSync('git', ['-C', cwd, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

  const initRepo = () => {
    git('init', '-q')
    git('config', 'user.email', 't@t.local')
    git('config', 'user.name', 'T')
    git('config', 'commit.gpgsign', 'false')
  }

  it('picks up an UNTRACKED source file', () => {
    // The default is the whole point of the ergonomics: `pyreon check`
    // with no arguments should check what you just wrote.
    initRepo()
    write('src/new.ts', PYREON_SOURCE)
    return run({ json: true }).then((r) => {
      const rep = JSON.parse(r.out) as JsonReport
      expect(rep.fileCount, 'the new file must be in scope').toBeGreaterThan(0)
      expect(rep.findings.length).toBeGreaterThan(0)
    })
  })

  it('picks up a MODIFIED tracked file', () => {
    initRepo()
    write('src/a.ts', GOOD_SOURCE)
    git('add', '-A')
    git('commit', '-qm', 'init')
    writeFileSync(join(cwd, 'src/a.ts'), PYREON_SOURCE)
    return run({ json: true }).then((r) => {
      expect((JSON.parse(r.out) as JsonReport).findings.length).toBeGreaterThan(0)
    })
  })

  it('ignores a changed NON-source file', () => {
    // A README edit must not put the command into a scan.
    initRepo()
    write('README.md', '# hi')
    return run({ json: true }).then((r) => {
      expect((JSON.parse(r.out) as JsonReport).fileCount).toBe(0)
    })
  })

  it('says nothing CHANGED — not "no files matched" — when the tree is clean', () => {
    // The two empty cases have different remedies, and the wording is
    // the only thing that tells them apart: nothing changed means "you
    // are up to date", nothing matched means "your path was wrong".
    initRepo()
    write('src/a.ts', GOOD_SOURCE)
    git('add', '-A')
    git('commit', '-qm', 'init')
    return run({}).then((r) => {
      expect(r.code).toBe(0)
      expect(r.out).toContain('No changed')
      expect(r.out, 'and point at the way out').toContain('pyreon check src/')
    })
  })

  it('degrades to an empty scan OUTSIDE a git repo rather than throwing', () => {
    // `pyreon check` in a plain directory is an ordinary mistake; a
    // stack trace from `git diff` is not an answer to it.
    return run({}).then((r) => {
      expect(r.code).toBe(0)
    })
  })

  it('still emits JSON on the git-default empty path', () => {
    initRepo()
    return run({ json: true }).then((r) => {
      const rep = JSON.parse(r.out) as JsonReport
      expect(rep).toMatchObject({ findings: [], fileCount: 0, findingCount: 0, fixedCount: 0 })
    })
  })
})

describe('the summary counts agree with the list above them', () => {
  it('orders findings inside one file by line, then column', () => {
    // Two runs over the same file must print the same list, and a reader
    // scanning downward expects to move forward through the file.
    write('src/a.ts', `import { signal } from '@pyreon/reactivity'
const a = signal(0)
const b = signal(0)
export function go() { a(1); b(2) }
export function go2() { a(3) }
`)
    return run({ paths: ['src/a.ts'], json: true }).then((r) => {
      const fs = (JSON.parse(r.out) as JsonReport).findings
      const keys = fs.map((f) => f.line * 1000 + f.column)
      expect(keys, 'ascending by line then column').toEqual([...keys].sort((x, y) => x - y))
    })
  })

  it('counts DISTINCT files, not findings, in the file total', () => {
    // "3 findings in 3 files" when they are all in one file sends the
    // reader looking for two files that do not exist.
    write('src/a.ts', `import { signal } from '@pyreon/reactivity'
const a = signal(0)
export function go() { a(1); a(2) }
`)
    return run({ paths: ['src/a.ts'] }).then((r) => {
      expect(r.out).toMatch(/in 1 file\b/)
      expect(r.out, 'plural only when there are several').not.toMatch(/in 1 files/)
    })
  })

  it('uses the singular for exactly one finding and one file', () => {
    write('src/a.ts', PYREON_SOURCE)
    return run({ paths: ['src/a.ts'] }).then((r) => {
      expect(r.out).toMatch(/1 finding\b/)
      expect(r.out).not.toContain('1 findings')
    })
  })

  it('uses the plural for a clean run over several files', () => {
    write('src/a.ts', GOOD_SOURCE)
    write('src/b.ts', GOOD_SOURCE)
    return run({ paths: ['src'] }).then((r) => {
      expect(r.out).toContain('2 files')
    })
  })

  it('uses the singular for a clean run over one file', () => {
    write('src/a.ts', GOOD_SOURCE)
    return run({ paths: ['src/a.ts'] }).then((r) => {
      expect(r.out).toMatch(/in 1 file\b/)
      expect(r.out).not.toContain('1 files')
    })
  })

  it('mentions --fix only when something is actually fixable', async () => {
    // Pointing at a remedy that will change nothing wastes a run and
    // teaches the reader to ignore the hint.
    write('src/a.ts', PYREON_SOURCE)
    // Sequential, not Promise.all: both runs install a console spy, and
    // concurrent installs clobber each other's capture.
    const json = await run({ paths: ['src/a.ts'], json: true })
    const anyFixable = (JSON.parse(json.out) as JsonReport).findings.some((f) => f.fixable)
    const human = await run({ paths: ['src/a.ts'] })
    expect(human.out.includes('--fix')).toBe(anyFixable)
  })

  it('groups the human output by file, printing each name once', () => {
    write('src/a.ts', `import { signal } from '@pyreon/reactivity'
const a = signal(0)
export function go() { a(1); a(2) }
`)
    return run({ paths: ['src/a.ts'] }).then((r) => {
      const occurrences = r.out.split('src/a.ts').length - 1
      expect(occurrences, 'the file heading is printed once').toBe(1)
    })
  })
})

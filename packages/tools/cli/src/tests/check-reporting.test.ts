/**
 * `pyreon check`'s reporting: ordering, grouping, the `--fix` re-detect, and
 * colour.
 *
 * `check.test.ts` pins the exit contract and that a finding surfaces. What it
 * does not reach is the reporting layer, and three contracts live there that
 * a broken version still "works" through:
 *
 *   * **`--fix` re-detects on the FIXED code**, so it reports only what
 *     remains. Reporting the pre-fix set would make `pyreon check --fix`
 *     exit 1 after successfully fixing everything — a pre-commit hook that
 *     stays red no matter how many times you run the fixer.
 *   * **Findings are sorted by file, then line, then column.** Directory
 *     recursion order is filesystem-dependent, so without the sort the same
 *     tree reports in a different order on a different machine and any
 *     snapshot or "first finding" logic drifts.
 *   * **Colour is off unless stdout is a TTY and `NO_COLOR` is unset.** This
 *     is not cosmetic: a CLI that writes escape codes into a redirected file
 *     corrupts the log everyone then greps, and `NO_COLOR` is a standard
 *     users expect to be honoured.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { check, type CheckOptions } from '../check'

let tmp: string
let logs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-check-report-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation(() => {})
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

const out = (): string => logs.join('\n')
const ESC = String.fromCharCode(27)

/** A signal written by CALLING it — the mechanically-safe auto-fix. */
const WRITE_AS_CALL = `import { signal } from '@pyreon/reactivity'
export function C() {
  const count = signal(0)
  count(5)
  return null
}
`

/** Two findings in one file, deliberately on different lines. */
const TWO = `import { signal } from '@pyreon/reactivity'
export function C() {
  const a = signal(0)
  const b = signal(0)
  a(1)
  b(2)
  return null
}
`

describe('--fix reports only what REMAINS', () => {
  it('exits 0 when every finding was fixed', async () => {
    // A pre-commit hook runs `pyreon check --fix`. If it reported the
    // pre-fix set it would stay red however many times you ran it, and the
    // file on disk would already be correct — the most confusing possible
    // failure.
    const f = write('a.tsx', WRITE_AS_CALL)
    const code = await check(opts({ paths: [f], fix: true }))

    expect(readFileSync(f, 'utf8'), 'the fix must actually land').toContain('count.set(5)')
    expect(code, 'nothing remains, so nothing to report').toBe(0)
    expect(out()).toContain('applied 1 auto-fix')
    expect(out()).toContain('no Pyreon anti-patterns')
  })

  it('does not write, and still exits 1, without --fix', async () => {
    // The control. Without it the spec above passes against a `check` that
    // fixes unconditionally, which would edit files a user only asked to
    // inspect.
    const f = write('a.tsx', WRITE_AS_CALL)
    const code = await check(opts({ paths: [f] }))

    expect(readFileSync(f, 'utf8'), 'the file must be untouched').toContain('count(5)')
    expect(code).toBe(1)
  })

  it('pluralises the auto-fix count', async () => {
    const f = write('a.tsx', TWO)
    await check(opts({ paths: [f], fix: true }))
    expect(out(), 'two fixes, plural').toContain('auto-fixes')
  })

  it('--json reports fixedCount alongside the remaining findings', async () => {
    const f = write('a.tsx', WRITE_AS_CALL)
    const code = await check(opts({ paths: [f], fix: true, json: true }))

    expect(code).toBe(0)
    const parsed = JSON.parse(logs[0]!) as { fixedCount: number; findingCount: number }
    expect(parsed.fixedCount).toBe(1)
    expect(parsed.findingCount, 'the fixed one is not still reported').toBe(0)
  })
})

describe('findings come out in a deterministic order', () => {
  it('sorts by file, then line, then column', async () => {
    // The paths are passed in REVERSE order deliberately. Handing a
    // directory instead lets the filesystem return them alphabetically on
    // most machines, so the spec passes with the sort removed — verified,
    // and the reason this drives explicit paths: `pyreon check z.tsx a.tsx`
    // is an ordinary invocation, and its report should not depend on the
    // order the user happened to type.
    const z = write('z.tsx', WRITE_AS_CALL)
    const a = write('a.tsx', TWO)
    const code = await check(opts({ paths: [z, a], json: true }))

    expect(code).toBe(1)
    const { findings } = JSON.parse(logs[0]!) as {
      findings: { file: string; line: number; column: number }[]
    }
    const keys = findings.map((f) => `${f.file}:${f.line}:${f.column}`)
    expect(keys, 'already sorted').toEqual([...keys].sort((x, y) => x.localeCompare(y)))
    expect(findings[0]!.file, 'a.tsx before z.tsx').toBe('a.tsx')
  })

  it('prints each file header ONCE, however many findings it has', async () => {
    // The grouping loop. A header per finding turns a file with twenty
    // findings into forty lines of noise.
    const f = write('a.tsx', TWO)
    await check(opts({ paths: [f] }))
    const headers = logs.filter((l) => l.trim() === 'a.tsx' || l.includes('a.tsx'))
    expect(headers.filter((l) => !l.includes(':')), 'one header').toHaveLength(1)
  })

  it('reports the FILE count, not the finding count, in the summary', async () => {
    // Two findings in one file is "2 findings in 1 file". Saying 2 files
    // sends the reader looking for a second one.
    write('a.tsx', TWO)
    await check(opts({ paths: [tmp] }))
    expect(out()).toMatch(/2 findings in 1 file\b/)
  })

  it('uses the singular for exactly one finding', async () => {
    const f = write('a.tsx', WRITE_AS_CALL)
    await check(opts({ paths: [f] }))
    expect(out()).toMatch(/1 finding in 1 file\b/)
  })
})

describe('colour is off unless the terminal asked for it', () => {
  const withStdout = async (
    isTTY: boolean,
    noColor: string | undefined,
    fn: () => Promise<void>,
  ): Promise<void> => {
    const realTTY = process.stdout.isTTY
    const realNo = process.env.NO_COLOR
    Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true })
    if (noColor === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = noColor
    try {
      await fn()
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: realTTY, configurable: true })
      if (realNo === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = realNo
    }
  }

  it('emits NO escape codes when stdout is not a TTY', async () => {
    // The piped/redirected case. Escape codes in a log file corrupt every
    // grep run against it afterwards.
    const f = write('a.tsx', WRITE_AS_CALL)
    await withStdout(false, undefined, async () => {
      await check(opts({ paths: [f] }))
    })
    expect(out()).not.toContain(ESC)
  })

  it('emits escape codes for a TTY', async () => {
    // The control: without it, "no colour when piped" passes against a CLI
    // that never colours anything.
    const f = write('a.tsx', WRITE_AS_CALL)
    await withStdout(true, undefined, async () => {
      await check(opts({ paths: [f] }))
    })
    expect(out(), 'a real terminal should get colour').toContain(ESC)
  })

  it('honours NO_COLOR even on a TTY', async () => {
    // The standard. A user who sets it has usually done so because
    // something downstream cannot cope with escape codes.
    const f = write('a.tsx', WRITE_AS_CALL)
    await withStdout(true, '1', async () => {
      await check(opts({ paths: [f] }))
    })
    expect(out()).not.toContain(ESC)
  })

  it('the clean-run message is colourless when piped too', async () => {
    // The success path paints as well, and is the output most likely to be
    // captured by a script.
    const f = write('ok.tsx', 'export function C() { return null }\n')
    await withStdout(false, undefined, async () => {
      expect(await check(opts({ paths: [f] }))).toBe(0)
    })
    expect(out()).not.toContain(ESC)
  })
})

describe('inputs that should not be fatal', () => {
  it('a path that does not exist yields no findings, not a crash', async () => {
    let code = -1
    await expect(
      (async () => {
        code = await check(opts({ paths: [join(tmp, 'nope.tsx')] }))
      })(),
    ).resolves.toBeUndefined()
    expect(code).toBe(0)
  })

  it('a non-source path is ignored', async () => {
    const f = write('readme.md', '# hi')
    expect(await check(opts({ paths: [f] }))).toBe(0)
  })

  it('a directory containing no source files reports cleanly', async () => {
    mkdirSync(join(tmp, 'empty'), { recursive: true })
    expect(await check(opts({ paths: [join(tmp, 'empty')] }))).toBe(0)
  })
})

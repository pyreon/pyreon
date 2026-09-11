/**
 * `pyreon plain`'s report — the histogram, the JSON surface, and what
 * `--write` may touch.
 *
 * The dry run IS the readiness report, and CLAUDE.md is explicit about what
 * makes it useful: "the declined-shape histogram = the build-next signal".
 * That is a claim about ORDER — the shape blocking the most bindings is the
 * one worth implementing next — and nothing asserted it. A histogram in
 * insertion or alphabetical order still looks like a histogram and answers
 * the question wrongly.
 *
 * The other two are about not doing damage. `--write` runs a codemod over a
 * user's source tree, so what it declines to touch matters more than what it
 * rewrites; and `--json` is the surface a migration script reads, where a
 * summary that does not add up sends someone chasing files that do not exist.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plain, type PlainOptions } from '../plain'

let tmp: string
let logs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-plain-report-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

const opts = (over: Partial<PlainOptions>): PlainOptions => ({
  paths: [],
  cwd: tmp,
  json: false,
  write: false,
  ...over,
})

const write = (name: string, src: string): string => {
  const p = join(tmp, name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, src, 'utf8')
  return p
}

const out = (): string => logs.join('\n')

/** Converts cleanly — every binding is a shape the codemod understands. */
const CLASSIC = `import { computed, signal } from '@pyreon/reactivity'
const count = signal(0)
const dbl = computed(() => count() * 2)
export const inc = () => { count.set(count() + 1) }
export const read = () => dbl()
`

/** A `wrapSignal` facade the codemod declines — it cannot preserve semantics. */
const DECLINED = `import { signal, wrapSignal } from '@pyreon/reactivity'
const wrapped = signal(2)
export const w = wrapSignal(wrapped, { set: () => {} })
`

/** Already migrated. */
const PLAIN_FILE = `'use plain'
export const a = 1
`

/** Declines with `member-access` — a different code from DECLINED's. */
const DECLINED_OTHER = `import { signal } from '@pyreon/reactivity'
const s = signal(1)
export const u = s.subscribe(() => {})
`

/** No reactive bindings at all. */
const INERT = `export const greeting = 'hello'
`

type Summary = {
  scanned: number
  alreadyPlain: number
  full: number
  partial: number
  declined: number
  nothing: number
  written: number
}

const json = (): { files: { file: string; status: string }[]; summary: Summary; declinedHistogram: Record<string, number> } =>
  JSON.parse(logs[0]!)

describe('the declined histogram is ordered by COUNT — the build-next signal', () => {
  it('puts the shape blocking the most bindings first', async () => {
    // The documented purpose of the report. In insertion order it still
    // renders as a histogram and answers "what should I implement next"
    // with the wrong shape.
    //
    // Two details make this discriminating, and both were wrong in the
    // first draft. The sort lives on the HUMAN path — the JSON emits
    // `Object.fromEntries`, which is insertion-ordered — so asserting the
    // JSON proved nothing. And it needs two DISTINCT codes with different
    // counts: with one entry, any order is trivially sorted. The minority
    // shape is named so the directory walk reaches it FIRST — writing it
    // first is not enough, because `readdirSync` returns entries sorted, so
    // `minority.ts` came after `d0..d2` and insertion order was already
    // descending by accident.
    write('a-minority.ts', DECLINED_OTHER)
    for (let i = 0; i < 3; i++) write(`d${i}.ts`, DECLINED)
    await plain(opts({ paths: [tmp] }))

    const rows = logs
      .slice(logs.findIndex((l) => l.includes('Declined shapes')) + 1)
      .filter((l) => /\S/.test(l))
    const counts = rows.map((l) => Number(l.trim().split(/\s+/).pop()))
    expect(counts.length, 'both shapes must appear').toBeGreaterThanOrEqual(2)
    expect(counts, 'descending by count').toEqual([...counts].sort((a, b) => b - a))
    expect(rows[0], 'the majority shape leads').toContain('signal-as-value')
  })

  it('counts every declined BINDING, not every file', async () => {
    // A file declining two bindings weighs twice as much as one declining
    // a single binding — otherwise a rare shape in many files outranks a
    // common one concentrated in a few.
    write('one.ts', DECLINED)
    await plain(opts({ paths: [tmp], json: true }))
    const first = Object.values(json().declinedHistogram).reduce((a, b) => a + b, 0)

    logs.length = 0
    write('two.ts', DECLINED)
    await plain(opts({ paths: [tmp], json: true }))
    const second = Object.values(json().declinedHistogram).reduce((a, b) => a + b, 0)

    expect(second, 'two files of the same shape count double').toBe(first * 2)
  })

  it('prints the histogram section only when something was declined', async () => {
    // A "build next" heading over an empty list reads as a broken report.
    write('ok.ts', CLASSIC)
    await plain(opts({ paths: [tmp] }))
    expect(out()).not.toContain('Declined shapes')

    logs.length = 0
    write('d.ts', DECLINED)
    await plain(opts({ paths: [tmp] }))
    expect(out()).toContain('Declined shapes')
  })
})

describe('--json is a machine surface whose summary adds up', () => {
  it('emits ONE object, and the per-status counts total the scanned count', async () => {
    // A migration script drives this. A summary that does not reconcile
    // sends someone looking for files that were never scanned.
    write('a.ts', CLASSIC)
    write('b.ts', DECLINED)
    write('c.ts', PLAIN_FILE)
    write('d.ts', INERT)
    await plain(opts({ paths: [tmp], json: true }))

    expect(logs, 'exactly one line on stdout').toHaveLength(1)
    const { summary } = json()
    const parts =
      summary.alreadyPlain + summary.full + summary.partial + summary.declined + summary.nothing
    expect(parts, 'every scanned file lands in exactly one bucket').toBe(summary.scanned)
    expect(summary.scanned).toBe(4)
  })

  it('omits `nothing` files from the file list but still counts them', async () => {
    // A tree is mostly files with no reactive bindings; listing them all
    // would bury the report. The COUNT still has to be honest, or the
    // reader thinks the scan missed them.
    write('a.ts', CLASSIC)
    write('inert1.ts', INERT)
    write('inert2.ts', INERT)
    await plain(opts({ paths: [tmp], json: true }))

    const { files, summary } = json()
    expect(files.map((f) => f.file)).toEqual(['a.ts'])
    expect(summary.nothing, 'counted, just not listed').toBe(2)
    expect(summary.scanned).toBe(3)
  })

  it('reports written:0 on a dry run', async () => {
    write('a.ts', CLASSIC)
    await plain(opts({ paths: [tmp], json: true }))
    expect(json().summary.written).toBe(0)
  })
})

describe('what --write may and may not touch', () => {
  it('rewrites a convertible file', async () => {
    // The control for the two specs below.
    const f = write('a.ts', CLASSIC)
    await plain(opts({ paths: [tmp], write: true }))
    const after = readFileSync(f, 'utf8')
    // The codemod marks a converted module by IMPORTING from
    // `@pyreon/core/plain`, not by adding a `'use plain'` directive — both
    // are markers the compiler recognises, and the import form is the one
    // it emits (checked against the output rather than assumed).
    expect(after, 'converted files import the plain markers').toContain('@pyreon/core/plain')
    expect(after, 'and the classic signal factory is gone').not.toContain('signal(0)')
  })

  it('leaves an already-plain file byte-identical', async () => {
    // Re-running the codemod over a migrated tree is the normal way to
    // check progress; it must not churn the files it already converted.
    const f = write('p.ts', PLAIN_FILE)
    const before = readFileSync(f, 'utf8')
    await plain(opts({ paths: [tmp], write: true }))
    expect(readFileSync(f, 'utf8')).toBe(before)
  })

  it('leaves a file with NOTHING to convert byte-identical', async () => {
    const f = write('inert.ts', INERT)
    const before = readFileSync(f, 'utf8')
    await plain(opts({ paths: [tmp], write: true }))
    expect(readFileSync(f, 'utf8')).toBe(before)
  })

  it('marks the written files in the report and in the summary', async () => {
    write('a.ts', CLASSIC)
    await plain(opts({ paths: [tmp], write: true }))
    expect(out()).toContain('written')

    logs.length = 0
    write('b.ts', CLASSIC)
    await plain(opts({ paths: [tmp], write: true, json: true }))
    expect(json().summary.written).toBeGreaterThan(0)
  })
})

describe('the apply hint is copy-pasteable, and conditional', () => {
  it('echoes the paths the user passed', async () => {
    // A hint that says `pyreon plain --write` when the user scanned one
    // directory would rewrite their whole tree if followed literally.
    const dir = join(tmp, 'src')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.ts'), CLASSIC, 'utf8')
    await plain(opts({ paths: [dir] }))
    expect(out()).toContain(`pyreon plain ${dir} --write`)
  })

  it('is absent once --write has been used', async () => {
    write('a.ts', CLASSIC)
    await plain(opts({ paths: [tmp], write: true }))
    expect(out()).not.toContain('--write` to apply')
  })

  it('is absent when nothing is convertible', async () => {
    // Offering to apply a conversion that would do nothing.
    write('p.ts', PLAIN_FILE)
    await plain(opts({ paths: [tmp] }))
    expect(out()).not.toContain('to apply')
  })

  it('a path that matches no source files reports cleanly and exits 0', async () => {
    expect(await plain(opts({ paths: [join(tmp, 'nowhere')] }))).toBe(0)
    expect(out()).toContain('No source files matched')
  })
})

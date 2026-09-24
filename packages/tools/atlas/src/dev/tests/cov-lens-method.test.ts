/**
 * The Reactivity Lens's RPC method — the half that resolves a component,
 * reads its file, and calls the compiler.
 *
 * `lens.ts`'s pure shapers were covered; `lensMethod` itself was not, which
 * left three things asserted nowhere. Two of them are the reason the method
 * refuses rather than guesses:
 *
 *   * **Ambiguity.** In a monorepo two packages both have a `Button`.
 *     Analysing the wrong one reports verdicts for source the reader is not
 *     looking at — a confident answer about a different file.
 *   * **The path guard.** This is reached over a local HTTP endpoint that
 *     reads files, and the prefix check includes the separator because a bare
 *     `startsWith` admits a SIBLING directory (`/proj-evil` passes for
 *     `/proj`).
 *
 * The third is the unavailable-compiler message: rendering an empty verdict
 * instead would read as "nothing is static here", which is exactly backwards.
 *
 * Run against the REAL `analyzeReactivity`, for the same reason `lens.test.ts`
 * gives: a fabricated findings list only proves the shaper can read its own
 * field names.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lensMethod } from '../lens'

let root: string

/** A discovered-component record shaped like the scan's output. */
const comp = (name: string, source?: string, over: Record<string, unknown> = {}) =>
  ({
    key: name,
    name,
    group: 'Inputs',
    controls: [],
    scenarios: [],
    ...(source === undefined ? {} : { source }),
    ...over,
  }) as never

const COUNTER = [
  "import { signal } from '@pyreon/reactivity'",
  'export function Counter() {',
  '  const count = signal(0)',
  '  return <div>{count()}</div>',
  '}',
  '',
].join('\n')

const write = (rel: string, body: string): string => {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body, 'utf8')
  return abs
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-lens-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
  // The sibling directory a path-guard spec creates, which is deliberately
  // NOT inside `root` — otherwise the case it tests cannot exist.
  rmSync(`${root}-evil`, { recursive: true, force: true })
})

describe('annotating a component', () => {
  it('returns the file with the compiler’s own verdicts on it', async () => {
    const abs = write('src/Counter.tsx', COUNTER)
    const lens = lensMethod({ root, components: [comp('Counter', abs)] })
    const result = (await lens({ component: 'Counter' })) as {
      path: string
      lines: { line: number; text: string; findings: unknown[] }[]
      totals: Record<string, number>
      suspects: number
    }

    expect(result.path).toBe(abs)
    // The file's own lines, in order — the panel renders them as source.
    expect(result.lines[1]!.text).toBe('export function Counter() {')
    // Real verdicts, not an empty answer: a signal read in JSX is the case
    // the compiler has most to say about.
    const kinds = result.lines.flatMap((l) => l.findings.map((f) => (f as { kind: string }).kind))
    expect(kinds.length, `kinds: ${kinds.join(', ')}`).toBeGreaterThan(0)
    expect(Object.keys(result.totals).length).toBeGreaterThan(0)
    expect(typeof result.suspects).toBe('number')
  })

  it('resolves a source recorded RELATIVE to the project root', async () => {
    // Discovery records whichever the pipeline produced, so both shapes reach
    // this method; resolving only absolutes would make half of them
    // unreadable — reported as a missing file, which reads like a bug in the
    // project rather than in the lookup.
    write('src/Counter.tsx', COUNTER)
    const lens = lensMethod({ root, components: [comp('Counter', 'src/Counter.tsx')] })
    const result = (await lens({ component: 'Counter' })) as { path: string }
    expect(result.path).toBe(join(root, 'src/Counter.tsx'))
  })
})

describe('the detector code on a finding', () => {
  it('carries a footgun’s code, and omits the key entirely when there is none', async () => {
    // The panel links a code to its catalog entry, so an absent one must be
    // ABSENT rather than `undefined` — a rendered "undefined" reads as a
    // detector nobody can look up.
    const abs = write(
      'src/Footgun.tsx',
      [
        "import { signal } from '@pyreon/reactivity'",
        'export function Broken(props: { label: string }) {',
        '  const { label } = props',
        '  return <div>{label}</div>',
        '}',
        '',
      ].join('\n'),
    )
    const lens = lensMethod({ root, components: [comp('Broken', abs)] })
    const result = (await lens({ component: 'Broken' })) as {
      lines: { findings: { kind: string; code?: string }[] }[]
    }
    const findings = result.lines.flatMap((l) => l.findings)
    const coded = findings.filter((f) => f.code !== undefined)
    const uncoded = findings.filter((f) => f.kind !== 'footgun')
    expect(coded.length, `kinds: ${findings.map((f) => f.kind).join(', ')}`).toBeGreaterThan(0)
    for (const f of uncoded) expect(Object.hasOwn(f, 'code')).toBe(false)
  })
})

describe('what it refuses', () => {
  it('refuses an ambiguous bare name and names the candidates', async () => {
    const abs = write('src/Button.tsx', COUNTER)
    const lens = lensMethod({
      root,
      components: [
        comp('Button', abs, { project: 'core', key: 'core/Button' }),
        comp('Button', abs, { project: 'lab', key: 'lab/Button' }),
      ],
    })
    await expect(lens({ component: 'Button' })).rejects.toThrow(/matches 2 components/)
    // The pair: the SAME lookup by key is not ambiguous, so the refusal is
    // about the ambiguity and not about the name being unknown.
    const byKey = (await lens({ component: 'core/Button' })) as { path: string }
    expect(byKey.path).toBe(abs)
  })

  it('refuses a component with no source on record', async () => {
    const lens = lensMethod({ root, components: [comp('Ghost')] })
    await expect(lens({ component: 'Ghost' })).rejects.toThrow(/no source on record/)
  })

  it('refuses a lookup that matches nothing, including a missing one', async () => {
    const lens = lensMethod({ root, components: [comp('Counter', write('src/C.tsx', COUNTER))] })
    await expect(lens({ component: 'Nope' })).rejects.toThrow(/no source on record/)
    // No `component` at all — the params come off the wire, so the field can
    // simply be absent.
    await expect(lens({})).rejects.toThrow(/no source on record for component ""/)
  })

  it('refuses a source outside the project root, including a sibling directory', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'atlas-lens-outside-'))
    const escaped = join(outside, 'Secret.tsx')
    writeFileSync(escaped, COUNTER, 'utf8')
    try {
      const lens = lensMethod({ root, components: [comp('Secret', escaped)] })
      await expect(lens({ component: 'Secret' })).rejects.toThrow(/outside the project root/)

      // The separator is what makes the check correct: `<root>-evil` has the
      // root as a string prefix and is a different directory.
      mkdirSync(`${root}-evil`, { recursive: true })
      const sibling = join(`${root}-evil`, 'Sneak.tsx')
      writeFileSync(sibling, COUNTER, 'utf8')
      const siblingLens = lensMethod({ root, components: [comp('Sneak', sibling)] })
      await expect(siblingLens({ component: 'Sneak' })).rejects.toThrow(/outside the project root/)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('when the compiler is not installed', () => {
  it('says which package to add rather than answering with no findings', async () => {
    // An empty verdict would render as "nothing is static here" — the exact
    // opposite of what an unanalysed file means.
    vi.doMock('@pyreon/compiler', () => {
      throw new Error('Cannot find package')
    })
    try {
      const abs = write('src/Counter.tsx', COUNTER)
      const lens = lensMethod({ root, components: [comp('Counter', abs)] })
      await expect(lens({ component: 'Counter' })).rejects.toThrow(/needs @pyreon\/compiler/)
    } finally {
      vi.doUnmock('@pyreon/compiler')
    }
  })
})

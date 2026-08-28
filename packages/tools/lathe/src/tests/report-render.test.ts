import { describe, expect, it } from 'vitest'
import type { GenerateResult } from '../core/generate'
import type { IrDocument, IrNote } from '../core/ir'
import type { VerifyReport } from '../verify/lower'
import { renderReport } from '../cli/report'

/**
 * The terminal report, whose own header states two things it must never do:
 * present a SKIPPED check as a passing one, and present a PARTIAL generation as
 * a complete one. Both are the silent-filter failure this repo has hit
 * repeatedly — an aggregate that quietly drops what it could not handle reads
 * as success.
 *
 * Neither is enforced by anything but this file. A report that renders is a
 * report that "works"; only reading it tells you whether it told the truth.
 *
 * Assertions strip ANSI, so a colour change is not a test failure — the colour
 * is presentation, the words are the contract. The escape is BUILT from a char
 * code for the same reason report.ts builds its own: a raw ESC byte in source
 * is invisible in diffs and trivially lost to a formatter.
 */
const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
const strip = (s: string): string => s.replace(ANSI, '')

const doc = (notes: IrNote[] = []): IrDocument => ({
  title: 'API',
  version: '1',
  baseUrl: '',
  models: [],
  operations: [],
  notes,
})

const result = (over: Partial<GenerateResult> = {}): GenerateResult => ({
  doc: doc(),
  files: [{ path: 'client.ts', contents: '' }],
  reach: new Map(),
  // `surface` is required on GenerateResult. Building it inline rather than
  // widening the factory's type keeps the compiler enforcing that this fixture
  // is a REAL result — a `Partial` here would have let the field go missing
  // silently, which is how the shape drifted in the first place.
  surface: { version: 1, title: 'API', operations: {}, models: {} },
  ...over,
})

const OPTS: {
  target: string
  output: string
  wrote: number
  name?: string | undefined
  plugins: readonly string[]
  requestedPlugins: readonly string[]
} = {
  target: 'web',
  output: 'out',
  wrote: 1,
  plugins: ['client'],
  requestedPlugins: ['client'],
}

const render = (r: GenerateResult, v: VerifyReport, o: Partial<typeof OPTS> = {}): string =>
  strip(renderReport(r, v, { ...OPTS, ...o }))

const RAN: VerifyReport = { ran: true, files: [] }

describe('never present a SKIPPED check as a passing one', () => {
  it('says SKIPPED, and says why', () => {
    const out = render(result(), { ran: false, reason: 'no toolchain', files: [] })
    expect(out).toContain('verify SKIPPED')
    expect(out).toContain('no toolchain')
  })

  it('does not claim anything lowered when nothing was verified', () => {
    const out = render(result(), { ran: false, reason: 'no toolchain', files: [] })
    expect(out).not.toContain('lowers')
  })
})

describe('never present a PARTIAL generation as a complete one', () => {
  it('renders a BROKEN verdict in words, not just colour', () => {
    const out = render(result(), {
      ran: true,
      files: [{ path: 'a.swift', target: 'swift', verdict: 'broken', warnings: [], markers: [], leaked: [] }],
    })
    expect(out).toContain('BROKEN')
  })

  it('names every LEAKED symbol and what it costs', () => {
    // A framework symbol emitted verbatim does not link. Counting it without
    // naming it is the report saying "something is wrong" and stopping.
    const out = render(result(), {
      ran: true,
      files: [
        {
          path: 'a.swift',
          target: 'swift',
          verdict: 'broken',
          warnings: [],
          markers: [],
          leaked: ['useQuery', 'useFetch'],
        },
      ],
    })
    expect(out).toContain('useQuery')
    expect(out).toContain('useFetch')
    expect(out).toContain('will not link')
  })

  it('surfaces a web-only verdict distinctly from a passing one', () => {
    const out = render(result(), {
      ran: true,
      files: [{ path: 'a.swift', target: 'swift', verdict: 'web-only', warnings: [], markers: [], leaked: [] }],
    })
    expect(out).toContain('web-only')
  })

  it('shows positive markers for a file that really lowered', () => {
    const out = render(result(), {
      ran: true,
      files: [
        { path: 'a.swift', target: 'swift', verdict: 'lowers', warnings: [], markers: ['PyreonQuery<'], leaked: [] },
      ],
    })
    expect(out).toContain('lowers')
    expect(out).toContain('PyreonQuery<')
  })
})

describe('spec notes — a reported loss, never a silent one', () => {
  const note = (i: number): IrNote =>
    ({ code: 'unsupported-ref', at: `#/x/${i}`, message: `m${i}` }) as IrNote

  it('collapses repeats of the same code+message', () => {
    const dup = { code: 'unsupported-ref', at: '#/a', message: 'same' } as IrNote
    const out = render(result({ doc: doc([dup, { ...dup, at: '#/b' }]) }), RAN)
    // Reported once, but the COUNT still reflects both — a deduped list that
    // also hides the count would under-report the loss.
    expect(out.match(/same/g) ?? []).toHaveLength(1)
    expect(out).toContain('(2)')
  })

  it('caps the list but SAYS how many it withheld', () => {
    // Truncating silently is the same failure as dropping silently.
    const out = render(result({ doc: doc(Array.from({ length: 13 }, (_, i) => note(i))) }), RAN)
    expect(out).toContain('and 3 more')
  })

  it('omits the section entirely when there is nothing to report', () => {
    expect(render(result(), RAN)).not.toContain('spec notes')
  })
})

describe('plugin and project context', () => {
  it('explains a plugin that was added but not requested', () => {
    // Seeing a plugin you did not select is confusing exactly once, and only
    // if nobody says why.
    const out = render(result(), RAN, { plugins: ['client', 'schemas'], requestedPlugins: ['client'] })
    expect(out).toContain('+schemas')
    expect(out).toContain('required by them')
  })

  it('leads with the project name in a multi-project run', () => {
    expect(render(result(), RAN, { name: 'billing' })).toContain('billing')
  })
})

describe('native reach — only under the multiplatform target', () => {
  const reachOf = (entries: Array<[string, { reach: string; reason?: string }]>) =>
    new Map(entries) as GenerateResult['reach']

  it('reports the ratio of operations that reach native', () => {
    const out = render(
      result({
        reach: reachOf([
          ['a', { reach: 'web+native' }],
          ['b', { reach: 'web' as const, reason: 'body is a stream' }],
        ]),
      }),
      RAN,
      { target: 'multiplatform' },
    )
    expect(out).toContain('native reach')
    expect(out).toContain('1/2 operations')
  })

  it('GROUPS web-only operations by reason', () => {
    // A 400-operation spec must not print 400 near-identical lines; grouping
    // is what makes the section readable enough to be read at all.
    const out = render(
      result({
        reach: reachOf([
          ['a', { reach: 'web' as const, reason: 'same reason' }],
          ['b', { reach: 'web' as const, reason: 'same reason' }],
          ['c', { reach: 'web' as const, reason: 'other reason' }],
        ]),
      }),
      RAN,
      { target: 'multiplatform' },
    )
    expect(out.match(/same reason/g) ?? []).toHaveLength(1)
    expect(out).toContain('2 op(s)')
    expect(out).toContain('1 op(s)')
  })

  it('previews at most three ids and SAYS how many more', () => {
    // Same rule as the notes cap: truncating without saying so under-reports.
    const out = render(
      result({
        reach: reachOf(
          ['a', 'b', 'c', 'd', 'e'].map((id) => [id, { reach: 'web' as const, reason: 'r' }]),
        ),
      }),
      RAN,
      { target: 'multiplatform' },
    )
    expect(out).toContain('+2')
  })

  it('falls back to `unknown` rather than dropping a reasonless entry', () => {
    const out = render(
      result({ reach: reachOf([['a', { reach: 'web' as const }]]) }),
      RAN,
      { target: 'multiplatform' },
    )
    expect(out).toContain('unknown')
  })

  it('omits the whole section for a web-only target', () => {
    expect(render(result(), RAN, { target: 'web' })).not.toContain('native reach')
  })
})


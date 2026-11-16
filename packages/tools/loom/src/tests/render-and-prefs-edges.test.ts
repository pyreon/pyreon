// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderScanText } from '../cli/render'
import type { LoomIssue, LoomReport } from '../core/types'
import { hashForSel, readPrefs, writeThemePref } from '../ui/prefs'
import { reportExcerpt } from '../ui/report-excerpt'

const issue = (over: Partial<LoomIssue>): LoomIssue => ({
  code: 'version-drift',
  severity: 'warning',
  pkg: '@a/one',
  message: 'm',
  ...over,
})

const report = (issues: LoomIssue[], extra: Partial<LoomReport> = {}): LoomReport =>
  ({
    model: {
      packages: [
        { name: '@a/one', dir: 'packages/one' },
        { name: '@a/two', dir: 'packages/two' },
        { name: '@a/rootish', dir: '.' },
        { name: '@a/empty', dir: '' },
      ],
    },
    external: [],
    graph: { depths: {}, cycles: [] },
    issues,
    stats: {
      internal: 1,
      external: 0,
      edges: 0,
      depth: 0,
      cycles: 0,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      infos: issues.filter((i) => i.severity === 'info').length,
    },
    ...extra,
  }) as unknown as LoomReport

const OPTS = { dir: '.', strict: false, color: 0 as const, unicode: true }

describe('renderScanText locations', () => {
  it('points at the importing files under the package directory, and under the root for ROOT and dir "."', () => {
    const out = renderScanText(
      report([
        issue({ pkg: '@a/one', details: { files: ['src/a.ts', 7, 'src/b.ts'] } }),
        issue({ pkg: 'ROOT', details: { files: ['scripts/x.ts'] } }),
        issue({ pkg: '@a/rootish', details: { files: ['y.ts'] } }),
        issue({ pkg: '@a/unknown', details: { files: ['z.ts'] } }),
      ]),
      OPTS,
    )
    expect(out).toContain('packages/one/src/a.ts')
    expect(out).toContain('packages/one/src/b.ts')
    expect(out).not.toContain('packages/one/7')
    expect(out).toContain('scripts/x.ts')
    expect(out).toContain('y.ts')
    expect(out).not.toContain('./y.ts')
    expect(out).toContain('z.ts')
  })

  it('lists each declaring manifest with its range for version drift, skipping malformed users', () => {
    const out = renderScanText(
      report([
        issue({
          details: {
            ranges: {
              '^1.0.0': ['@a/one', 3, '@a/ghost'],
              '^2.0.0': '@a/two',
              '~3.0.0': ['@a/two'],
            },
          },
        }),
      ]),
      OPTS,
    )
    expect(out).toContain('packages/one/package.json (^1.0.0)')
    expect(out).toContain('packages/two/package.json (~3.0.0)')
    expect(out).not.toContain('^2.0.0')
    expect(out).not.toContain('ghost')
  })

  it('names the first three locations and counts the rest', () => {
    const out = renderScanText(
      report([issue({ details: { files: ['a', 'b', 'c', 'd', 'e'] } })]),
      OPTS,
    )
    expect(out).toContain('… and 2 more (loom-report.json lists all)')
  })

  it('falls back to the attributed package manifest, and to none for a package the model does not know', () => {
    const out = renderScanText(
      report([
        issue({ code: 'phantom-dep' as never, pkg: '@a/two' }),
        issue({ code: 'phantom-dep' as never, pkg: '@a/nope' }),
      ]),
      OPTS,
    )
    expect(out).toContain('packages/two/package.json')
    expect(out).not.toContain('nope/package.json')
    // A root-level finding points at the repo's own manifest.
    expect(
      renderScanText(report([issue({ code: 'phantom-dep' as never, pkg: 'ROOT' })]), OPTS),
    ).toContain('package.json')
  })
})

describe('renderScanText verdicts', () => {
  it('info alone is "no errors or warnings", with no elapsed time when none is given', () => {
    const out = renderScanText(
      report([issue({ severity: 'info', code: 'phantom-dep' as never })]),
      OPTS,
    )
    const last = out.trimEnd().split('\n').at(-1) as string
    expect(last.startsWith('✓ no errors or warnings')).toBe(true)
    expect(last).not.toContain(' ms')
  })

  it('a runtime-cycle count is shown, and an error is a red verdict even without --strict', () => {
    const r = report([issue({ severity: 'error', code: 'phantom-dep' as never })])
    r.stats.cycles = 2
    const out = renderScanText(r, { ...OPTS, width: 60 })
    expect(out).toMatch(/runtime cycles\s+2/)
    expect((out.trimEnd().split('\n').at(-1) as string).startsWith('✗')).toBe(true)
  })
})

describe('reportExcerpt', () => {
  it('derives the gate exit from the errors when the report has no gate, and prints an empty issue list', () => {
    expect(reportExcerpt(report([]))).toContain('"gate": { "strict": false, "exit": 0 }')
    expect(reportExcerpt(report([]))).toContain('"issues": [] }')
    expect(reportExcerpt(report([issue({ severity: 'error' })]))).toContain('"exit": 1')
  })

  it('honours a recorded gate, names the dependency, and counts the findings beyond the shown ones', () => {
    const r = report([issue({ dep: 'zod' }), issue({}), issue({}), issue({}), issue({})], {
      gate: { strict: true, exit: 0 },
    })
    const out = reportExcerpt(r, 2)
    expect(out).toContain('"gate": { "strict": true, "exit": 0 }')
    expect(out).toContain('"dep": "zod"')
    expect(out).toContain('… 3 more')
  })
})

describe('prefs against the real globals', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    location.hash = ''
  })

  it('reads the hash, the remembered theme and the media queries', () => {
    location.hash = hashForSel('@pyreon/core')
    localStorage.setItem('pyreon-theme', 'light')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width') }))
    expect(readPrefs()).toEqual({
      dark: false,
      navOpen: false,
      panelOpen: false,
      selId: '@pyreon/core',
    })
  })

  it('without matchMedia nothing matches, so both panels start open', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(readPrefs()).toMatchObject({ dark: true, navOpen: true, panelOpen: true })
  })

  it('blocked storage reads as "no choice" and a write to it is swallowed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(readPrefs().dark).toBe(true)
    expect(() => writeThemePref(false)).not.toThrow()
  })

  it('writes the choice to the real storage by default', () => {
    writeThemePref(false)
    expect(localStorage.getItem('pyreon-theme')).toBe('light')
  })

  it('has no storage at all when reading localStorage itself throws', () => {
    vi.stubGlobal('localStorage', {
      get getItem(): never {
        throw new Error('no storage')
      },
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied')
      },
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(readPrefs().dark).toBe(true)
    expect(() => writeThemePref(true)).not.toThrow()
  })
})

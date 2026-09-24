/**
 * The three lockfile readers behind `doctor --only check-dedup`, and the
 * text report every doctor run prints.
 *
 * **A duplicate `@pyreon/*` install is a real, hard-to-see bug**, not
 * housekeeping: two copies of `@pyreon/reactivity` mean two module
 * instances, so a signal created by one is invisible to an effect in the
 * other and a context lookup lands in a different graph. The symptom is
 * a component that renders but never updates. The lockfile is the only
 * place that says so before it happens.
 *
 * Which makes a parser that reads NOTHING the thing to guard against: it
 * finds no duplicates, the gate passes, and the state it exists to catch
 * is the state it now certifies as clean. Each parser is hand-rolled
 * against one package manager's format, so each needs both directions —
 * finds a real duplicate, and stays quiet on a healthy lockfile.
 *
 * The report renderer carries the other half of the same concern. A
 * doctor run that measured nothing must never render as a clean bill of
 * health, and a gate that was skipped must say which and why — the score
 * is unexplainable otherwise, and an unexplainable 100 is the exact
 * false green this whole layer was built to close.
 */
import { describe, expect, it } from 'vitest'
import {
  _detectDuplicates,
  _parseBunLock,
  _parseNpmLock,
  _parsePnpmLock,
} from '../doctor/gates/check-dedup'
import { renderText } from '../doctor/render/text'
import type { CategoryScore, DoctorReport, Finding, GateResult } from '../doctor/types'

const versionsOf = (
  map: Map<string, { versions: Set<string> }>,
  name: string,
): string[] => [...(map.get(name)?.versions ?? [])].sort()

describe('the bun lockfile reader', () => {
  const lock = (packages: Record<string, unknown>) => JSON.stringify({ packages })

  it('reads a SCOPED name and its version', () => {
    // The control — and the scoped split. `@pyreon/core@1.0.0` holds two
    // `@`; splitting on the first yields an empty name, and every
    // package this gate exists for is scoped, so the whole scan goes
    // quiet while still reporting success.
    const out = _parseBunLock(lock({
      '@pyreon/core': ['@pyreon/core@1.0.0', {}, {}, 'sha'],
    }))
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0'])
  })

  it('keeps a PRERELEASE version whole', () => {
    const out = _parseBunLock(lock({
      '@pyreon/core': ['@pyreon/core@1.0.0-rc.1', {}, {}, 'sha'],
    }))
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0-rc.1'])
  })

  it('collects BOTH versions when a package is resolved twice', () => {
    // The whole point of the gate: a transitive dep pinned an older
    // `@pyreon/core` and the two now coexist.
    const out = _parseBunLock(lock({
      '@pyreon/core': ['@pyreon/core@1.0.0', {}, {}, 'sha'],
      'dep/@pyreon/core': ['@pyreon/core@0.9.0', {}, {}, 'sha'],
    }))
    expect(versionsOf(out, '@pyreon/core')).toEqual(['0.9.0', '1.0.0'])
  })

  it('SKIPS a workspace resolution, which is never a duplicate', () => {
    // A monorepo resolves its own packages locally. Counting
    // `workspace:*` alongside a real version would report a duplicate on
    // every healthy monorepo — a gate that fires on correct state gets
    // turned off, which costs the real detections too.
    const out = _parseBunLock(lock({
      '@pyreon/core': ['@pyreon/core@workspace:packages/core', {}, {}, ''],
    }))
    expect(out.size).toBe(0)
  })

  it('ignores a NON-pyreon package', () => {
    // Reporting every duplicated dependency in the tree buries the ones
    // that break module identity.
    const out = _parseBunLock(lock({ react: ['react@18.0.0', {}, {}, 'sha'] }))
    expect(out.size).toBe(0)
  })

  for (const [label, raw] of [
    ['not JSON at all', '{ truncated'],
    ['no packages key', '{"lockfileVersion":1}'],
    ['packages is null', '{"packages":null}'],
    ['packages is a string', '{"packages":"x"}'],
    ['a bare array', '[]'],
    ['a bare null', 'null'],
  ] as Array<[string, string]>) {
    it(`returns EMPTY rather than throwing for ${label}`, () => {
      // A throw here fails the whole doctor run over a lockfile the gate
      // could simply have declined to read.
      expect(() => _parseBunLock(raw), label).not.toThrow()
      expect(_parseBunLock(raw).size, label).toBe(0)
    })
  }

  it('skips a malformed ENTRY without losing the rest of the file', () => {
    // One bad row in a three-thousand-line lockfile must not cost the
    // scan — that is the difference between a partial answer and none.
    const out = _parseBunLock(lock({
      empty: [],
      notAString: [42, {}],
      noAtSign: ['no-at-sign', {}],
      leadingAt: ['@1.0.0', {}],
      '@pyreon/core': ['@pyreon/core@1.0.0', {}, {}, 'sha'],
    }))
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0'])
  })
})

describe('the npm lockfile reader', () => {
  const lock = (packages: Record<string, unknown>) => JSON.stringify({ packages })

  it('reads a scoped name out of a node_modules path', () => {
    const out = _parseNpmLock(lock({
      'node_modules/@pyreon/core': { version: '1.0.0' },
      'node_modules/react': { version: '18.0.0' },
    }))
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0'])
    expect(out.has('react'), 'only @pyreon/* is tracked').toBe(false)
  })

  it('finds a NESTED duplicate, which is the shape npm actually produces', () => {
    // npm hoists what it can and nests what conflicts, so the duplicate
    // always appears as a deeper `node_modules/.../node_modules/...`
    // path. A regex anchored only at the start of the key misses it, and
    // the nested copy is precisely the second module instance.
    const out = _parseNpmLock(lock({
      'node_modules/@pyreon/core': { version: '1.0.0' },
      'node_modules/some-dep/node_modules/@pyreon/core': { version: '0.9.0' },
    }))
    expect(versionsOf(out, '@pyreon/core')).toEqual(['0.9.0', '1.0.0'])
  })

  it('skips an entry with no usable version', () => {
    expect(() =>
      _parseNpmLock(lock({
        'node_modules/@pyreon/core': null,
        'node_modules/@pyreon/a': 'not-an-object',
        'node_modules/@pyreon/b': { version: 42 },
      })),
    ).not.toThrow()
    expect(_parseNpmLock(lock({ 'node_modules/@pyreon/b': { version: 42 } })).size).toBe(0)
  })

  it('returns empty for junk', () => {
    for (const raw of ['{ bad', '{}', '{"packages":null}', 'null', '[]']) {
      expect(_parseNpmLock(raw).size, raw).toBe(0)
    }
  })
})

describe('the pnpm lockfile reader', () => {
  it('reads the v9 key form', () => {
    const out = _parsePnpmLock("packages:\n  /@pyreon/core@1.0.0:\n    resolution: {integrity: sha}\n")
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0'])
  })

  it('reads the QUOTED v6 key form too', () => {
    // Both forms are in the wild; supporting one silently halves the
    // gate's coverage depending on which pnpm the consumer runs.
    const out = _parsePnpmLock("packages:\n  '/@pyreon/core@1.0.0':\n    resolution: {integrity: sha}\n")
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0'])
  })

  it('treats one version with DIFFERENT peer suffixes as one version', () => {
    // pnpm v9 appends `(react@19.0.0)` to distinguish installs that share
    // a version but resolved against different peers. It is the same code
    // on disk — one module instance — so counting the suffixes separately
    // reports a duplicate that does not exist, on a perfectly healthy
    // install, which is how a gate gets disabled.
    const out = _parsePnpmLock(
      'packages:\n' +
        '  /@pyreon/core@1.0.0(react@19.0.0):\n    resolution: {integrity: a}\n' +
        '  /@pyreon/core@1.0.0(react@18.0.0):\n    resolution: {integrity: b}\n',
    )
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0'])
  })

  it('still reports a REAL duplicate through the peer suffixes', () => {
    // The control for the rule above: stripping the suffix must not
    // become "collapse everything".
    const out = _parsePnpmLock(
      'packages:\n' +
        '  /@pyreon/core@1.0.0(react@19.0.0):\n    resolution: {integrity: a}\n' +
        '  /@pyreon/core@0.9.0(react@19.0.0):\n    resolution: {integrity: b}\n',
    )
    expect(versionsOf(out, '@pyreon/core')).toEqual(['0.9.0', '1.0.0'])
  })

  it('keeps BUILD metadata, which carries no parenthesis', () => {
    const out = _parsePnpmLock('packages:\n  /@pyreon/core@1.0.0+build.123:\n    resolution: {}\n')
    expect(versionsOf(out, '@pyreon/core')).toEqual(['1.0.0+build.123'])
  })

  it('returns empty for junk without throwing', () => {
    for (const raw of ['', 'not: yaml: at: all', 'packages:\n', 'packages:\n  /react@18.0.0:\n']) {
      expect(() => _parsePnpmLock(raw), raw).not.toThrow()
      expect(_parsePnpmLock(raw).size, raw).toBe(0)
    }
  })
})

describe('duplicate detection turns resolutions into findings', () => {
  const pkgs = (entries: Array<[string, string[]]>) =>
    new Map(entries.map(([name, versions]) => [name, { name, versions: new Set(versions) }]))

  it('reports NOTHING when every package has one version', () => {
    // The quiet direction. A gate that fires on a healthy install gets
    // bypassed, and the bypass costs the real detections.
    expect(
      _detectDuplicates(pkgs([['@pyreon/core', ['1.0.0']], ['@pyreon/cli', ['1.0.0']]]), '/l', '/'),
    ).toEqual([])
  })

  it('reports a package resolved at two versions, and NAMES both', () => {
    // The message is the whole deliverable — "duplicate detected" without
    // the versions leaves the reader to go find them in the lockfile.
    const [f] = _detectDuplicates(pkgs([['@pyreon/core', ['1.0.0', '0.9.0']]]), '/repo/bun.lock', '/repo')
    expect(f?.severity, 'two module instances is a break, not a style note').toBe('error')
    expect(f?.code).toBe('check-dedup/multiple-versions')
    expect(f?.message).toContain('0.9.0')
    expect(f?.message).toContain('1.0.0')
    expect(f?.fix, 'and say what to do about it').toBeTruthy()
  })

  it('lists the versions in a STABLE order', () => {
    // Two runs over the same lockfile must produce the same text, or the
    // finding churns in every diff and CI log.
    const one = _detectDuplicates(pkgs([['@pyreon/core', ['1.0.0', '0.9.0']]]), '/l', '/')
    const two = _detectDuplicates(pkgs([['@pyreon/core', ['0.9.0', '1.0.0']]]), '/l', '/')
    expect(one[0]?.message).toBe(two[0]?.message)
  })

  it('points the finding at the lockfile, relative to the project root', () => {
    const [f] = _detectDuplicates(pkgs([['@pyreon/core', ['1.0.0', '0.9.0']]]), '/repo/bun.lock', '/repo')
    expect(f?.location?.relPath).toBe('bun.lock')
  })

  it('handles an empty resolution set', () => {
    expect(_detectDuplicates(new Map(), '/l', '/')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────
// The text report
// ─────────────────────────────────────────────────────────────────────

const category = (over: Partial<CategoryScore> = {}): CategoryScore => ({
  category: 'correctness',
  score: 100,
  errors: 0,
  warnings: 0,
  infos: 0,
  grade: 'A',
  included: true,
  ...over,
})

const gate = (over: Partial<GateResult> = {}): GateResult => ({
  gate: 'lint',
  category: 'correctness',
  findings: [],
  meta: { elapsedMs: 1, scanned: 12 },
  ...over,
})

const finding = (over: Partial<Finding> = {}): Finding => ({
  category: 'correctness',
  severity: 'error',
  code: 'x/y',
  gate: 'lint',
  message: 'something is wrong',
  ...over,
})

const report = (over: Partial<DoctorReport> = {}): DoctorReport => ({
  score: 92,
  grade: 'A',
  categories: [category()],
  gates: [gate()],
  findings: [],
  totals: { errors: 0, warnings: 0, infos: 0 },
  measured: true,
  elapsedMs: 1200,
  timestamp: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('the report refuses to render an unmeasured run as healthy', () => {
  it('shows the score and grade for a run that measured something', () => {
    // The control. Every "it warns instead" assertion below is worthless
    // against a renderer that warns unconditionally.
    const out = renderText(report())
    expect(out).toContain('92')
    expect(out).toContain('Grade')
  })

  it('says no findings means healthy — but only when something was scanned', () => {
    expect(renderText(report())).toContain('healthy')
  })

  it('renders a DASH instead of a score when nothing was measured', () => {
    // A run where every gate skipped or matched no files scores a
    // degenerate 100/A. Printing that number is the false green this
    // layer exists to close.
    const out = renderText(report({ measured: false, score: 100, grade: 'A' }))
    expect(out).toContain('—')
    expect(out).toContain('nothing was measured')
  })

  it('says zero findings is NOT evidence of health on an unmeasured run', () => {
    // The sharper half: the score line is easy to skim past, and "No
    // findings. Your project is healthy." is the sentence a reader
    // actually acts on.
    const out = renderText(report({ measured: false }))
    expect(out).toContain('NOT evidence of health')
    expect(out, 'and must not also claim health').not.toContain('is healthy')
  })
})

describe('the report says what was scanned, and what was not', () => {
  it('names an EMPTY-SCAN gate and why, in its own block', () => {
    // A gate that inspected nothing is not a passing gate. Burying it in
    // the dim footer beside ordinary `--skip` entries is how a
    // misconfigured workspace reads as clean.
    const out = renderText(report({
      gates: [gate({
        gate: 'islands-audit',
        meta: { elapsedMs: 1, scanned: 0, skipped: true, emptyScan: true, skipReason: 'matched no files' },
      })],
    }))
    expect(out).toContain('islands-audit')
    expect(out).toContain('matched no files')
    expect(out, 'and say it was not measured').toContain('NOT measured')
  })

  it('puts an ordinary SKIP in the footer, not the alarm block', () => {
    // `--skip lint` is the user's own choice; treating it as a warning
    // trains people to ignore the warning that matters.
    const out = renderText(report({
      gates: [gate({
        gate: 'dependency-fabric',
        meta: { elapsedMs: 1, skipped: true, skipReason: 'loom not installed' },
      })],
    }))
    expect(out).toContain('Skipped:')
    expect(out).toContain('loom not installed')
    expect(out, 'not the empty-scan alarm').not.toContain('matched no files')
  })

  it('renders a skip with NO reason without printing undefined', () => {
    const out = renderText(report({
      gates: [gate({ gate: 'x', meta: { elapsedMs: 1, skipped: true } })],
    }))
    expect(out).toContain('x')
    expect(out).not.toContain('undefined')
  })

  it('reports the per-gate scanned counts', () => {
    // The number that makes an empty scan visible before it becomes a
    // false green.
    const out = renderText(report({ gates: [gate({ gate: 'lint', meta: { elapsedMs: 1, scanned: 42 } })] }))
    expect(out).toContain('lint 42')
  })

  it('names WHERE the scan roots came from', () => {
    // `--roots`, a package.json `workspaces`, pnpm-workspace.yaml, or a
    // single package. When a run audits the wrong tree, this line is the
    // first and cheapest clue.
    for (const [source, marker] of [
      ['flag', '--roots'],
      ['pnpm-workspace', 'pnpm-workspace.yaml'],
      ['workspaces', 'workspaces'],
      ['single-package', 'single package'],
    ] as Array<[DoctorReport['workspace'] & object extends never ? never : string, string]>) {
      const out = renderText(report({
        workspace: {
          repoRoot: '/repo',
          source: source as 'flag',
          globs: ['packages/*'],
          excluded: [],
          packageCount: 4,
        },
      }))
      expect(out, source).toContain(marker)
      expect(out, source).toContain('4 package root(s)')
    }
  })

  it('names the exclusions when there are any', () => {
    // An excluded root is a root that was NOT audited. Silently dropping
    // `examples/` from the scan and still scoring the run is the same
    // class of overclaim as an empty scan.
    const out = renderText(report({
      workspace: {
        repoRoot: '/repo',
        source: 'workspaces',
        globs: ['packages/*'],
        excluded: ['examples/*'],
        packageCount: 4,
      },
    }))
    expect(out).toContain('examples/*')
  })
})

describe('the report keeps advisory findings out of the grade, visibly', () => {
  it('labels an advisory category as not graded', () => {
    // Opt-in best-practice rules must never be mistaken for a bug class.
    // A reader who cannot tell which is which either fixes opinions at
    // the same priority as breakage, or ignores both.
    const out = renderText(report({
      categories: [category({ category: 'best-practices', errors: 0, warnings: 5, infos: 2, score: 40, grade: 'F' })],
    }))
    expect(out).toContain('advisory')
    expect(out).toContain('5W')
    expect(out, 'and say it is out of the grade and out of --ci').toContain('excluded from grade')
  })

  it('says CLEAN for an advisory category with nothing to report', () => {
    const out = renderText(report({
      categories: [category({ category: 'best-practices' })],
    }))
    expect(out).toContain('clean')
    expect(out).toContain('not graded')
  })

  it('marks an uncovered non-advisory category SKIPPED rather than scoring it', () => {
    // A category no gate covered is unknown, not perfect. Rendering it as
    // 100 inflates the mean with a measurement nobody took.
    const out = renderText(report({
      categories: [category({ category: 'testing', included: false })],
    }))
    expect(out).toContain('testing')
    expect(out).toContain('skipped')
  })

  it('omits a zero count rather than printing a phantom 0E', () => {
    const out = renderText(report({
      categories: [category({ category: 'correctness', errors: 0, warnings: 2, infos: 0, score: 70, grade: 'C' })],
    }))
    expect(out).toContain('2W')
    expect(out).not.toContain('0E')
    expect(out).not.toContain('0i')
  })
})

describe('the findings list', () => {
  it('shows the message, the code and the location', () => {
    const out = renderText(report({
      findings: [finding({
        message: 'signal read outside a tracking scope',
        code: 'pyreon/no-peek',
        location: { path: '/repo/src/a.ts', relPath: 'src/a.ts', line: 12, column: 3 },
      })],
      totals: { errors: 1, warnings: 0, infos: 0 },
    }))
    expect(out).toContain('signal read outside a tracking scope')
    expect(out).toContain('pyreon/no-peek')
    expect(out).toContain('src/a.ts:12:3')
  })

  it('falls back to the ABSOLUTE path when there is no relative one', () => {
    // `relPath` is empty for a file outside the scan root. An empty cell
    // reads as a rendering bug and gives the reader nowhere to go.
    const out = renderText(report({
      findings: [finding({ location: { path: '/abs/only.ts', relPath: '', line: 3 } })],
    }))
    expect(out).toContain('/abs/only.ts')
  })

  it('renders a finding with NO location at all', () => {
    // A project-level finding (a missing changeset, a config problem)
    // has no file to point at.
    const out = renderText(report({ findings: [finding({ location: undefined })] }))
    expect(out).toContain('something is wrong')
  })

  it('renders related locations under the primary one', () => {
    // A duplicate-name finding is only actionable when it names BOTH
    // sites; showing one leaves the reader hunting for the other.
    const out = renderText(report({
      findings: [finding({
        relatedLocations: [{ path: '/repo/src/b.ts', relPath: 'src/b.ts', line: 9, label: 'also here' }],
      })],
    }))
    expect(out).toContain('src/b.ts:9')
    expect(out).toContain('also here')
  })

  it('truncates a long list and SAYS how many it hid', () => {
    // A silently truncated list reads as the complete one — the reader
    // fixes ten problems and believes there were ten.
    const findings = Array.from({ length: 30 }, (_, i) =>
      finding({ code: `c${i}`, message: `m${i}` }))
    const out = renderText(report({ findings }), { topN: 5 })
    expect(out).toContain('m0')
    expect(out).toContain('and 25 more')
    expect(out).toContain('Top findings (5 of 30)')
  })

  it('shows the whole list when it fits, with no "more" line', () => {
    const out = renderText(report({ findings: [finding()] }), { topN: 10 })
    expect(out).not.toContain('more.')
  })

  it('distinguishes the three severities', () => {
    const out = renderText(report({
      findings: [
        finding({ severity: 'error', message: 'E' }),
        finding({ severity: 'warning', message: 'W' }),
        finding({ severity: 'info', message: 'I' }),
      ],
    }))
    for (const icon of ['✗', '!', 'ℹ']) expect(out, icon).toContain(icon)
  })
})

describe('the footer totals', () => {
  it('pluralises the counts it prints', () => {
    const one = renderText(report({ totals: { errors: 1, warnings: 0, infos: 0 } }))
    expect(one).toContain('1 error')
    expect(one).not.toContain('1 errors')
    const many = renderText(report({ totals: { errors: 2, warnings: 3, infos: 0 } }))
    expect(many).toContain('2 errors')
    expect(many).toContain('3 warnings')
  })

  it('says NO FINDINGS rather than printing three zeroes', () => {
    expect(renderText(report())).toContain('no findings')
  })

  it('counts only the gates that actually ran', () => {
    // A run that skipped four of five gates and reports "5 gates" claims
    // coverage it does not have.
    const out = renderText(report({
      gates: [gate(), gate({ gate: 'b', meta: { elapsedMs: 1, skipped: true } })],
    }))
    expect(out).toContain('1 gates')
  })
})

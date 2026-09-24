/**
 * The false-positive classes loom's detectors exist to avoid.
 *
 * Every uncovered arm in `detect.ts` is a recognition rule, and each one is
 * there because the naive detector produced wrong warnings on a real
 * monorepo. That makes them the worst arms to leave untested: a regression
 * does not break the tool, it floods a workspace with findings that are not
 * defects — and the second time that happens, people stop reading the
 * output, which costs more than the detector was ever worth.
 *
 * The four rules:
 *
 *   * **A declared `@types/*` twin means the import is fine.** `import type
 *     { X } from 'mdast'` with `@types/mdast` declared is correct code; TS
 *     resolves through the types package and the import erases. A lexical
 *     scan cannot see `type`, so the twin is the signal. The SCOPED form is
 *     the tricky one — `@scope/x` maps to `@types/scope__x`, not
 *     `@types/@scope/x`.
 *   * **Type-only counts as USED.** Splitting type imports out of `prod`
 *     without consulting them in the unused detector would turn every
 *     type-only dependency into a fresh `unused-dep` accusation — the fix
 *     manufacturing the class it set out to remove.
 *   * **A PRIVATE package's phantom dep is a warning, not an error.** It
 *     cannot ship broken, because nobody installs it.
 *   * **A type-only phantom is its own code**, and is not double-reported
 *     when the same specifier also appears at runtime.
 *
 * `rangeSpan` is covered here too: it decides whether two declared ranges
 * can be satisfied at once, so a wrong answer is either a missed drift or a
 * fabricated one.
 */
import { describe, expect, it } from 'vitest'
import { detectPhantoms, detectUnused, majorOf, rangeSpan } from '../core/detect'
import type { ImportScan } from '../core/imports'
import type { DeclaredDep, WorkspaceModel } from '../core/types'

const dep = (name: string, range = '^1.0.0', field: DeclaredDep['field'] = 'dependencies'): DeclaredDep =>
  ({ name, range, field }) as DeclaredDep

const model = (
  pkgs: Array<{ name: string; private?: boolean; deps?: DeclaredDep[] }>,
): WorkspaceModel =>
  ({
    root: { dir: '/w', manifest: {} },
    packages: pkgs.map((p) => ({
      name: p.name,
      version: '1.0.0',
      dir: `packages/${p.name}`,
      private: p.private ?? false,
      deps: p.deps ?? [],
    })),
  }) as unknown as WorkspaceModel

const scan = (spec: {
  prod?: Record<string, string[]>
  dev?: Record<string, string[]>
  type?: Record<string, string[]>
}): ImportScan => {
  const asMap = (r: Record<string, string[]> | undefined): Map<string, Map<string, string[]>> => {
    const m = new Map<string, Map<string, string[]>>()
    for (const [pkg, deps] of Object.entries(r ?? {})) {
      m.set(pkg, new Map(deps.map((d) => [d, ['src/index.ts']])))
    }
    return m
  }
  return { prod: asMap(spec.prod), dev: asMap(spec.dev), type: asMap(spec.type) } as ImportScan
}

const codes = (issues: { code: string }[]): string[] => issues.map((i) => i.code)

describe('rangeSpan decides whether two ranges can overlap', () => {
  it('treats a wildcard as unbounded', () => {
    for (const r of ['*', 'latest', '']) {
      expect(rangeSpan(r), r).toEqual([0, Number.POSITIVE_INFINITY])
    }
  })

  it('reads a caret or tilde pin as exactly one major', () => {
    expect(rangeSpan('^1.2.3')).toEqual([1, 2])
    expect(rangeSpan('~4.0.0')).toEqual([4, 5])
    expect(rangeSpan('2.0.0')).toEqual([2, 3])
    expect(rangeSpan('v3.1.0'), 'a leading v is tolerated').toEqual([3, 4])
  })

  it('reads a >= range, with and without an upper bound', () => {
    // `>=5.0.0 <7.0.0` is the shape a package uses to exclude a breaking
    // major — reading it as "one major" would report drift against every
    // caller inside the range.
    expect(rangeSpan('>=5.0.0 <7.0.0')).toEqual([5, 7])
    expect(rangeSpan('>=5.0.0')).toEqual([5, Number.POSITIVE_INFINITY])
  })

  it('returns null for something it cannot read, rather than guessing', () => {
    // A guess here becomes a fabricated drift warning against a range the
    // detector simply does not understand.
    expect(rangeSpan('workspace:*')).toBeNull()
    expect(rangeSpan('github:owner/repo')).toBeNull()
  })

  it('majorOf agrees with the span it came from', () => {
    expect(majorOf('^1.2.3')).toBe(1)
    expect(majorOf('workspace:*')).toBeNull()
  })
})

describe('a declared @types twin means the import is NOT phantom', () => {
  it('recognises the UNSCOPED twin', () => {
    const issues = detectPhantoms(
      model([{ name: 'app', deps: [dep('@types/mdast')] }]),
      scan({ prod: { app: ['mdast'] } }),
    )
    expect(codes(issues), 'the twin declares it').toEqual([])
  })

  it('recognises the SCOPED twin — @scope/x → @types/scope__x', () => {
    // The mapping is not the obvious one, which is exactly why it needs a
    // test: `@types/@acme/thing` is not a package that exists.
    const issues = detectPhantoms(
      model([{ name: 'app', deps: [dep('@types/acme__thing')] }]),
      scan({ prod: { app: ['@acme/thing'] } }),
    )
    expect(codes(issues)).toEqual([])
  })

  it('still reports a phantom when NO twin is declared', () => {
    // The control. Without it every spec above passes against a detector
    // that reports nothing at all.
    const issues = detectPhantoms(
      model([{ name: 'app', deps: [] }]),
      scan({ prod: { app: ['mdast'] } }),
    )
    expect(codes(issues)).toEqual(['phantom-dep'])
  })

  it('applies the twin rule to TYPE-only imports as well', () => {
    const issues = detectPhantoms(
      model([{ name: 'app', deps: [dep('@types/mdast')] }]),
      scan({ type: { app: ['mdast'] } }),
    )
    expect(codes(issues)).toEqual([])
  })
})

describe('severity follows whether the package can ship broken', () => {
  it('a PRIVATE package gets a warning', () => {
    // Nobody installs it, so an undeclared import cannot reach a consumer.
    // It still breaks an isolated-store install of the workspace, so it is
    // reported — just not as an error.
    const issues = detectPhantoms(
      model([{ name: 'internal', private: true, deps: [] }]),
      scan({ prod: { internal: ['undeclared'] } }),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.severity).toBe('warning')
  })

  it('a PUBLISHED package gets an error', () => {
    const issues = detectPhantoms(
      model([{ name: 'shipped', private: false, deps: [] }]),
      scan({ prod: { shipped: ['undeclared'] } }),
    )
    expect(issues[0]!.severity, 'this one can reach a consumer').toBe('error')
  })
})

describe('a type-only phantom is its own, lesser finding', () => {
  it('reports phantom-type-dep at info severity', () => {
    // Erased at runtime, so consumers are unaffected — but typecheck
    // resolves it through hoisting luck, which is still a real defect.
    const issues = detectPhantoms(
      model([{ name: 'app', deps: [] }]),
      scan({ type: { app: ['some-types'] } }),
    )
    expect(codes(issues)).toEqual(['phantom-type-dep'])
    expect(issues[0]!.severity).toBe('info')
  })

  it('does NOT double-report when the same specifier is also a runtime import', () => {
    // One dependency, one finding. Two would make the report's counts
    // wrong and send the reader looking for a second site.
    const issues = detectPhantoms(
      model([{ name: 'app', deps: [] }]),
      scan({ prod: { app: ['both'] }, type: { app: ['both'] } }),
    )
    expect(codes(issues), 'the runtime finding wins').toEqual(['phantom-dep'])
  })
})

describe('type-only usage counts as USED', () => {
  it('a dependency imported only as a type is not "unused"', () => {
    // The documented trap: splitting type imports out of `prod` without
    // consulting them here turns every type-only dependency into a fresh
    // accusation — the fix manufacturing the class it set out to remove.
    const issues = detectUnused(
      model([{ name: 'app', deps: [dep('some-types')] }]),
      scan({ type: { app: ['some-types'] } }),
    )
    expect(codes(issues)).toEqual([])
  })

  it('a dependency imported nowhere IS unused', () => {
    // The control.
    const issues = detectUnused(
      model([{ name: 'app', deps: [dep('never-imported')] }]),
      scan({}),
    )
    expect(codes(issues)).toEqual(['unused-dep'])
    expect(issues[0]!.severity, 'advisory — a lexical scan cannot see everything').toBe('info')
  })

  it('an @types/* package is never reported unused', () => {
    // It is consumed by the compiler, not by an import statement — a
    // lexical scan structurally cannot see it being used.
    const issues = detectUnused(
      model([{ name: 'app', deps: [dep('@types/node')] }]),
      scan({}),
    )
    expect(codes(issues)).toEqual([])
  })

  it('only `dependencies` are considered — a devDependency is not', () => {
    // An unused devDependency is not a shipping hazard, and dev tooling is
    // exactly where lexical scanning misses the most.
    const issues = detectUnused(
      model([{ name: 'app', deps: [dep('some-tool', '^1.0.0', 'devDependencies')] }]),
      scan({}),
    )
    expect(codes(issues)).toEqual([])
  })

  it('a DEV import counts as used for a prod dependency', () => {
    const issues = detectUnused(
      model([{ name: 'app', deps: [dep('used-in-tests')] }]),
      scan({ dev: { app: ['used-in-tests'] } }),
    )
    expect(codes(issues)).toEqual([])
  })
})

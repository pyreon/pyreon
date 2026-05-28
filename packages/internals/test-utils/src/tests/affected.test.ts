import {
  computeAffectedFlags,
  filterByCategory,
  isRootFile,
  transitiveDependents,
  type Workspace,
} from '../../../../../scripts/affected'

/**
 * Tests for the affected-package selector (`scripts/affected.ts`).
 *
 * **Why this matters**: this script decides which packages CI runs
 * lint/typecheck/test/build against on every PR. False-negatives skip
 * packages that would have caught a regression — exactly the bug class
 * the e2e-affected tests already cover for the e2e suite. The pure
 * exports here let us assert the policy directly, with the git/IO/arg
 * layer kept thin in `main()` (same "no subprocess-tested scripts"
 * shape as `e2e-affected.test.ts`).
 *
 * **P3b focus**: this file was added when the script grew a
 * `--category=<name>` flag for sharding Test + Typecheck across per-
 * category matrix cells. The `computeAffectedFlags` + `filterByCategory`
 * surface is what each cell calls; getting it wrong = entire shard cell
 * silently no-ops on a real regression.
 */

// Synthetic workspaces — deliberately small + structured so the shape of
// reverse-dep BFS + per-category narrowing is observable. Mirrors the
// real Pyreon dep direction: core packages are leaves of the dep graph
// (everyone depends on @pyreon/reactivity); category packages depend on
// core; user-side packages (tools, ui-system) depend on category packages.
const ROOT = '/fake/root'
const WS: Workspace[] = [
  // core (the dep-graph root)
  { name: '@pyreon/reactivity', dir: `${ROOT}/packages/core/reactivity`, deps: [] },
  {
    name: '@pyreon/core',
    dir: `${ROOT}/packages/core/core`,
    deps: ['@pyreon/reactivity'],
  },
  {
    name: '@pyreon/runtime-dom',
    dir: `${ROOT}/packages/core/runtime-dom`,
    deps: ['@pyreon/core', '@pyreon/reactivity'],
  },
  // fundamentals (depend on core)
  {
    name: '@pyreon/toast',
    dir: `${ROOT}/packages/fundamentals/toast`,
    deps: ['@pyreon/core'],
  },
  {
    name: '@pyreon/hooks',
    dir: `${ROOT}/packages/fundamentals/hooks`,
    deps: ['@pyreon/reactivity'],
  },
  // ui-system (depend on core + a fundamentals helper)
  {
    name: '@pyreon/styler',
    dir: `${ROOT}/packages/ui-system/styler`,
    deps: ['@pyreon/core'],
  },
  // tools (depend on core)
  {
    name: '@pyreon/lint',
    dir: `${ROOT}/packages/tools/lint`,
    deps: ['@pyreon/core'],
  },
  // examples (NOT under packages/*; never selected by a category filter)
  {
    name: 'app-showcase',
    dir: `${ROOT}/examples/app-showcase`,
    deps: ['@pyreon/core', '@pyreon/styler'],
  },
]

describe('isRootFile', () => {
  it.each([
    'package.json',
    'bun.lock',
    'tsconfig.json',
    'tsconfig.base.json',
    'vitest.shared.ts',
    'vitest.browser.ts',
    '.github/workflows/ci.yml',
    'scripts/affected.ts',
  ])('treats %s as a root file (forces full suite)', (path) => {
    expect(isRootFile(path)).toBe(true)
  })

  it.each([
    'packages/core/reactivity/src/signal.ts',
    'examples/playground/src/App.tsx',
    'docs/docs/zero.md',
    'README.md',
    'CLAUDE.md',
    'e2e/zero-hmr.spec.ts',
  ])('does NOT treat %s as a root file', (path) => {
    expect(isRootFile(path)).toBe(false)
  })
})

describe('transitiveDependents', () => {
  it('expands a leaf-of-dep-graph change to every dependent (BFS closure)', () => {
    // A change to @pyreon/reactivity must light up everyone — direct +
    // transitive — that depends on it.
    const out = transitiveDependents(new Set(['@pyreon/reactivity']), WS)
    expect([...out].sort()).toEqual(
      [
        '@pyreon/core', // direct
        '@pyreon/hooks', // direct
        '@pyreon/lint', // via @pyreon/core
        '@pyreon/reactivity', // seed
        '@pyreon/runtime-dom', // direct (+ via @pyreon/core)
        '@pyreon/styler', // via @pyreon/core
        '@pyreon/toast', // via @pyreon/core
        'app-showcase', // via @pyreon/core + @pyreon/styler
      ].sort(),
    )
  })

  it('a leaf package only impacts itself + its examples', () => {
    // @pyreon/toast: nothing under packages/* depends on it; only the
    // examples that consume it would normally light up — none here.
    const out = transitiveDependents(new Set(['@pyreon/toast']), WS)
    expect([...out].sort()).toEqual(['@pyreon/toast'])
  })
})

describe('filterByCategory', () => {
  const full = new Set([
    '@pyreon/reactivity',
    '@pyreon/core',
    '@pyreon/runtime-dom',
    '@pyreon/toast',
    '@pyreon/hooks',
    '@pyreon/styler',
    '@pyreon/lint',
    'app-showcase',
  ])

  it('restricts to packages under packages/<category>/', () => {
    expect([...filterByCategory(full, WS, 'core', ROOT)].sort()).toEqual([
      '@pyreon/core',
      '@pyreon/reactivity',
      '@pyreon/runtime-dom',
    ])
    expect([...filterByCategory(full, WS, 'fundamentals', ROOT)].sort()).toEqual([
      '@pyreon/hooks',
      '@pyreon/toast',
    ])
    expect([...filterByCategory(full, WS, 'ui-system', ROOT)].sort()).toEqual([
      '@pyreon/styler',
    ])
    expect([...filterByCategory(full, WS, 'tools', ROOT)].sort()).toEqual([
      '@pyreon/lint',
    ])
  })

  it('returns empty for a category with no affected packages', () => {
    expect(filterByCategory(full, WS, 'zero', ROOT)).toEqual(new Set())
  })

  it('PACKAGE categories never include examples — they live outside packages/*', () => {
    // An example workspace's `dir` is `<root>/examples/<name>`, not
    // `<root>/packages/<cat>/<name>` — structurally cannot pass a PACKAGE
    // category's prefix test. The `examples` pseudo-category (below) is the
    // one place example apps ARE selected.
    const result = new Set<string>()
    for (const cat of ['core', 'fundamentals', 'ui-system', 'tools', 'zero', 'internals', 'native', 'ui']) {
      for (const name of filterByCategory(full, WS, cat, ROOT)) {
        result.add(name)
      }
    }
    expect(result.has('app-showcase')).toBe(false)
  })

  it('the `examples` pseudo-category selects ONLY example apps (under examples/)', () => {
    // The dedicated shard cell for the `typecheck (examples)` CI job:
    // `--category=examples` maps to the top-level `examples/` dir, so an
    // affected example app is selected while every packages/* workspace is
    // excluded. This is what closes the "example type regression invisible
    // to CI" gap (CI typechecks packages/<cat>/* but never examples/* before).
    expect([...filterByCategory(full, WS, 'examples', ROOT)]).toEqual(['app-showcase'])
    // Excludes packages/* workspaces even though they're in the affected set.
    const examplesOnly = filterByCategory(full, WS, 'examples', ROOT)
    expect(examplesOnly.has('@pyreon/core')).toBe(false)
    expect(examplesOnly.has('@pyreon/styler')).toBe(false)
  })

  it('safely ignores names that are not in the workspace set', () => {
    const stale = new Set(['@pyreon/does-not-exist', '@pyreon/core'])
    expect([...filterByCategory(stale, WS, 'core', ROOT)]).toEqual([
      '@pyreon/core',
    ])
  })
})

describe('computeAffectedFlags', () => {
  it('null changed (diff failed) → --filter=* regardless of category', () => {
    expect(computeAffectedFlags({ changed: null, workspaces: WS, root: ROOT })).toBe(
      '--filter=*',
    )
    expect(
      computeAffectedFlags({
        changed: null,
        workspaces: WS,
        category: 'core',
        root: ROOT,
      }),
    ).toBe('--filter=*')
  })

  it('empty changed → empty (no-op everywhere)', () => {
    expect(computeAffectedFlags({ changed: [], workspaces: WS, root: ROOT })).toBe('')
    expect(
      computeAffectedFlags({
        changed: [],
        workspaces: WS,
        category: 'core',
        root: ROOT,
      }),
    ).toBe('')
  })

  it('root-file change → --filter=* even when a category is set (cells escalate to full slice)', () => {
    // Without this propagation, a workflow change would silently skip
    // every shard cell because no per-package --filter= flag would land
    // in any one cell's output. Every cell needs to run its full slice
    // when the blast radius is unknowable.
    expect(
      computeAffectedFlags({
        changed: ['bun.lock'],
        workspaces: WS,
        category: 'core',
        root: ROOT,
      }),
    ).toBe('--filter=*')
    expect(
      computeAffectedFlags({
        changed: ['.github/workflows/ci.yml', 'packages/core/core/src/h.ts'],
        workspaces: WS,
        category: 'fundamentals',
        root: ROOT,
      }),
    ).toBe('--filter=*')
  })

  it('narrow change in one category → only that category emits flags; others are empty', () => {
    // Change to @pyreon/toast (fundamentals, no dependents in this fake
    // workspace) → fundamentals cell gets the package; every other cell
    // is empty (gracefully skipped at the bun-run layer).
    const changed = ['packages/fundamentals/toast/src/index.ts']
    expect(
      computeAffectedFlags({ changed, workspaces: WS, category: 'core', root: ROOT }),
    ).toBe('')
    expect(
      computeAffectedFlags({
        changed,
        workspaces: WS,
        category: 'fundamentals',
        root: ROOT,
      }),
    ).toBe('--filter=@pyreon/toast')
    expect(
      computeAffectedFlags({
        changed,
        workspaces: WS,
        category: 'ui-system',
        root: ROOT,
      }),
    ).toBe('')
    expect(
      computeAffectedFlags({
        changed,
        workspaces: WS,
        category: 'tools',
        root: ROOT,
      }),
    ).toBe('')
  })

  it('core-package change → closure expands to dependents, then narrows per category', () => {
    // Change to @pyreon/reactivity. The full closure (without category)
    // covers every dependent — core, fundamentals, ui-system, tools, the
    // example. With a category filter, each cell sees ONLY its own slice.
    const changed = ['packages/core/reactivity/src/signal.ts']

    expect(
      computeAffectedFlags({ changed, workspaces: WS, category: 'core', root: ROOT }),
    ).toBe(
      '--filter=@pyreon/core --filter=@pyreon/reactivity --filter=@pyreon/runtime-dom',
    )
    expect(
      computeAffectedFlags({
        changed,
        workspaces: WS,
        category: 'fundamentals',
        root: ROOT,
      }),
    ).toBe('--filter=@pyreon/hooks --filter=@pyreon/toast')
    expect(
      computeAffectedFlags({
        changed,
        workspaces: WS,
        category: 'ui-system',
        root: ROOT,
      }),
    ).toBe('--filter=@pyreon/styler')
    expect(
      computeAffectedFlags({
        changed,
        workspaces: WS,
        category: 'tools',
        root: ROOT,
      }),
    ).toBe('--filter=@pyreon/lint')
    // No 'zero' workspace in this fake set → empty (gracefully skipped)
    expect(
      computeAffectedFlags({ changed, workspaces: WS, category: 'zero', root: ROOT }),
    ).toBe('')
  })

  it('without --category, output matches the existing no-category contract (backward-compat)', () => {
    // Same change as the previous test, but no category. Existing CI
    // jobs (the non-sharded Test/Typecheck path) must keep working
    // exactly as they did before P3b.
    const changed = ['packages/core/reactivity/src/signal.ts']
    const out = computeAffectedFlags({ changed, workspaces: WS, root: ROOT })
    // Closure includes the example (depends on @pyreon/core via dep edge)
    expect(out).toContain('--filter=@pyreon/reactivity')
    expect(out).toContain('--filter=@pyreon/core')
    expect(out).toContain('--filter=app-showcase')
    // Flags are space-separated and sorted alphabetically (locks emit order)
    expect(out).toMatch(/^--filter=\S+( --filter=\S+)+$/)
    const flags = out.split(' ')
    const sorted = [...flags].sort()
    expect(flags).toEqual(sorted)
  })
})

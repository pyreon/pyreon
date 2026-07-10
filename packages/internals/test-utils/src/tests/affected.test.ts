import {
  computeAffectedFlags,
  discoverWorkspaces,
  docInputConsumer,
  filterByCategory,
  isDocsOnlyChange,
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
  ])('treats %s as a root file (forces full suite)', (path) => {
    expect(isRootFile(path)).toBe(true)
  })

  it.each([
    'packages/core/reactivity/src/signal.ts',
    'examples/playground/src/App.tsx',
    'docs/src/content/docs/zero.md',
    'README.md',
    'CLAUDE.md',
    'e2e/zero-hmr.spec.ts',
    // scripts/ is NOT a root file — it maps to @pyreon/test-utils instead of
    // escalating the whole suite (see computeAffectedFlags tests below).
    'scripts/affected.ts',
    'scripts/scaffold-smoke.ts',
  ])('does NOT treat %s as a root file', (path) => {
    expect(isRootFile(path)).toBe(false)
  })
})

describe('isDocsOnlyChange — Layer-2 heavy-job gate', () => {
  it('treats a pure CLAUDE.md / README change as docs-only (heavy jobs skip)', () => {
    expect(isDocsOnlyChange(['CLAUDE.md'])).toBe(true)
    expect(isDocsOnlyChange(['CLAUDE.md', 'packages/fundamentals/code/README.md'])).toBe(true)
    expect(isDocsOnlyChange(['.claude/rules/anti-patterns.md'])).toBe(true)
  })

  it('treats docs-site / .claude / llms files as docs-only', () => {
    expect(
      isDocsOnlyChange([
        'docs/src/content/docs/code.md',
        '.claude/audits/x.md',
        'llms.txt',
        'llms-full.txt',
        'README.mdx',
      ]),
    ).toBe(true)
  })

  it('treats ANY non-docs path as code (heavy jobs run) — conservative bias', () => {
    expect(isDocsOnlyChange(['CLAUDE.md', 'packages/core/reactivity/src/signal.ts'])).toBe(false)
    expect(isDocsOnlyChange(['.github/workflows/ci.yml'])).toBe(false)
    expect(isDocsOnlyChange(['scripts/affected.ts'])).toBe(false)
    expect(isDocsOnlyChange(['package.json'])).toBe(false)
    expect(isDocsOnlyChange(['examples/playground/src/App.tsx'])).toBe(false)
    expect(isDocsOnlyChange(['packages/fundamentals/code/src/editor.ts'])).toBe(false)
  })

  it('null diff (unknowable) → NOT docs-only (escalate to run)', () => {
    expect(isDocsOnlyChange(null)).toBe(false)
  })

  it('empty diff (nothing changed) → docs-only (no heavy work needed)', () => {
    expect(isDocsOnlyChange([])).toBe(true)
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
    expect([...filterByCategory(full, WS, 'ui-system', ROOT)].sort()).toEqual(['@pyreon/styler'])
    expect([...filterByCategory(full, WS, 'tools', ROOT)].sort()).toEqual(['@pyreon/lint'])
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
    for (const cat of [
      'core',
      'fundamentals',
      'ui-system',
      'tools',
      'zero',
      'internals',
      'native',
      'ui',
    ]) {
      for (const name of filterByCategory(full, WS, cat, ROOT)) {
        result.add(name)
      }
    }
    expect(result.has('app-showcase')).toBe(false)
  })

  // ── The `native` cell split (CI: `test (native-compiler)` + `test (native-rest)`) ──
  // `packages/native/compiler` alone is ~2200s of aggregate test CPU, and
  // sharing one runner with the Kotlin runtime chain put the combined cell
  // 2–10% under its timeout — a coin-flip required gate. The two cells are
  // `--category=native/compiler` and `--category=native --exclude=native/compiler`.
  // What must hold FOREVER is that they PARTITION `packages/native/`: no
  // package in both, none in neither.
  describe('nested category + exclude (the native cell split)', () => {
    const NATIVE_WS: Workspace[] = [
      { name: '@pyreon/native-compiler', dir: `${ROOT}/packages/native/compiler`, deps: [] },
      { name: '@pyreon/native-cli', dir: `${ROOT}/packages/native/cli`, deps: [] },
      {
        name: '@pyreon/native-runtime-kotlin',
        dir: `${ROOT}/packages/native/runtime-kotlin`,
        deps: [],
      },
      { name: '@pyreon/core', dir: `${ROOT}/packages/core/core`, deps: [] },
    ]
    const allNative = new Set(NATIVE_WS.map((w) => w.name))

    it('a NESTED category narrows to that one package', () => {
      expect([...filterByCategory(allNative, NATIVE_WS, 'native/compiler', ROOT)]).toEqual([
        '@pyreon/native-compiler',
      ])
    })

    it('`exclude` drops the nested path from the parent category', () => {
      const rest = filterByCategory(allNative, NATIVE_WS, 'native', ROOT, ['native/compiler'])
      expect([...rest].sort()).toEqual(['@pyreon/native-cli', '@pyreon/native-runtime-kotlin'])
      // never leaks a sibling category
      expect(rest.has('@pyreon/core')).toBe(false)
    })

    it('the two cells PARTITION packages/native — disjoint, and together total', () => {
      const compilerCell = filterByCategory(allNative, NATIVE_WS, 'native/compiler', ROOT)
      const restCell = filterByCategory(allNative, NATIVE_WS, 'native', ROOT, ['native/compiler'])
      const wholeCategory = filterByCategory(allNative, NATIVE_WS, 'native', ROOT)

      for (const n of compilerCell) expect(restCell.has(n)).toBe(false)
      expect([...compilerCell, ...restCell].sort()).toEqual([...wholeCategory].sort())
    })

    it('DRIFT LOCK: every real packages/native/* package lands in exactly one cell', () => {
      // Against the REAL workspace, not a fixture — this is the assertion that
      // catches a newly-added native package escaping CI entirely. It passes by
      // construction today; it would fail if `exclude` were ever replaced with
      // an enumerated allow-list of sibling packages.
      const real = discoverWorkspaces()
      const nativeNames = new Set(
        real.filter((w) => w.dir.includes('/packages/native/')).map((w) => w.name),
      )
      expect(nativeNames.size).toBeGreaterThan(1)

      const compilerCell = filterByCategory(nativeNames, real, 'native/compiler')
      const restCell = filterByCategory(nativeNames, real, 'native', undefined, ['native/compiler'])

      for (const name of nativeNames) {
        const inCompiler = compilerCell.has(name)
        const inRest = restCell.has(name)
        expect(
          inCompiler !== inRest,
          `${name} must be in exactly one native cell (compiler=${inCompiler}, rest=${inRest})`,
        ).toBe(true)
      }
      expect(compilerCell.size).toBe(1)
    })
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
    expect([...filterByCategory(stale, WS, 'core', ROOT)]).toEqual(['@pyreon/core'])
  })
})

describe('computeAffectedFlags', () => {
  it('null changed (diff failed) → --filter=* regardless of category', () => {
    expect(computeAffectedFlags({ changed: null, workspaces: WS, root: ROOT })).toBe('--filter=*')
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

  describe('scripts/ map to @pyreon/test-utils (never --filter=*)', () => {
    const WS_TU: Workspace[] = [
      ...WS,
      { name: '@pyreon/test-utils', dir: `${ROOT}/packages/internals/test-utils`, deps: [] },
    ]

    it('a tested script (affected.ts) seeds @pyreon/test-utils, NOT the full suite', () => {
      const out = computeAffectedFlags({
        changed: ['scripts/affected.ts'],
        workspaces: WS_TU,
        root: ROOT,
      })
      expect(out).toBe('--filter=@pyreon/test-utils')
      expect(out).not.toBe('--filter=*')
    })

    it('an untested script (scaffold-smoke.ts) still maps to test-utils, never escalates', () => {
      // This is the exact file that flaked the local pre-push full-run.
      expect(
        computeAffectedFlags({
          changed: ['scripts/scaffold-smoke.ts'],
          workspaces: WS_TU,
          root: ROOT,
        }),
      ).toBe('--filter=@pyreon/test-utils')
    })

    it('scripts/ + a package source change unions both (no escalation)', () => {
      const out = computeAffectedFlags({
        changed: ['scripts/gen-docs.ts', 'packages/fundamentals/toast/src/index.ts'],
        workspaces: WS_TU,
        root: ROOT,
      })
      expect(out).toContain('--filter=@pyreon/test-utils')
      expect(out).toContain('--filter=@pyreon/toast')
      expect(out).not.toBe('--filter=*')
    })

    it('gracefully no-ops (NOT --filter=*) when @pyreon/test-utils is absent', () => {
      // WS has no test-utils → a lone script change seeds nothing → no-op.
      expect(
        computeAffectedFlags({ changed: ['scripts/affected.ts'], workspaces: WS, root: ROOT }),
      ).toBe('')
    })
  })

  describe('doc-input files map to their consuming package (@pyreon/mcp)', () => {
    const WS_MCP: Workspace[] = [
      ...WS,
      { name: '@pyreon/mcp', dir: `${ROOT}/packages/tools/mcp`, deps: ['@pyreon/core'] },
    ]

    it('docInputConsumer identifies the parser package', () => {
      expect(docInputConsumer('.claude/rules/anti-patterns.md')).toBe('@pyreon/mcp')
      expect(docInputConsumer('docs/patterns/keyed-lists.md')).toBe('@pyreon/mcp')
      expect(docInputConsumer('docs/guides/routing.md')).toBeUndefined()
      expect(docInputConsumer('packages/tools/mcp/src/index.ts')).toBeUndefined()
    })

    it('a change to .claude/rules/anti-patterns.md runs the tools cell for @pyreon/mcp', () => {
      // Regression: these doc-INPUTs used to seed nothing → the `test (tools)`
      // cell skipped @pyreon/mcp's anti-patterns.test.ts / patterns.test.ts,
      // so a structural break in the parsed files merged unnoticed.
      const out = computeAffectedFlags({
        changed: ['.claude/rules/anti-patterns.md'],
        workspaces: WS_MCP,
        category: 'tools',
        root: ROOT,
      })
      expect(out).toBe('--filter=@pyreon/mcp')
    })

    it('a docs/patterns/*.md change runs the tools cell for @pyreon/mcp', () => {
      expect(
        computeAffectedFlags({
          changed: ['docs/patterns/signal-writes.md'],
          workspaces: WS_MCP,
          category: 'tools',
          root: ROOT,
        }),
      ).toBe('--filter=@pyreon/mcp')
    })

    it('does NOT leak into non-tools cells (leaf seed, no expansion)', () => {
      expect(
        computeAffectedFlags({
          changed: ['.claude/rules/anti-patterns.md'],
          workspaces: WS_MCP,
          category: 'core',
          root: ROOT,
        }),
      ).toBe('')
    })

    it('gracefully no-ops when @pyreon/mcp is absent (never --filter=*)', () => {
      expect(
        computeAffectedFlags({ changed: ['.claude/rules/anti-patterns.md'], workspaces: WS, root: ROOT }),
      ).toBe('')
    })

    it('docs/patterns/** ADDITIVELY seeds BOTH its owner (@pyreon/docs) AND @pyreon/mcp', () => {
      // Regression guard for the shadowing bug: in the real repo `docs/patterns/**`
      // is OWNED by the @pyreon/docs workspace, so a fallback-only ("else if
      // findOwningWorkspace is null") consumer branch never reaches mcp → its
      // patterns.test.ts silently stops. The seed MUST be additive. (The
      // sibling tests above use a fixture WITHOUT @pyreon/docs, so they can't
      // catch this — this one adds the owner to expose the shadow.)
      const WS_MCP_DOCS: Workspace[] = [
        ...WS_MCP,
        { name: '@pyreon/docs', dir: `${ROOT}/docs`, deps: [] },
      ]
      const out = computeAffectedFlags({
        changed: ['docs/patterns/keyed-lists.md'],
        workspaces: WS_MCP_DOCS,
        root: ROOT,
      })
      expect(out).toContain('--filter=@pyreon/mcp')
      expect(out).toContain('--filter=@pyreon/docs')
      // …and the tools cell still narrows to mcp (the parser test runs).
      expect(
        computeAffectedFlags({
          changed: ['docs/patterns/keyed-lists.md'],
          workspaces: WS_MCP_DOCS,
          category: 'tools',
          root: ROOT,
        }),
      ).toBe('--filter=@pyreon/mcp')
    })

    // `--has-affected` (the bootstrap + test/typecheck-cell gate) is just
    // `computeAffectedFlags(...) !== ''`: a doc-INPUT change is affected=true
    // (its consumer is seeded) even though it is docs-only for the heavy jobs;
    // a pure-prose docs change is affected=false → those jobs skip.
    it('a doc-INPUT change is has-affected=true; pure prose is has-affected=false', () => {
      const hasAffected = (changed: string[] | null) =>
        computeAffectedFlags({ changed, workspaces: WS_MCP, root: ROOT }) !== ''
      expect(hasAffected(['.claude/rules/anti-patterns.md'])).toBe(true)
      expect(hasAffected(['docs/patterns/x.md'])).toBe(true)
      expect(hasAffected(['CLAUDE.md'])).toBe(false)
      expect(hasAffected(['packages/fundamentals/code/README.md'])).toBe(false)
      expect(hasAffected([])).toBe(false)
      expect(hasAffected(null)).toBe(true) // unknowable diff → fail-closed → run
    })
  })

  it('narrow change in one category → only that category emits flags; others are empty', () => {
    // Change to @pyreon/toast (fundamentals, no dependents in this fake
    // workspace) → fundamentals cell gets the package; every other cell
    // is empty (gracefully skipped at the bun-run layer).
    const changed = ['packages/fundamentals/toast/src/index.ts']
    expect(computeAffectedFlags({ changed, workspaces: WS, category: 'core', root: ROOT })).toBe('')
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

    expect(computeAffectedFlags({ changed, workspaces: WS, category: 'core', root: ROOT })).toBe(
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
    expect(computeAffectedFlags({ changed, workspaces: WS, category: 'zero', root: ROOT })).toBe('')
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

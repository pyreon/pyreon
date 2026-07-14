import {
  CATALOG_FILE,
  CATALOG_MARKER,
  countCatalogEntries,
  evaluateGate,
  isSensitiveSourceFile,
  sensitivePackagesTouched,
  touchesSensitivePaths,
  type GateInputs,
  type GateResult,
} from '../../../../../scripts/check-diagnose-catalog'

/**
 * Tests for the diagnose-catalog gate (`scripts/check-diagnose-catalog.ts`).
 *
 * **Why this matters**: the gate fires on every PR that touches a
 * sensitive package and demands either an `ERROR_PATTERNS` catalog
 * entry or a `skip-diagnose-catalog` label. Pre-#1166 the path detector
 * was too coarse — it matched every file in those packages including
 * `package.json` / CHANGELOG / README / tests. A devDeps bump (#1166)
 * tripped the gate even though no `.ts` source file in those packages
 * changed; the only way to merge was the manual skip-label dance, which
 * required reruning the labeled-event workflow because the previous
 * synchronize-event run was already finalized. The "fix" is to narrow
 * the detector to real source-code changes.
 *
 * **Same shape as `e2e-affected.test.ts` / `affected.test.ts`**: the
 * script's pure predicate (`isSensitiveSourceFile`) and policy evaluator
 * (`evaluateGate`) are unit-tested directly. The git/env/IO layer in
 * `main()` is intentionally thin — exercising it via subprocess fork is
 * the documented anti-pattern (#544, recorded in workflow.md and the
 * `subprocess testing as a default for shell scripts` feedback memory).
 *
 * Contract pinned here (false-positive class fixed in #1166):
 *
 *  - `package.json` / `CHANGELOG.md` / `README.md` / `tsconfig.json`
 *    changes in sensitive packages → NOT sensitive.
 *  - Test / spec / story files anywhere under `src/` → NOT sensitive.
 *  - Files inside `src/tests/` / `src/__tests__/` at any depth → NOT
 *    sensitive.
 *  - `src/manifest.ts` (the `defineManifest` docs-metadata source) → NOT
 *    sensitive; a docs-excellence manifest edit must not trip the gate.
 *  - `.ts` / `.tsx` files directly under `src/` (and any non-test
 *    subdirectory of `src/`) → sensitive.
 *  - Non-sensitive packages (anything outside the 5 names) → NOT
 *    sensitive even with a `src/` path.
 *  - `lib/` build output → NOT sensitive (defense-in-depth).
 */

// ─── isSensitiveSourceFile ──────────────────────────────────────────────────

describe('isSensitiveSourceFile', () => {
  describe('matches real source-code changes in sensitive packages', () => {
    it('matches a top-level src .ts file', () => {
      expect(
        isSensitiveSourceFile('packages/core/runtime-dom/src/mount.ts'),
      ).toBe(true)
    })

    it('matches a top-level src .tsx file', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/src/components.tsx'),
      ).toBe(true)
    })

    it('matches a nested non-test subdirectory under src/', () => {
      expect(
        isSensitiveSourceFile('packages/core/compiler/src/native/lib.ts'),
      ).toBe(true)
    })

    it('matches a .d.ts type-only file under src/ (gate authors can label to bypass type-only changes)', () => {
      expect(isSensitiveSourceFile('packages/core/core/src/types.d.ts')).toBe(
        true,
      )
    })

    it('matches every sensitive package by name', () => {
      for (const pkg of [
        'runtime-dom',
        'runtime-server',
        'core',
        'compiler',
        'router',
      ]) {
        expect(
          isSensitiveSourceFile(`packages/core/${pkg}/src/index.ts`),
        ).toBe(true)
      }
    })
  })

  describe('rejects non-source file changes in sensitive packages (the #1166 false-positive class)', () => {
    it('rejects package.json bumps (the deps-update case that surfaced this fix)', () => {
      expect(
        isSensitiveSourceFile('packages/core/runtime-dom/package.json'),
      ).toBe(false)
    })

    it('rejects CHANGELOG.md (release-notes drift)', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/CHANGELOG.md'),
      ).toBe(false)
    })

    it('rejects README.md', () => {
      expect(isSensitiveSourceFile('packages/core/core/README.md')).toBe(false)
    })

    it('rejects LICENSE', () => {
      expect(isSensitiveSourceFile('packages/core/compiler/LICENSE')).toBe(
        false,
      )
    })

    it('rejects tsconfig.json', () => {
      expect(
        isSensitiveSourceFile('packages/core/runtime-server/tsconfig.json'),
      ).toBe(false)
    })

    it('rejects vitest.config.ts (test config, not source)', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/vitest.config.ts'),
      ).toBe(false)
    })

    it('rejects vitest.browser.config.ts', () => {
      expect(
        isSensitiveSourceFile(
          'packages/core/runtime-dom/vitest.browser.config.ts',
        ),
      ).toBe(false)
    })

    it('rejects bunfig.toml', () => {
      expect(isSensitiveSourceFile('packages/core/router/bunfig.toml')).toBe(
        false,
      )
    })

    it('rejects build output under lib/ (defense-in-depth; lib/ is gitignored)', () => {
      expect(
        isSensitiveSourceFile('packages/core/runtime-dom/lib/index.js'),
      ).toBe(false)
    })
  })

  describe('rejects test / spec / story files', () => {
    it('rejects a .test.ts under src/', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/src/router.test.ts'),
      ).toBe(false)
    })

    it('rejects a .test.tsx under src/', () => {
      expect(
        isSensitiveSourceFile('packages/core/runtime-dom/src/mount.test.tsx'),
      ).toBe(false)
    })

    it('rejects a .spec.ts', () => {
      expect(
        isSensitiveSourceFile('packages/core/core/src/signal.spec.ts'),
      ).toBe(false)
    })

    it('rejects a .stories.tsx', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/src/router.stories.tsx'),
      ).toBe(false)
    })

    it('rejects a file inside src/tests/ regardless of name', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/src/tests/fixture.ts'),
      ).toBe(false)
    })

    it('rejects a file inside src/__tests__/', () => {
      expect(
        isSensitiveSourceFile(
          'packages/core/runtime-dom/src/__tests__/regression.ts',
        ),
      ).toBe(false)
    })

    it('rejects a file inside a nested src/tests/ subdirectory', () => {
      expect(
        isSensitiveSourceFile(
          'packages/core/compiler/src/tests/runtime/case.ts',
        ),
      ).toBe(false)
    })

    it('rejects a .browser.test.tsx file', () => {
      expect(
        isSensitiveSourceFile(
          'packages/core/runtime-dom/src/transition.browser.test.tsx',
        ),
      ).toBe(false)
    })
  })

  describe('rejects the docs-metadata manifest (docs-only, never grows the error catalog)', () => {
    it('rejects src/manifest.ts — the defineManifest docs source consumed by gen-docs', () => {
      // A docs-excellence PR enriching a core package's manifest.ts (mistakes[]
      // catalogs → MCP api-reference) must NOT trip the diagnose gate: manifest.ts
      // has zero runtime behavior and is stripped from the published tarball.
      for (const pkg of [
        'runtime-dom',
        'runtime-server',
        'core',
        'compiler',
        'router',
      ]) {
        expect(
          isSensitiveSourceFile(`packages/core/${pkg}/src/manifest.ts`),
        ).toBe(false)
      }
    })

    it('still matches a real source file named like manifest but not at src/ root', () => {
      // Precision guard: the exclusion is the exact `src/manifest.ts` convention.
      // A hypothetical `src/foo/manifest.ts` is NOT the docs-metadata file and
      // stays sensitive (defensive — the convention is always src/manifest.ts).
      expect(
        isSensitiveSourceFile('packages/core/router/src/foo/manifest.ts'),
      ).toBe(true)
    })
  })

  describe('rejects files outside the sensitive package set', () => {
    it('rejects a src/.ts in a non-sensitive @pyreon package (e.g. fundamentals)', () => {
      expect(
        isSensitiveSourceFile('packages/fundamentals/form/src/index.ts'),
      ).toBe(false)
    })

    it('rejects packages/core/head/ — head is NOT in the sensitive set despite being core-level', () => {
      expect(isSensitiveSourceFile('packages/core/head/src/index.ts')).toBe(
        false,
      )
    })

    it('rejects packages/core/server/ — also NOT in the sensitive set', () => {
      expect(isSensitiveSourceFile('packages/core/server/src/handler.ts')).toBe(
        false,
      )
    })

    it('rejects a file under examples/', () => {
      expect(isSensitiveSourceFile('examples/playground/src/main.tsx')).toBe(
        false,
      )
    })

    it('rejects a file at the repo root', () => {
      expect(isSensitiveSourceFile('package.json')).toBe(false)
      expect(isSensitiveSourceFile('bun.lock')).toBe(false)
      expect(isSensitiveSourceFile('CLAUDE.md')).toBe(false)
    })
  })

  describe('rejects sensitive-shaped paths that are NOT under src/', () => {
    it('rejects packages/core/router/scripts/foo.ts', () => {
      expect(
        isSensitiveSourceFile('packages/core/router/scripts/foo.ts'),
      ).toBe(false)
    })

    it('rejects a path that contains "src" as a substring but not as a directory', () => {
      // `packages/core/router/srcsomething.ts` would startsWith match `src` (just-string)
      // but NOT `packages/core/router/src/` (with trailing slash). The implementation
      // uses the trailing slash; this regression test makes that explicit.
      expect(
        isSensitiveSourceFile('packages/core/router/srcSomething.ts'),
      ).toBe(false)
    })
  })
})

// ─── touchesSensitivePaths ──────────────────────────────────────────────────

describe('touchesSensitivePaths', () => {
  it('returns false for an empty list', () => {
    expect(touchesSensitivePaths([])).toBe(false)
  })

  it('returns false for the exact #1166 deps-bump shape (only package.json + CHANGELOG)', () => {
    // Reconstruct the file list from PR #1166's diff against sensitive packages.
    const files = [
      'package.json',
      'bun.lock',
      'packages/core/runtime-dom/package.json',
      'packages/core/router/package.json',
      'packages/core/head/package.json',
      'packages/core/server/package.json',
      'packages/core/core/package.json',
      'packages/core/compiler/package.json',
      'packages/core/runtime-server/package.json',
      'packages/zero/zero/package.json',
      '.github/workflows/native-device.yml',
      '.github/workflows/codeql.yml',
    ]
    expect(touchesSensitivePaths(files)).toBe(false)
  })

  it('returns true when ONE real source file is in the mixed list', () => {
    const files = [
      'package.json',
      'packages/core/runtime-dom/package.json',
      'packages/core/router/src/router.ts', // ← this is the trigger
      'docs/README.md',
    ]
    expect(touchesSensitivePaths(files)).toBe(true)
  })

  it('returns false when ALL sensitive-package files are tests', () => {
    const files = [
      'packages/core/router/src/router.test.ts',
      'packages/core/runtime-dom/src/__tests__/regression.tsx',
      'packages/core/compiler/src/tests/runtime/case.spec.ts',
    ]
    expect(touchesSensitivePaths(files)).toBe(false)
  })
})

// ─── sensitivePackagesTouched ───────────────────────────────────────────────

describe('sensitivePackagesTouched', () => {
  it('returns an empty array when nothing is sensitive', () => {
    expect(sensitivePackagesTouched(['packages/core/runtime-dom/package.json'])).toEqual([])
  })

  it('lists each package whose src/ was touched (deduped, sorted)', () => {
    const files = [
      'packages/core/router/src/match.ts',
      'packages/core/router/src/router.ts',
      'packages/core/runtime-dom/src/mount.ts',
      'packages/core/runtime-dom/src/nodes.ts',
      'packages/core/router/src/components.tsx',
    ]
    expect(sensitivePackagesTouched(files)).toEqual([
      'packages/core/router/',
      'packages/core/runtime-dom/',
    ])
  })

  it('excludes tests from the touched list', () => {
    const files = [
      'packages/core/router/src/router.test.ts', // test — excluded
      'packages/core/runtime-dom/src/mount.ts', // source — included
    ]
    expect(sensitivePackagesTouched(files)).toEqual([
      'packages/core/runtime-dom/',
    ])
  })
})

// ─── countCatalogEntries ────────────────────────────────────────────────────

describe('countCatalogEntries', () => {
  it('returns -1 when the marker is missing', () => {
    expect(countCatalogEntries('// some other file')).toBe(-1)
  })

  it('counts a small empty array as 0', () => {
    const src = `
${CATALOG_MARKER}
]
`
    expect(countCatalogEntries(src)).toBe(0)
  })

  it('counts simple entries by their `pattern:` keys (multi-line entry shape — real catalog convention)', () => {
    // The counting heuristic — `/^\s*pattern:/gm` — assumes `pattern:`
    // appears at line start. The real catalog formats each entry across
    // multiple lines (one key per line), which matches this assumption.
    // Tests must mirror the real shape; a single-line entry like
    // `{ pattern: /a/, diagnose: ... }` would not be counted, and that's
    // a deliberate constraint (we'd rather under-count an unusual format
    // and fail loud than over-count via a broader regex).
    const src = `
${CATALOG_MARKER}
  {
    pattern: /useState is not a function/,
    diagnose: () => ({ cause: 'x', fix: 'y' }),
  },
  {
    pattern: /useEffect is not a function/,
    diagnose: () => ({ cause: 'x', fix: 'y' }),
  },
]
`
    expect(countCatalogEntries(src)).toBe(2)
  })

  it('handles nested arrays in entry bodies without miscount', () => {
    // The walker tracks `[ ]` depth — nested brackets inside entry
    // bodies (e.g. an array literal in `diagnose`'s return) must NOT
    // close the outer ERROR_PATTERNS array.
    const src = `
${CATALOG_MARKER}
  {
    pattern: /Cannot read properties of null/,
    diagnose: () => ({ tags: ['null', 'access'], fix: 'guard' }),
  },
]
`
    expect(countCatalogEntries(src)).toBe(1)
  })

  it('counts the real CATALOG_FILE shape (smoke)', () => {
    // Constants are exported so tests can also assert the marker is present
    // — protects against accidental refactor that breaks the parser.
    expect(CATALOG_FILE).toBe('packages/core/compiler/src/diagnose.ts')
    expect(CATALOG_MARKER).toMatch(/ERROR_PATTERNS/)
  })
})

// ─── evaluateGate ───────────────────────────────────────────────────────────

describe('evaluateGate', () => {
  // Use the real multi-line catalog shape (one key per line) — the
  // parser's `^\s*pattern:` heuristic assumes this convention.
  const baseSource = `
${CATALOG_MARKER}
  {
    pattern: /a/,
    diagnose: () => ({}),
  },
  {
    pattern: /b/,
    diagnose: () => ({}),
  },
]
`
  const headSourceSameCount = `
${CATALOG_MARKER}
  {
    pattern: /a/,
    diagnose: () => ({}),
  },
  {
    pattern: /b/,
    diagnose: () => ({}),
  },
]
`
  const headSourceOneMore = `
${CATALOG_MARKER}
  {
    pattern: /a/,
    diagnose: () => ({}),
  },
  {
    pattern: /b/,
    diagnose: () => ({}),
  },
  {
    pattern: /c/,
    diagnose: () => ({}),
  },
]
`

  const ok = (over: Partial<GateInputs> = {}): GateInputs => ({
    files: ['packages/core/router/src/router.ts'],
    hasSkipLabel: false,
    headRef: 'feature/x',
    baseSource,
    headSource: headSourceSameCount,
    ...over,
  })

  it('skips when no sensitive files are touched (the #1166 deps-bump shape)', () => {
    const res: GateResult = evaluateGate(
      ok({ files: ['packages/core/router/package.json'] }),
    )
    expect(res).toEqual({ kind: 'skip-no-sensitive-files' })
  })

  it('skips on release-PR branch prefix `changeset-release/`', () => {
    const res = evaluateGate(ok({ headRef: 'changeset-release/main' }))
    expect(res).toEqual({
      kind: 'skip-release-pr',
      headRef: 'changeset-release/main',
    })
  })

  it('skips when the label is present', () => {
    const res = evaluateGate(ok({ hasSkipLabel: true }))
    expect(res).toEqual({ kind: 'skip-label' })
  })

  it('skips when baseSource is missing (first-time catalog-add edge case)', () => {
    const res = evaluateGate(ok({ baseSource: null }))
    expect(res).toEqual({ kind: 'skip-missing-base-catalog' })
  })

  it('fails when headSource is missing — catalog file was deleted at HEAD', () => {
    const res = evaluateGate(ok({ headSource: null }))
    expect(res).toEqual({ kind: 'fail-missing-head-catalog' })
  })

  it('fails on parse error if catalog shape changed', () => {
    const res = evaluateGate(
      ok({ baseSource: 'no marker here', headSource: 'no marker here' }),
    )
    expect(res).toEqual({ kind: 'fail-parse', baseCount: -1, headCount: -1 })
  })

  it('passes when catalog grew by 1', () => {
    const res = evaluateGate(ok({ headSource: headSourceOneMore }))
    expect(res).toEqual({ kind: 'ok', baseCount: 2, headCount: 3 })
  })

  it('fails when sensitive source changed but catalog did not grow', () => {
    const res = evaluateGate(ok())
    expect(res).toEqual({
      kind: 'fail-no-growth',
      baseCount: 2,
      headCount: 2,
      touched: ['packages/core/router/'],
    })
  })

  it('label takes priority over a fail-no-growth — the label bypass works post-source-change', () => {
    const res = evaluateGate(ok({ hasSkipLabel: true }))
    expect(res.kind).toBe('skip-label')
  })

  it('release-PR auto-skip takes priority over the label (label not needed on release PRs)', () => {
    const res = evaluateGate(
      ok({ headRef: 'changeset-release/main', hasSkipLabel: false }),
    )
    expect(res.kind).toBe('skip-release-pr')
  })

  it('the no-sensitive-files skip wins even when the label is also set (label is unnecessary)', () => {
    // Order of evaluation: no-sensitive-files first; the label decision
    // never runs. Documents the precedence so future refactors don't
    // accidentally invert it.
    const res = evaluateGate(
      ok({
        files: ['packages/core/router/CHANGELOG.md'],
        hasSkipLabel: true,
      }),
    )
    expect(res.kind).toBe('skip-no-sensitive-files')
  })
})

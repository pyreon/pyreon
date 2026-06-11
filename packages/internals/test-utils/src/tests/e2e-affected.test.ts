import {
  forcesFullRun,
  selectSuites,
  SUITES,
} from '../../../../../scripts/e2e-affected'

/**
 * Tests for the e2e suite selector (`scripts/e2e-affected.ts`).
 *
 * **Why this matters**: this script decides which e2e suites a PR runs in
 * the `e2e-suite` matrix (PR #603). A false-NEGATIVE — skipping a suite
 * that would have caught a regression — ships a real bug unblocked, so the
 * selection logic is load-bearing and must be unit-covered, not only
 * sanity-checked via the CLI (the "no subprocess-tested scripts" rule:
 * the script exposes a PURE `selectSuites(changed, {all})` exactly so the
 * policy can be asserted directly, with the git/IO/arg layer kept thin in
 * `main()`).
 *
 * Contract pinned here:
 *  - `all` flag → every suite (push:main / merge_group never narrows).
 *  - `changed === null` (diff couldn't be computed) → every suite (safe).
 *  - `changed === []` (nothing changed) → none (docs-only PR = green skip).
 *  - any `forcesFullRun` path → every suite (broad/unknowable radius).
 *  - otherwise → exactly the suites whose `triggers` prefix-match a
 *    changed path; generous supersets are fine, gaps are bugs.
 */

describe('selectSuites', () => {
  it('all=true → every suite (push:main / merge_group never narrows)', () => {
    expect(selectSuites(['examples/playground/x.ts'], { all: true })).toEqual(
      SUITES,
    )
    // all wins even over an otherwise-empty / null change set
    expect(selectSuites([], { all: true })).toEqual(SUITES)
    expect(selectSuites(null, { all: true })).toEqual(SUITES)
  })

  it('changed=null (diff failed: shallow clone / bad base) → every suite (safe)', () => {
    expect(selectSuites(null)).toEqual(SUITES)
  })

  it('changed=[] (nothing changed: docs-only PR) → no suites (green skip)', () => {
    expect(selectSuites([])).toEqual([])
  })

  it('a ui-core change selects the cssvars dogfood suite', () => {
    const names = selectSuites(['packages/ui-system/ui-core/src/config.ts']).map((x) => x.name)
    expect(names).toContain('cssvars')
  })

  it('a cssvars-bench / spec change selects the cssvars suite', () => {
    expect(selectSuites(['examples/cssvars-bench/src/main.tsx']).map((x) => x.name)).toContain(
      'cssvars',
    )
    expect(selectSuites(['e2e/cssvars-showcase.spec.ts']).map((x) => x.name)).toContain('cssvars')
  })

  it('forcesFullRun path → every suite', () => {
    for (const broad of [
      'bun.lock',
      'package.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'vitest.shared.ts',
      'vitest.browser.ts',
      '.github/workflows/ci.yml',
      'scripts/e2e-affected.ts',
      'playwright.config.ts',
      'e2e-configs/zero-hmr.config.ts',
      'packages/core/reactivity/src/signal.ts',
      'packages/core/core/src/h.ts',
      'packages/core/runtime-dom/src/mount.ts',
      'packages/core/compiler/src/jsx.ts',
      'packages/tools/vite-plugin/src/index.ts',
    ]) {
      expect(forcesFullRun(broad)).toBe(true)
      // even mixed with an otherwise-narrow change, the broad file wins
      expect(
        selectSuites([broad, 'examples/playground/only.ts']),
      ).toEqual(SUITES)
    }
  })

  it('forcesFullRun is NOT triggered by ordinary example / leaf-package files', () => {
    for (const narrow of [
      'examples/playground/src/App.tsx',
      'examples/ssr-showcase/src/routes/index.tsx',
      'packages/fundamentals/flow/src/flow.ts',
      'e2e/zero-hmr.spec.ts',
      'README.md',
      'docs/src/content/docs/index.md',
    ]) {
      expect(forcesFullRun(narrow)).toBe(false)
    }
  })

  it('narrow example-only change → only the suites that exercise it', () => {
    // app-showcase touches flow + dnd only
    const r = selectSuites(['examples/app-showcase/src/main.tsx'])
    expect(r.map((s) => s.name).sort()).toEqual(['app-showcase'])
  })

  it('compat-layer change → compat suite (and nothing unrelated)', () => {
    const r = selectSuites(['packages/tools/react-compat/src/jsx-runtime.ts'])
    expect(r.map((s) => s.name)).toEqual(['compat'])
  })

  it('ssr-showcase example change → the ssr/i18n/hmr family (its real blast radius)', () => {
    const names = selectSuites([
      'examples/ssr-showcase/src/routes/about.tsx',
    ]).map((s) => s.name)
    // core (playground+ssr-showcase+fundamentals), ssg-subpath, ssg-i18n,
    // ssg-i18n-prefix, zero-hmr all boot ssr-showcase.
    expect(names).toEqual(
      expect.arrayContaining([
        'core',
        'ssg-subpath',
        'ssg-i18n',
        'ssg-i18n-prefix',
        'zero-hmr',
      ]),
    )
    // ...but NOT the unrelated ones.
    expect(names).not.toContain('compat')
    expect(names).not.toContain('app-showcase')
  })

  it('docs-only change set → no suites', () => {
    expect(
      selectSuites(['docs/src/content/docs/zero.md', 'README.md', 'CLAUDE.md']),
    ).toEqual([])
  })

  it('every suite is uniquely named and maps to a test:e2e* script', () => {
    const names = SUITES.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    for (const s of SUITES) {
      expect(s.script === 'test:e2e' || s.script.startsWith('test:e2e:')).toBe(
        true,
      )
      expect(s.triggers.length).toBeGreaterThan(0)
    }
  })
})

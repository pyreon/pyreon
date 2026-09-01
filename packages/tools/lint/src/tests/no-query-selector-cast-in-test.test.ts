/**
 * Tests for `pyreon/no-query-selector-cast-in-test`.
 *
 * Locks in PRs #956 + #963 (test-any reduction effort's biggest win).
 * Without this rule, the next PR that adds a
 * `querySelector(X) as HTMLAnchorElement` pattern silently
 * re-introduces the 122-site regression PR #963 eliminated.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { noQuerySelectorCastInTest } from '../rules/architecture/no-query-selector-cast-in-test'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ON: LintConfig = {
  rules: { 'pyreon/no-query-selector-cast-in-test': 'error' },
}

// This rule now gates on `isProjectDependency(filePath, '@pyreon/test-utils')`
// (the PRIVATE package that exports `query()`), so it never fires in a consumer
// project that can't install it. Specs run inside a temp project that DOES
// declare it (mirroring the monorepo); the relative `filePath` is preserved
// under the temp root so substring `exemptPaths` cases still match.
let tmpRoot: string
const tmpDirsToClean: string[] = []
beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-lt9-qs-')))
  fs.writeFileSync(
    path.join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', devDependencies: { '@pyreon/test-utils': '*' } }),
  )
  tmpDirsToClean.push(tmpRoot)
})
afterAll(() => {
  for (const d of tmpDirsToClean) fs.rmSync(d, { recursive: true, force: true })
})
beforeEach(() => {
  _resetProjectDepsCache()
})

function lint(
  source: string,
  filePath: string,
  config: LintConfig = ON,
  root: string = tmpRoot,
): ReturnType<typeof lintFile> {
  const abs = path.join(root, filePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, source)
  return lintFile(abs, source, [noQuerySelectorCastInTest], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/no-query-selector-cast-in-test', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────

  it('FIRES on the canonical querySelector cast in a *.test.ts file', () => {
    const result = lint(
      `const anchor = el.querySelector('a') as HTMLAnchorElement`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('FIRES on attribute selectors with explicit generic-target shape', () => {
    const result = lint(
      `const card = container.querySelector('[data-card]') as HTMLDivElement`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('FIRES on `as HTMLY | null` union form (suggests queryOptional)', () => {
    const result = lint(
      `const modal = container.querySelector('.modal') as HTMLElement | null`,
      'packages/some/src/tests/foo.test.tsx',
    )
    const findings = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/no-query-selector-cast-in-test',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('queryOptional')
  })

  it('FIRES on plain `as HTMLElement` and suggests `query`', () => {
    const result = lint(
      `const root = container.querySelector('[role=main]') as HTMLElement`,
      'packages/some/src/tests/foo.test.ts',
    )
    const findings = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/no-query-selector-cast-in-test',
    )
    expect(findings).toHaveLength(1)
    // Suggests query (not queryOptional) at the call-site
    expect(findings[0]?.message).toContain('`query(X, S)`')
    expect(findings[0]?.message).not.toContain('`queryOptional(X, S)`')
  })

  it('FIRES on multiple sites in one file', () => {
    const result = lint(
      `const a = el.querySelector('a') as HTMLAnchorElement
       const b = el.querySelector('button') as HTMLButtonElement
       const c = el.querySelector('input') as HTMLInputElement`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(
      result.diagnostics.filter(
        (d) => d.ruleId === 'pyreon/no-query-selector-cast-in-test',
      ),
    ).toHaveLength(3)
  })

  it('FIRES on .tsx test files', () => {
    const result = lint(
      `const x = el.querySelector('div') as HTMLDivElement`,
      'packages/some/src/tests/foo.test.tsx',
    )
    expect(diagIds(result)).toContain('pyreon/no-query-selector-cast-in-test')
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────

  it('does NOT fire on production source files', () => {
    const result = lint(
      `const anchor = el.querySelector('a') as HTMLAnchorElement`,
      'packages/some/src/index.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('does NOT fire on non-HTML target types', () => {
    const result = lint(
      `const node = container.querySelector('div') as Node`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('does NOT fire on non-querySelector casts (event-handler pattern)', () => {
    const result = lint(
      `function onSubmit(e: Event) {
         const form = e.target as HTMLFormElement
         return form.elements
       }`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('does NOT fire on ref-init pattern (different shape, not querySelector)', () => {
    const result = lint(
      `const ref = { current: null as HTMLDivElement | null }`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('does NOT fire on the helper itself (`query<HTMLY>(...)`)', () => {
    const result = lint(
      `const anchor = query<HTMLAnchorElement>(el, 'a')
       const modal = queryOptional<HTMLElement>(el, '.modal')`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────

  it('does NOT fire when the path is exempt', () => {
    const config: LintConfig = {
      rules: {
        'pyreon/no-query-selector-cast-in-test': [
          'error',
          { exemptPaths: ['packages/legacy/'] },
        ],
      },
    }
    const result = lint(
      `const x = el.querySelector('a') as HTMLAnchorElement`,
      'packages/legacy/src/tests/foo.test.ts',
      config,
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })
  // ── Consumer-project gate (the fix for the upstream 0.43.1 finding) ────────
  it('does NOT fire in a project that does not declare @pyreon/test-utils', () => {
    const consumer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-lt9-qs-consumer-')))
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer-app', devDependencies: { vitest: '^3.0.0' } }),
    )
    tmpDirsToClean.push(consumer)
    const result = lint(
      `const anchor = el.querySelector('a') as HTMLAnchorElement`,
      'src/tests/foo.test.ts',
      ON,
      consumer,
    )
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

  // ── Shared isTestFile (the plan's last phase-0 residual) ─────────────────
  it.each([
    ['a .spec.ts file', 'src/foo.spec.ts'],
    ['a file under tests/', 'src/tests/helpers.ts'],
    ['a file under __tests__/', 'src/__tests__/helpers.ts'],
  ])('fires in %s, which the old inline regex missed', (_name, file) => {
    // This rule was the last of three still re-implementing `isTestFile`
    // inline, matching `*.test.ts(x)` alone. The narrowing excluded OTHER
    // test files rather than production code, which its own docstring's
    // rationale never justified. Measured before changing it: 52 files fall in
    // the gap and none contained the pattern — so this widening fixes a latent
    // inconsistency rather than a live hole, and these specs are what keep the
    // two definitions of "is this a test" from drifting apart again.
    const result = lint(`const a = el.querySelector('a') as HTMLAnchorElement`, file, ON)
    expect(diagIds(result)).toContain('pyreon/no-query-selector-cast-in-test')
  })

  it('still does not fire in production code', () => {
    const result = lint(`const a = el.querySelector('a') as HTMLAnchorElement`, 'src/widget.ts', ON)
    expect(diagIds(result)).not.toContain('pyreon/no-query-selector-cast-in-test')
  })

})

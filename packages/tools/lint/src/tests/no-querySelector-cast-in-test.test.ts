/**
 * Tests for `pyreon/no-querySelector-cast-in-test`.
 *
 * Locks in PRs #956 + #963 (test-any reduction effort's biggest win).
 * Without this rule, the next PR that adds a
 * `querySelector(X) as HTMLAnchorElement` pattern silently
 * re-introduces the 122-site regression PR #963 eliminated.
 */
import { noQuerySelectorCastInTest } from '../rules/architecture/no-querySelector-cast-in-test'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const ON: LintConfig = {
  rules: { 'pyreon/no-querySelector-cast-in-test': 'error' },
}

function lint(
  source: string,
  filePath: string,
  config: LintConfig = ON,
): ReturnType<typeof lintFile> {
  return lintFile(filePath, source, [noQuerySelectorCastInTest], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/no-querySelector-cast-in-test', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────

  it('FIRES on the canonical querySelector cast in a *.test.ts file', () => {
    const result = lint(
      `const anchor = el.querySelector('a') as HTMLAnchorElement`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).toContain('pyreon/no-querySelector-cast-in-test')
  })

  it('FIRES on attribute selectors with explicit generic-target shape', () => {
    const result = lint(
      `const card = container.querySelector('[data-card]') as HTMLDivElement`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).toContain('pyreon/no-querySelector-cast-in-test')
  })

  it('FIRES on `as HTMLY | null` union form (suggests queryOptional)', () => {
    const result = lint(
      `const modal = container.querySelector('.modal') as HTMLElement | null`,
      'packages/some/src/tests/foo.test.tsx',
    )
    const findings = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/no-querySelector-cast-in-test',
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
      (d) => d.ruleId === 'pyreon/no-querySelector-cast-in-test',
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
      result.diagnostics.filter((d) => d.ruleId === 'pyreon/no-querySelector-cast-in-test'),
    ).toHaveLength(3)
  })

  it('FIRES on .tsx test files', () => {
    const result = lint(
      `const x = el.querySelector('div') as HTMLDivElement`,
      'packages/some/src/tests/foo.test.tsx',
    )
    expect(diagIds(result)).toContain('pyreon/no-querySelector-cast-in-test')
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────

  it('does NOT fire on production source files', () => {
    const result = lint(
      `const anchor = el.querySelector('a') as HTMLAnchorElement`,
      'packages/some/src/index.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-querySelector-cast-in-test')
  })

  it('does NOT fire on non-HTML target types', () => {
    const result = lint(
      `const node = container.querySelector('div') as Node`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-querySelector-cast-in-test')
  })

  it('does NOT fire on non-querySelector casts (event-handler pattern)', () => {
    const result = lint(
      `function onSubmit(e: Event) {
         const form = e.target as HTMLFormElement
         return form.elements
       }`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-querySelector-cast-in-test')
  })

  it('does NOT fire on ref-init pattern (different shape, not querySelector)', () => {
    const result = lint(
      `const ref = { current: null as HTMLDivElement | null }`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-querySelector-cast-in-test')
  })

  it('does NOT fire on the helper itself (`query<HTMLY>(...)`)', () => {
    const result = lint(
      `const anchor = query<HTMLAnchorElement>(el, 'a')
       const modal = queryOptional<HTMLElement>(el, '.modal')`,
      'packages/some/src/tests/foo.test.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/no-querySelector-cast-in-test')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────

  it('does NOT fire when the path is exempt', () => {
    const config: LintConfig = {
      rules: {
        'pyreon/no-querySelector-cast-in-test': ['error', { exemptPaths: ['packages/legacy/'] }],
      },
    }
    const result = lint(
      `const x = el.querySelector('a') as HTMLAnchorElement`,
      'packages/legacy/src/tests/foo.test.ts',
      config,
    )
    expect(diagIds(result)).not.toContain('pyreon/no-querySelector-cast-in-test')
  })
})

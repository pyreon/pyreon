/**
 * Tests for the best-practice EXTEND batch:
 *   - pyreon/query-options-as-function   (now AUTO-FIXABLE — dep-gated @pyreon/query)
 *   - pyreon/i18n-prefer-trans-for-rich-jsx  (dep-gated @pyreon/i18n, category 'i18n')
 *   - pyreon/prefer-typed-search-params   (dep-gated @pyreon/router)
 *
 * Structure mirrors `library-bp-rules.test.ts`: each rule gets paired
 * FIRES / DOES-NOT-FIRE specs plus a dep-absent (auto-detect-off) spec
 * for the dep-gated rules. The rules are `optIn: true`; we pass the
 * rule objects explicitly as `rules[]` and layer explicit enabling
 * severity entries on top so the suite is robust regardless of central
 * registration.
 *
 * Bisect-verified (documented in the PR report):
 *  - query autofix: removing `fix:` from the report → autofix specs fail
 *    with `expected fix to be defined` / unchanged source.
 *  - i18n: removing the `context.report` → FIRES specs fail with
 *    `expected [...] to contain 'pyreon/i18n-prefer-trans-for-rich-jsx'`.
 *  - router: removing the `context.report` → FIRES specs fail with
 *    `expected [...] to contain 'pyreon/prefer-typed-search-params'`.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { i18nPreferTransForRichJsx } from '../rules/i18n/i18n-prefer-trans-for-rich-jsx'
import { queryOptionsAsFunction } from '../rules/query/query-options-as-function'
import { preferTypedSearchParams } from '../rules/router/prefer-typed-search-params'
import { applyFixes, lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const BP_RULES = [
  queryOptionsAsFunction,
  i18nPreferTransForRichJsx,
  preferTypedSearchParams,
]

const CONFIG: LintConfig = {
  rules: {
    'pyreon/query-options-as-function': 'error',
    'pyreon/i18n-prefer-trans-for-rich-jsx': 'info',
    'pyreon/prefer-typed-search-params': 'info',
  },
}

function lint(source: string, filePath: string) {
  return lintFile(filePath, source, BP_RULES, CONFIG)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

/** Make a tmp project dir with a package.json declaring `deps`. */
function mkProject(prefix: string, deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: `${prefix}app`, dependencies: deps }),
  )
  return dir
}

// ─── 1) pyreon/query-options-as-function (now AUTO-FIXABLE) ─────────────────

describe('pyreon/query-options-as-function — autofix (query, dep-gated)', () => {
  let queryDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    queryDir = mkProject('pyreon-qx-', { '@pyreon/query': '^0.1.0' })
    plainDir = mkProject('pyreon-qxp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(queryDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on useQuery({ ... }) object literal', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { const q = useQuery({ queryKey: ['k'] }); return q }`,
      join(queryDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain('pyreon/query-options-as-function')
  })

  it('FIRES on useInfiniteQuery({ ... }) and useSuspenseQuery({ ... })', () => {
    const result = lint(
      `import { useInfiniteQuery, useSuspenseQuery } from '@pyreon/query'
       function C() {
         useInfiniteQuery({ queryKey: ['a'] })
         useSuspenseQuery({ queryKey: ['b'] })
       }`,
      join(queryDir, 'src', 'B.tsx'),
    )
    const hits = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/query-options-as-function',
    )
    expect(hits.length).toBe(2)
  })

  it('does NOT fire on the correct function form useQuery(() => ({ ... }))', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { return useQuery(() => ({ queryKey: ['x'] })) }`,
      join(queryDir, 'src', 'C.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })

  it('does NOT fire on useMutation({ ... }) — mutation options ARE an object', () => {
    const result = lint(
      `import { useMutation } from '@pyreon/query'
       function C() { return useMutation({ mutationFn: f }) }`,
      join(queryDir, 'src', 'M.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })

  it('does NOT fire when @pyreon/query is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { return useQuery({ queryKey: ['x'] }) }`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })

  it('attaches a fix that wraps the object literal in a thunk', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { return useQuery({ queryKey: ['k'] }) }`,
      join(queryDir, 'src', 'F.tsx'),
    )
    const diag = result.diagnostics.find(
      (d) => d.ruleId === 'pyreon/query-options-as-function',
    )
    expect(diag?.fix).toBeDefined()
    expect(diag?.fix?.replacement).toBe(`() => ({ queryKey: ['k'] })`)
  })

  it('autofix turns useQuery({ ... }) into useQuery(() => ({ ... }))', () => {
    const source = `import { useQuery } from '@pyreon/query'
function C() { return useQuery({ queryKey: ['k'] }) }`
    const filePath = join(queryDir, 'src', 'Fix.tsx')
    const result = lint(source, filePath)
    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toBe(`import { useQuery } from '@pyreon/query'
function C() { return useQuery(() => ({ queryKey: ['k'] })) }`)
  })

  it('the autofixed code no longer triggers the rule', () => {
    const source = `import { useQuery } from '@pyreon/query'
function C() { return useQuery({ queryKey: ['k'] }) }`
    const filePath = join(queryDir, 'src', 'Reapply.tsx')
    const result = lint(source, filePath)
    const fixed = applyFixes(source, result.diagnostics)
    const second = lint(fixed, filePath)
    expect(diagIds(second)).not.toContain('pyreon/query-options-as-function')
  })
})

// ─── 2) pyreon/i18n-prefer-trans-for-rich-jsx ──────────────────────────────

describe('pyreon/i18n-prefer-trans-for-rich-jsx (i18n, dep-gated)', () => {
  let i18nDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    i18nDir = mkProject('pyreon-i18n-', { '@pyreon/i18n': '^0.1.0' })
    plainDir = mkProject('pyreon-i18np-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(i18nDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on {t(...)} interleaved with a JSX element sibling', () => {
    const result = lint(
      `import { useI18n } from '@pyreon/i18n'
       function C({ t }) {
         return <p>{t('intro')} <a href="/x">{t('link')}</a></p>
       }`,
      join(i18nDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain(
      'pyreon/i18n-prefer-trans-for-rich-jsx',
    )
  })

  it('FIRES on {t(...)} next to a <strong> emphasis element', () => {
    const result = lint(
      `import { useI18n } from '@pyreon/i18n'
       function C({ t }) {
         return <div>{t('lead')}<strong>!</strong></div>
       }`,
      join(i18nDir, 'src', 'B.tsx'),
    )
    expect(diagIds(result)).toContain(
      'pyreon/i18n-prefer-trans-for-rich-jsx',
    )
  })

  it('does NOT fire on plain {t(...)} with no element siblings (correct use)', () => {
    const result = lint(
      `import { useI18n } from '@pyreon/i18n'
       function C({ t }) { return <h1>{t('title')}</h1> }`,
      join(i18nDir, 'src', 'C.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/i18n-prefer-trans-for-rich-jsx',
    )
  })

  it('does NOT fire on {t(...)} alongside only plain text, no elements', () => {
    const result = lint(
      `import { useI18n } from '@pyreon/i18n'
       function C({ t }) { return <span>Hello {t('name')} welcome</span> }`,
      join(i18nDir, 'src', 'T.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/i18n-prefer-trans-for-rich-jsx',
    )
  })

  it('does NOT fire on a JSX element with elements but NO t() call', () => {
    const result = lint(
      `import { useI18n } from '@pyreon/i18n'
       function C() { return <p>plain <a href="/x">link</a></p> }`,
      join(i18nDir, 'src', 'NoT.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/i18n-prefer-trans-for-rich-jsx',
    )
  })

  it('does NOT fire when @pyreon/i18n is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { useI18n } from '@pyreon/i18n'
       function C({ t }) { return <p>{t('intro')} <a href="/x">{t('link')}</a></p> }`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/i18n-prefer-trans-for-rich-jsx',
    )
  })
})

// ─── 3) pyreon/prefer-typed-search-params ──────────────────────────────────

describe('pyreon/prefer-typed-search-params (router, dep-gated)', () => {
  let routerDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    routerDir = mkProject('pyreon-rt-', { '@pyreon/router': '^0.1.0' })
    plainDir = mkProject('pyreon-rtp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(routerDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on new URLSearchParams(location.search) in a router file', () => {
    const result = lint(
      `import { useRoute } from '@pyreon/router'
       function C() {
         const p = new URLSearchParams(location.search)
         return p.get('page')
       }`,
      join(routerDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain('pyreon/prefer-typed-search-params')
  })

  it('FIRES on a second new URLSearchParams() construction', () => {
    const result = lint(
      `import { useRoute } from '@pyreon/router'
       function C() {
         const a = new URLSearchParams(window.location.search)
         const b = new URLSearchParams('q=1')
         return [a, b]
       }`,
      join(routerDir, 'src', 'B.tsx'),
    )
    const hits = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/prefer-typed-search-params',
    )
    expect(hits.length).toBe(2)
  })

  it('does NOT fire on useTypedSearchParams (the correct form)', () => {
    const result = lint(
      `import { useTypedSearchParams } from '@pyreon/router'
       function C() { return useTypedSearchParams({ page: 'number' }) }`,
      join(routerDir, 'src', 'C.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/prefer-typed-search-params',
    )
  })

  it('does NOT fire on new URLSearchParams() in a NON-router file', () => {
    const result = lint(
      `function parse(s) { return new URLSearchParams(s) }`,
      join(routerDir, 'src', 'NoImport.ts'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/prefer-typed-search-params',
    )
  })

  it('does NOT fire when @pyreon/router is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { useRoute } from '@pyreon/router'
       function C() { return new URLSearchParams(location.search) }`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/prefer-typed-search-params',
    )
  })
})

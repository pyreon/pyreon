/**
 * Shape matrices, third batch — the seams AROUND the rules: the runner's
 * extension gate and fix application, the text reporter's totals line, the
 * `why-off` explainer, the unknown-config diagnostics, the file-role
 * classifiers and the manifest readers — plus the last few rule branches a
 * real file reaches that the first two batches did not.
 *
 * Same discipline as batches 4 and 5: every `it` pairs the shape a seam must
 * act on with the one it must leave alone, and every REFUSAL (no manifest,
 * no name, no extension, an override for a rule that does not exist) is
 * asserted quiet. Most of these are the paths a consumer hits FIRST — an
 * unknown-rule typo, a missing package.json, a `--rule-options` for a rule
 * the preset turned off — and they had no spec at all.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyFixes, fixEdits, lintFile } from '../runner'
import { lint } from '../lint'
import { formatText } from '../reporter'
import { explainRuleState, formatRuleState } from '../why-off'
import { diagnoseUnknownConfigKeys } from '../utils/unknown-config'
import { isApiRouteFile, isClientFile } from '../utils/file-roles'
import {
  _resetProjectDepsCache,
  getNearestPackageName,
  isEsmFile,
  isProjectDependency,
} from '../utils/project-deps'
import type { Diagnostic, LintConfig, LintResult, Rule } from '../types'
import { noUnstableRenderId } from '../rules/isomorphic/no-unstable-render-id'
import { noEnvBranchInRender } from '../rules/isomorphic/no-env-branch-in-render'
import { requireStableIterationOrder } from '../rules/isomorphic/require-stable-iteration-order'
import { noLineCommentInJsx } from '../rules/jsx/no-line-comment-in-jsx'
import { noQuerySelectorCastInTest } from '../rules/architecture/no-query-selector-cast-in-test'
import { requireBrowserSmokeTest } from '../rules/architecture/require-browser-smoke-test'
import { noRedundantRole } from '../rules/frontend/no-redundant-role'
import { noMutateStoreState } from '../rules/store/no-mutate-store-state'
import { noSignalCallWrite } from '../rules/reactivity/no-signal-call-write'

const SIG = `import { signal } from '@pyreon/reactivity'\n`

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-shapes6-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/shape-fixture-6',
      dependencies: { '@pyreon/core': '*', '@pyreon/reactivity': '*', '@pyreon/store': '*', '@pyreon/test-utils': '*' },
    }),
  )
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

let seq = 0
function diags(rule: Rule, source: string, file?: string, options?: Record<string, unknown>) {
  const rel = file ?? `src/f${seq++}.tsx`
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, source)
  const config: LintConfig = { rules: { [rule.meta.id]: options ? ['error', options] : 'error' } }
  return lintFile(abs, source, [rule], config).diagnostics.filter((d) => d.ruleId === rule.meta.id)
}
const count = (rule: Rule, source: string, file?: string, options?: Record<string, unknown>): number =>
  diags(rule, source, file, options).length

describe('runner seams', () => {
  it('lintFile refuses a path with NO extension instead of guessing a parser', () => {
    // A `Makefile` or an extensionless script handed to the runner must come
    // back empty, not be parsed as TypeScript and reported on.
    const abs = join(root, 'src', 'Makefile')
    mkdirSync(dirname(abs), { recursive: true })
    const src = `${SIG}const c = signal(0)\nc(5)`
    writeFileSync(abs, src)
    const config: LintConfig = { rules: { 'pyreon/no-signal-call-write': 'error' } }
    expect(lintFile(abs, src, [noSignalCallWrite], config).diagnostics).toEqual([])
  })

  it('standalone lintFile prints an ERROR-severity option diagnostic to console.error, and skips the rule', () => {
    // No sink → stderr. A malformed `string[]` option is an error, not a
    // warning, and the rule must not run against options it rejected.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const n = count(
        requireBrowserSmokeTest,
        'export const x = 1',
        'pkg-bad/src/index.ts',
        { additionalPackages: 42 },
      )
      expect(n).toBe(0)
      expect(spy).toHaveBeenCalled()
      expect(String(spy.mock.calls[0]?.[0])).toContain('[pyreon-lint]')
    } finally {
      spy.mockRestore()
    }
  })

  it('applyFixes skips a diagnostic whose fix is an EMPTY edit list', () => {
    const src = 'const a = 1'
    const d: Diagnostic = {
      ruleId: 'pyreon/x',
      severity: 'error',
      message: 'm',
      span: { start: 0, end: 5 },
      loc: { line: 1, column: 1 },
      fix: [],
    }
    expect(applyFixes(src, [d])).toBe(src)
    // The control: one real edit applies.
    const real: Diagnostic = { ...d, fix: { span: { start: 6, end: 7 }, replacement: 'b' } }
    expect(applyFixes(src, [real])).toBe('const b = 1')
  })
})

describe('lint() option overrides — the two refusals', () => {
  it('keeps a tuple WITHOUT options runnable, and does not enable a rule the config never named', () => {
    const dir = join(root, 'proj-overrides')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(
      join(dir, '.pyreonlintrc.json'),
      JSON.stringify({ rules: { 'pyreon/no-signal-call-write': ['error'] } }),
    )
    writeFileSync(join(dir, 'src', 'a.ts'), `${SIG}const c = signal(0)\nc(5)`)
    const prev = process.cwd()
    try {
      process.chdir(dir)
      const result = lint({
        paths: ['src'],
        config: join(dir, '.pyreonlintrc.json'),
        ruleOptionsOverrides: {
          // `['error']` — tuple form with no options object to merge into.
          'pyreon/no-signal-call-write': { x: 1 },
          // Not a rule at all. An options override is not an enable: it must
          // fall through as `off`, never manufacture a rule entry.
          'pyreon/does-not-exist': { y: 2 },
        },
      })
      expect(result.totalErrors).toBe(1)
      expect(result.files.flatMap((f) => f.diagnostics.map((d) => d.ruleId))).toEqual([
        'pyreon/no-signal-call-write',
      ])
    } finally {
      process.chdir(prev)
    }
  })
})

describe('formatText totals line', () => {
  const base = (over: Partial<LintResult>): LintResult => ({
    files: [],
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
    configDiagnostics: [],
    ...over,
  })

  it('pluralizes errors and warnings by count, and lists info', () => {
    const one = formatText(base({ totalErrors: 1, totalWarnings: 1 }))
    expect(one).toContain('1 error')
    expect(one).not.toContain('1 errors')
    expect(one).toContain('1 warning')
    expect(one).not.toContain('1 warnings')
    const many = formatText(base({ totalErrors: 2, totalWarnings: 3, totalInfos: 4 }))
    expect(many).toContain('2 errors')
    expect(many).toContain('3 warnings')
    expect(many).toContain('4 info')
  })

  it('prints NO totals line for a clean run, and only the non-zero parts otherwise', () => {
    expect(formatText(base({}))).toBe('')
    const warnOnly = formatText(base({ totalWarnings: 1 }))
    expect(warnOnly).toContain('1 warning')
    expect(warnOnly).not.toContain('error')
  })
})

describe('why-off explainer', () => {
  it('names near-miss rule ids for a typo, and renders them as "Did you mean"', () => {
    const state = explainRuleState('no-signal-call-writ', { config: { rules: {} } })
    expect(state.found).toBe(false)
    expect(state.suggestions).toContain('pyreon/no-signal-call-write')
    const text = formatRuleState(state)
    expect(text).toContain('unknown rule')
    expect(text).toContain('Did you mean')
    expect(text).toContain('pyreon/no-signal-call-write')
  })

  it('reads exemptPaths out of the TUPLE form and reports the configured severity', () => {
    const state = explainRuleState('pyreon/no-signal-call-write', {
      config: { rules: { 'pyreon/no-signal-call-write': ['warn', { exemptPaths: ['src/legacy/'] }] } },
    })
    expect(state.found).toBe(true)
    expect(state.severity).toBe('warn')
    expect(state.exemptPaths).toEqual(['src/legacy/'])
    expect(state.willRun).toBe(true)
  })
})

describe('diagnoseUnknownConfigKeys — the settings half', () => {
  it('lists the known settings when nothing is near, and says nothing extra when no rule declares any', () => {
    const withKnown = diagnoseUnknownConfigKeys(
      { settings: { zzzz: 1 } },
      [],
      ['portablePaths', 'heavyModules'],
    )
    expect(withKnown).toHaveLength(1)
    expect(withKnown[0]?.ruleId).toBe('settings.zzzz')
    expect(withKnown[0]?.message).toContain('Known settings: heavyModules, portablePaths')
    const none = diagnoseUnknownConfigKeys({ settings: { zzzz: 1 } }, [], [])
    expect(none[0]?.message).not.toContain('Known settings')
    expect(none[0]?.message).not.toContain('Did you mean')
    // A near miss gets the did-you-mean, not the full list.
    const near = diagnoseUnknownConfigKeys({ settings: { portablePath: 1 } }, [], ['portablePaths'])
    expect(near[0]?.message).toContain('Did you mean: portablePaths')
  })
})

describe('file-role classifiers on the RELATIVE and entry-name shapes', () => {
  it('isApiRouteFile accepts a `routes/`-rooted relative path', () => {
    expect(isApiRouteFile('routes/api/items.ts')).toBe(true)
    expect(isApiRouteFile('routes/api/items.tsx')).toBe(false)
    expect(isApiRouteFile('lib/api/items.ts')).toBe(false)
  })

  it('isClientFile recognizes `*.client.ts` and an `entry-client` path without reading source', () => {
    expect(isClientFile('/app/src/widget.client.ts')).toBe(true)
    expect(isClientFile('/app/src/entry-client.ts')).toBe(true)
    expect(isClientFile('/app/src/widget.ts')).toBe(false)
  })
})

describe('project-deps manifest readers', () => {
  it('getNearestPackageName returns null for a manifest with a non-string name', () => {
    const dir = join(root, 'noname')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 5 }))
    _resetProjectDepsCache()
    expect(getNearestPackageName(join(dir, 'src', 'a.ts'))).toBeNull()
  })

  it('a package counts as depending on ITSELF', () => {
    // Its own source uses its own APIs, so best-practice rules keyed on the
    // dependency must cover the library's own tree.
    _resetProjectDepsCache()
    expect(isProjectDependency(join(root, 'src', 'a.ts'), '@pyreon/shape-fixture-6')).toBe(true)
    expect(isProjectDependency(join(root, 'src', 'a.ts'), '@pyreon/not-declared')).toBe(false)
  })

  it('isEsmFile decides `.cjs`/`.cts` by EXTENSION before reading any manifest', () => {
    const dir = join(root, 'esm')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'esm', type: 'module' }))
    _resetProjectDepsCache()
    expect(isEsmFile(join(dir, 'a.cjs'))).toBe(false)
    expect(isEsmFile(join(dir, 'a.cts'))).toBe(false)
    expect(isEsmFile(join(dir, 'a.js'))).toBe(true)
  })
})

describe('require-browser-smoke-test — the manifest refusals', () => {
  it('is quiet with NO package.json, with a non-string name, and runs on a named package', () => {
    const src = 'export const x = 1'
    expect(count(requireBrowserSmokeTest, src, 'pkg-none/src/index.ts')).toBe(0)
    mkdirSync(join(root, 'pkg-num'), { recursive: true })
    writeFileSync(join(root, 'pkg-num', 'package.json'), JSON.stringify({ name: 7 }))
    expect(count(requireBrowserSmokeTest, src, 'pkg-num/src/index.ts')).toBe(0)
    // Named AND listed via `additionalPackages`, with no browser test → fires.
    mkdirSync(join(root, 'pkg-named'), { recursive: true })
    writeFileSync(join(root, 'pkg-named', 'package.json'), JSON.stringify({ name: '@acme/browser-thing' }))
    expect(
      count(requireBrowserSmokeTest, src, 'pkg-named/src/index.ts', {
        additionalPackages: ['@acme/browser-thing'],
      }),
    ).toBe(1)
    // Second run in the same process takes the cached package list.
    expect(
      count(requireBrowserSmokeTest, src, 'pkg-named/src/index.ts', {
        additionalPackages: ['@acme/browser-thing'],
      }),
    ).toBe(1)
  })
})

describe('rule branches a real file reaches', () => {
  it('no-unstable-render-id names `crypto.getRandomValues` and `Date.now`, incl. inside a template', () => {
    expect(count(noUnstableRenderId, `export const A = () => <div id={crypto.getRandomValues(new Uint8Array(1))[0]} />`)).toBe(1)
    expect(count(noUnstableRenderId, `export const A = () => <div id={Date.now()} />`)).toBe(1)
    expect(count(noUnstableRenderId, 'export const A = () => <div id={`x-${Math.random()}`} />')).toBe(1)
    expect(count(noUnstableRenderId, `export const A = () => <div id={createUniqueId()} />`)).toBe(0)
  })

  it('no-env-branch-in-render fires on the `||` spelling too', () => {
    expect(count(noEnvBranchInRender, `import { isServer } from '@pyreon/core'\nexport const A = () => <div>{isServer || <b/>}</div>`)).toBe(1)
  })

  it('require-stable-iteration-order is quiet for an ORDERED member call receiver', () => {
    expect(count(requireStableIterationOrder, `export const A = () => <ul>{Object.keys(o).map((k) => <li>{k}</li>)}</ul>`)).toBe(1)
    // `.slice()` preserves the array's own order — nothing to sort.
    expect(count(requireStableIterationOrder, `export const A = () => <ul>{list.slice().map((k) => <li>{k}</li>)}</ul>`)).toBe(0)
  })

  it('no-line-comment-in-jsx treats a MEMBER-tag parent as a non-code tag', () => {
    // `<Ui.Card>` has no plain name to test against the code-tag list, so it
    // is an ordinary element and the comment renders.
    expect(count(noLineCommentInJsx, `export const A = () => <Ui.Card>\n  // note\n  <b/></Ui.Card>`)).toBe(1)
    expect(count(noLineCommentInJsx, `export const A = () => <code>\n  // note\n  <b/></code>`)).toBe(0)
  })

  it('no-query-selector-cast-in-test sees through an ARRAY type', () => {
    expect(
      count(noQuerySelectorCastInTest, `const els = document.querySelectorAll('.x') as unknown as HTMLElement[]`, 'src/tests/a.test.ts'),
    ).toBe(1)
    expect(
      count(noQuerySelectorCastInTest, `const els = document.querySelectorAll('.x') as unknown as Element[]`, 'src/tests/b.test.ts'),
    ).toBe(0)
  })

  it('no-redundant-role removes the attribute cleanly when it starts a LINE', () => {
    const d = diags(noRedundantRole, `export const A = () => <button\n  role="button">x</button>`)
    expect(d).toHaveLength(1)
    const fix = d[0]?.fix
    expect(fix ? fixEdits(fix).map((e) => e.replacement) : null).toEqual([''])
  })

  it('no-mutate-store-state refuses a store bound from a CALLED-CALL and a non-identifier receiver', () => {
    const IMP = `import { useCartStore } from '@pyreon/store'\n`
    expect(count(noMutateStoreState, `${IMP}export const A = () => { const cart = useCartStore(); cart.total.set(1); return null }`)).toBe(1)
    // `(getStore())()` — the callee is itself a call; the rule cannot name it.
    expect(count(noMutateStoreState, `${IMP}export const A = () => { const cart = (getStore())(); cart.total.set(1); return null }`)).toBe(0)
    // `this.cart.total.set()` — the outer receiver is not an identifier.
    expect(count(noMutateStoreState, `${IMP}export const A = () => { const cart = useCartStore(); this.cart.total.set(1); return null }`)).toBe(0)
  })
})

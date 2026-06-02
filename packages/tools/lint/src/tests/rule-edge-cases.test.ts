/**
 * Coverage-focused tests for edge-case branches in lightweight JSX rules.
 *
 * Each rule has a defensive `if (node.name?.type !== 'JSXIdentifier') return`
 * that fires for namespaced attribute names (`xml:lang`, `xlink:href`) —
 * the JSX parser produces `JSXNamespacedName` nodes there. Test ensures
 * the rule doesn't crash on the bail path and doesn't false-fire on
 * namespaced attrs.
 */
import { describe, expect, it } from 'vitest'
import type { LintConfig } from '../types'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'

const fp = '/abs/packages/core/foo/src/x.tsx'
const defaultConfig = (): LintConfig => getPreset('recommended')
const find = (result: ReturnType<typeof lintFile>, ruleId: string) =>
  result.diagnostics.filter((d) => d.ruleId === ruleId)

describe('JSX rules — namespaced attribute bail-out', () => {
  it('no-classname does NOT crash on JSXNamespacedName attr (xml:lang)', () => {
    const result = lintFile(
      fp,
      `const X = () => <svg xml:lang="en" />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-classname').length).toBe(0)
  })

  it('no-htmlfor does NOT crash on namespaced attr', () => {
    const result = lintFile(
      fp,
      `const X = () => <svg xlink:href="#a" />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-htmlfor').length).toBe(0)
  })

  it('use-by-not-key does NOT crash on namespaced JSX attribute', () => {
    const result = lintFile(
      fp,
      `const X = () => <svg xlink:href="#a" />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/use-by-not-key').length).toBe(0)
  })
})

describe('Styling rules — bail-out branches', () => {
  it('no-inline-style-object bails on style without value (string-only attr)', () => {
    // <div style /> — bare attribute, no value at all (covers the !value branch)
    const result = lintFile(fp, `const X = () => <div style />`, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-inline-style-object').length).toBe(0)
  })

  it('no-inline-style-object bails on string style value', () => {
    // <div style="color: red" /> — value present but not an expression container
    const result = lintFile(
      fp,
      `const X = () => <div style="color: red" />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-inline-style-object').length).toBe(0)
  })

  it('no-inline-style-object fires on inline object literal', () => {
    const result = lintFile(
      fp,
      `const X = () => <div style={{ color: 'red' }} />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-inline-style-object').length).toBeGreaterThan(0)
  })
})

describe('Frontend a11y rules — bail-out branches', () => {
  it('no-redundant-role does not flag <a> with dynamic href={...}', () => {
    // exercises the dynamic-href skip branch
    const result = lintFile(
      fp,
      `const X = ({ href }) => <a href={href} role="link">x</a>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-redundant-role').length).toBe(0)
  })

  it('no-redundant-role does not flag elements without role', () => {
    const result = lintFile(fp, `const X = () => <button>x</button>`, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-redundant-role').length).toBe(0)
  })

  it('no-discarded-optimize-fields handles JSX without obvious shape', () => {
    const result = lintFile(fp, `const X = () => <div />`, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-discarded-optimize-fields').length).toBe(0)
  })
})

describe('Heading-order — function-scope branches', () => {
  const CFG: LintConfig = { rules: { 'pyreon/heading-order': 'warn' } }

  it('per-FunctionDeclaration scope: sibling function does not see parent headings', () => {
    // exercises FunctionDeclaration / FunctionDeclaration:exit (lines 56-57)
    const result = lintFile(
      fp,
      `
        function A() { return <div><h1>A1</h1></div> }
        function B() { return <div><h3>B3</h3></div> }
        export default A
      `,
      allRules,
      CFG,
    )
    // No FIRES — B's h3 is in its own function scope, no preceding h2 needed
    expect(find(result, 'pyreon/heading-order').length).toBe(0)
  })

  it('per-FunctionExpression scope: function expression resets the heading frame', () => {
    // exercises FunctionExpression / FunctionExpression:exit (lines 58-59)
    const result = lintFile(
      fp,
      `
        const A = function () { return <div><h1>A1</h1></div> }
        const B = function () { return <div><h3>B3</h3></div> }
        export default A
      `,
      allRules,
      CFG,
    )
    expect(find(result, 'pyreon/heading-order').length).toBe(0)
  })

  it('exemptPaths skips entire rule body', () => {
    const config: LintConfig = {
      rules: {
        'pyreon/heading-order': ['warn', { exemptPaths: ['/abs/packages/core/foo/'] }],
      },
    }
    const result = lintFile(
      fp,
      `export default () => <div><h1>A</h1><h3>C</h3></div>`,
      allRules,
      config,
    )
    expect(find(result, 'pyreon/heading-order').length).toBe(0)
  })
})

describe('Reactivity edge bails', () => {
  it('no-context-destructure does NOT flag non-useContext call expressions', () => {
    const result = lintFile(
      fp,
      `const X = () => { const { x } = obj; return null }`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-context-destructure').length).toBe(0)
  })

  it('no-effect-assignment handles effect() without assignment inside', () => {
    const result = lintFile(
      fp,
      `import { effect } from '@pyreon/reactivity'
       const X = () => { effect(() => { console.log('x') }); return null }`,
      allRules,
      defaultConfig(),
    )
    // no assignment → no flag
    expect(find(result, 'pyreon/no-effect-assignment').length).toBe(0)
  })
})

describe('Store rule edge bails', () => {
  it('no-duplicate-store-id with same id in different files does not crash single-file lint', () => {
    const result = lintFile(
      fp,
      `import { defineStore } from '@pyreon/store'
       const s = defineStore('foo', () => ({}))`,
      allRules,
      defaultConfig(),
    )
    // single file → no duplicate
    expect(find(result, 'pyreon/no-duplicate-store-id').length).toBe(0)
  })

  it('no-mutate-store-state handles store without mutations', () => {
    const result = lintFile(
      fp,
      `import { defineStore } from '@pyreon/store'
       const s = defineStore('a', () => ({}))`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-mutate-store-state').length).toBe(0)
  })
})

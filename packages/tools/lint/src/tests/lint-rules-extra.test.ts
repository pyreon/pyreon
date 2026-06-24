import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'

const defaultConfig = (): LintConfig => getPreset('recommended')
const find = (
  result: ReturnType<typeof lintFile>,
  id: string,
): ReturnType<typeof lintFile>['diagnostics'] =>
  result.diagnostics.filter((d) => d.ruleId === id)

describe('pyreon/no-error-without-prefix (architecture)', () => {
  it('flags `throw new Error("msg")` without [Pyreon] prefix', () => {
    const code = `function f() { throw new Error("oops") }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-error-without-prefix')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag when [Pyreon] prefix is present', () => {
    const code = `function f() { throw new Error("[Pyreon] oops") }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('flags template literal Error without prefix', () => {
    const code = `function f(x) { throw new Error(\`oops \${x}\`) }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-error-without-prefix')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag template literal with [Pyreon] prefix', () => {
    const code = `function f(x) { throw new Error(\`[Pyreon] oops \${x}\`) }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT flag the scoped [@pyreon/<pkg>] convention (string)', () => {
    const code = `function f() { throw new Error("[@pyreon/state-tree] not a model instance") }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT flag the scoped [@pyreon/<pkg>] convention (template)', () => {
    const code = `function f(x) { throw new Error(\`[@pyreon/hotkeys] invalid shortcut: \${x}\`) }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('still flags an unrelated bracket prefix (e.g. [Vue])', () => {
    const code = `function f() { throw new Error("[Vue] oops") }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBeGreaterThan(0)
  })

  it('does NOT fire under an exemptPaths entry (e.g. CLI scaffolders)', () => {
    const config: LintConfig = {
      rules: {
        ...defaultConfig().rules,
        'pyreon/no-error-without-prefix': ['warn', { exemptPaths: ['packages/zero/create-zero/'] }],
      },
    }
    const code = `function f() { throw new Error("Project name cannot be empty.") }`
    const result = lintFile('/abs/packages/zero/create-zero/src/args.ts', code, allRules, config)
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire on throws of non-Error values', () => {
    const code = `function f() { throw "string" }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire on throws of non-Identifier callee (new x.Error())', () => {
    const code = `function f() { throw new x.Error("oops") }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire on Error() with no args (empty throw)', () => {
    const code = `function f() { throw new Error() }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire in test files', () => {
    const code = `function f() { throw new Error("oops") }`
    const result = lintFile(
      '/abs/packages/core/foo/src/tests/x.test.ts',
      code,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })
})

describe('pyreon/no-map-in-jsx (jsx)', () => {
  it('flags arr.map((x) => <li>{x}</li>) inside JSX text expression', () => {
    const code = `function App({ items }) { return <ul>{items.map((x) => <li>{x}</li>)}</ul> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-map-in-jsx')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag arr.map at module/function scope (not inside JSX)', () => {
    const code = `const list = [1,2,3].map(x => x*2); export { list }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-map-in-jsx').length).toBe(0)
  })
})

describe('pyreon/no-index-as-by (jsx)', () => {
  it('flags <For by={(_, i) => i}> shape', () => {
    const code = `function App({ items }) { return <For each={items} by={(_, i) => i}>{(x) => <li>{x}</li>}</For> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-index-as-by')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag <For by={item => item.id}>', () => {
    const code = `function App({ items }) { return <For each={items} by={(it) => it.id}>{(x) => <li>{x.name}</li>}</For> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-index-as-by').length).toBe(0)
  })
})

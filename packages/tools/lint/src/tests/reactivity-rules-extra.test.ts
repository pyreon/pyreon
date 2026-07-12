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

describe('pyreon/no-signal-in-loop — fires inside each loop kind', () => {
  for (const [name, snippet] of [
    ['for', `for (let i = 0; i < 5; i++) { const s = signal(0) }`],
    ['for-in', `for (const k in obj) { const s = signal(0) }`],
    ['for-of', `for (const x of arr) { const s = computed(() => x) }`],
    ['while', `while (true) { const s = signal(0); break }`],
    ['do-while', `do { const s = signal(0) } while (false)`],
  ] as const) {
    it(`flags signal() in a ${name} loop`, () => {
      const code = `function f() { ${snippet} }`
      const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
      const diags = find(result, 'pyreon/no-signal-in-loop')
      expect(diags.length).toBeGreaterThan(0)
    })
  }

  it('does NOT fire for signal() at module scope', () => {
    const code = `const s = signal(0)`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-signal-in-loop')
    expect(diags.length).toBe(0)
  })

  it('does NOT fire for non-signal/computed calls inside loop', () => {
    const code = `for (let i = 0; i < 5; i++) { console.log(i) }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-signal-in-loop')
    expect(diags.length).toBe(0)
  })
})

describe('pyreon/no-signal-in-props — fires on Component JSX prop with signal call', () => {
  it('flags a signal-BINDING read in a component prop (the real bug shape)', () => {
    // LT-5: the callee must resolve to a `signal()`/`computed()` binding — the
    // realistic "captured once" bug is `<MyComp value={count()}>`, not calling
    // `signal()` inline (which creates a fresh signal, a different shape).
    const code = `const count = signal(0); function App() { return <MyComp value={count()} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-signal-in-props')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT fire on lowercase tag (<div>)', () => {
    const code = `function App() { return <div value={signal()} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-signal-in-props')
    expect(diags.length).toBe(0)
  })

  it('does NOT fire on expressions that are not CallExpressions', () => {
    const code = `function App() { return <MyComp value={42} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-signal-in-props')
    expect(diags.length).toBe(0)
  })

  it('does NOT fire when callee is not Identifier (member-expr call)', () => {
    const code = `function App() { return <MyComp value={obj.fn()} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-signal-in-props')
    expect(diags.length).toBe(0)
  })
})

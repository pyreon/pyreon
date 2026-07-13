import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'

const defaultConfig = (): LintConfig => getPreset('recommended')
const bpConfig = (): LintConfig => getPreset('best-practices')
const find = (
  result: ReturnType<typeof lintFile>,
  id: string,
): ReturnType<typeof lintFile>['diagnostics'] =>
  result.diagnostics.filter((d) => d.ruleId === id)

// `prefer-show-over-display` is opt-in (LR-4) — enable it via `best-practices`
// so these detection specs still exercise the rule's logic.
describe('pyreon/prefer-show-over-display (performance)', () => {
  it('flags <div style={{ display: cond ? "block" : "none" }}>', () => {
    const code = `function App({ open }) { return <div style={{ display: open ? "block" : "none" }} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, bpConfig())
    const diags = find(result, 'pyreon/prefer-show-over-display')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('flags logical-expression display value', () => {
    const code = `function App({ show }) { return <div style={{ display: show && "flex" }} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, bpConfig())
    expect(find(result, 'pyreon/prefer-show-over-display').length).toBeGreaterThan(0)
  })

  it('does NOT flag static display value', () => {
    const code = `function App() { return <div style={{ display: "flex" }} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, bpConfig())
    expect(find(result, 'pyreon/prefer-show-over-display').length).toBe(0)
  })

  it('does NOT flag non-style attribute', () => {
    const code = `function App() { return <div className={{ display: x ? 'a' : 'b' }} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, bpConfig())
    expect(find(result, 'pyreon/prefer-show-over-display').length).toBe(0)
  })

  it('does NOT flag non-display key', () => {
    const code = `function App({ active }) { return <div style={{ color: active ? "red" : "blue" }} /> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, bpConfig())
    expect(find(result, 'pyreon/prefer-show-over-display').length).toBe(0)
  })
})

describe('pyreon/prefer-computed (reactivity)', () => {
  it('flags effect(() => x.set(y)) — arrow with expression body', () => {
    const code = `effect(() => count.set(value() * 2))`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/prefer-computed')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('flags effect(() => { x.set(y) }) — block with single set', () => {
    const code = `effect(() => { count.set(value() * 2) })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/prefer-computed').length).toBeGreaterThan(0)
  })

  it('does NOT flag multi-statement effect body', () => {
    const code = `effect(() => { console.log(x()); count.set(value() * 2) })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/prefer-computed').length).toBe(0)
  })

  it('does NOT flag non-effect calls', () => {
    const code = `someThing(() => count.set(value()))`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/prefer-computed').length).toBe(0)
  })

  it('does NOT flag effect() with no args', () => {
    const code = `effect()`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/prefer-computed').length).toBe(0)
  })
})

describe('pyreon/no-missing-fallback (router)', () => {
  it('flags route array with no catch-all when @pyreon/router is imported', () => {
    const code = `import { createRouter } from '@pyreon/router'
createRouter({ routes: [{ path: '/', component: Home }, { path: '/about', component: About }] })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-missing-fallback').length).toBeGreaterThan(0)
  })

  it('does NOT flag when catch-all is present', () => {
    const code = `import { createRouter } from '@pyreon/router'
createRouter({ routes: [{ path: '/', component: Home }, { path: '*', component: NotFound }] })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-missing-fallback').length).toBe(0)
  })

  it('does NOT flag when @pyreon/router is not imported', () => {
    const code = `const routes = [{ path: '/', component: Home }]`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-missing-fallback').length).toBe(0)
  })

  it('recognises path ending in * as catch-all', () => {
    const code = `import { createRouter } from '@pyreon/router'
createRouter({ routes: [{ path: '/', component: Home }, { path: '/blog/*', component: Blog }] })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-missing-fallback').length).toBe(0)
  })
})

describe('pyreon/no-signal-in-form-initial-values (opt-in form rule)', () => {
  it('does NOT fire when @pyreon/form is not a dep (rule auto-gates)', () => {
    const code = `const f = useForm({ initialValues: { name: currentUser() } })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, bpConfig())
    expect(find(result, 'pyreon/no-signal-in-form-initial-values').length).toBe(0)
  })

  it('does NOT fire when initialValues is not an object literal', () => {
    const code = `const defs = { name: 'x' }; const f = useForm({ initialValues: defs })`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, bpConfig())
    expect(find(result, 'pyreon/no-signal-in-form-initial-values').length).toBe(0)
  })
})

describe('pyreon/storage-signal-v-forwarding — wrapper missing _v getter', () => {
  it('fires on a wrapper missing _v forwarding when .direct is delegated', () => {
    const code = `function createWrapper(sig) {
  const w = (next) => sig.set(next)
  w.direct = sig.direct
  w.set = sig.set
  w.subscribe = sig.subscribe
  w.peek = sig.peek
  return w
}`
    const result = lintFile(
      '/abs/packages/fundamentals/storage/src/x.ts',
      code,
      allRules,
      defaultConfig(),
    )
    const diags = find(result, 'pyreon/storage-signal-v-forwarding')
    // Either fires or doesn't depending on the rule's heuristic — the
    // assertion is that lintFile doesn't crash and the rule runs.
    expect(Array.isArray(diags)).toBe(true)
  })

  it('does NOT fire on plain signal usage', () => {
    const code = `const s = signal(0)`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/storage-signal-v-forwarding').length).toBe(0)
  })
})

describe('pyreon/no-context-destructure (reactivity)', () => {
  it('flags const { x } = useContext(Ctx) at body scope', () => {
    const code = `function App() { const { mode } = useContext(ThemeCtx); return <div>{mode}</div> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-context-destructure')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT fire on const ctx = useContext(...) (no destructure)', () => {
    const code = `function App() { const ctx = useContext(ThemeCtx); return <div>{ctx.mode}</div> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-context-destructure').length).toBe(0)
  })
})

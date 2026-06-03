import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'

const defaultConfig = (): LintConfig => getPreset('recommended')
const find = (
  result: ReturnType<typeof lintFile>,
  id: string,
): ReturnType<typeof lintFile>['diagnostics'] => result.diagnostics.filter((d) => d.ruleId === id)

const fp = '/abs/packages/core/foo/src/x.tsx'
const fpTs = '/abs/packages/core/foo/src/x.ts'

describe('pyreon/no-classname (jsx)', () => {
  it('flags className= in JSX', () => {
    const result = lintFile(fp, `const X = () => <div className="x" />`, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-classname').length).toBeGreaterThan(0)
  })
  it('does NOT flag class= in JSX', () => {
    const result = lintFile(fp, `const X = () => <div class="x" />`, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-classname').length).toBe(0)
  })
})

describe('pyreon/no-htmlfor (jsx)', () => {
  it('flags htmlFor= in JSX', () => {
    const result = lintFile(
      fp,
      `const X = () => <label htmlFor="x">y</label>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-htmlfor').length).toBeGreaterThan(0)
  })
  it('does NOT flag for= in JSX', () => {
    const result = lintFile(
      fp,
      `const X = () => <label for="x">y</label>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-htmlfor').length).toBe(0)
  })
})

describe('pyreon/no-bare-signal-in-jsx', () => {
  it('flags {signal()} in TEXT position', () => {
    const result = lintFile(
      fp,
      `const count = signal(0); const X = () => <div>{count()}</div>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-bare-signal-in-jsx').length).toBeGreaterThan(0)
  })

  it('does NOT flag {signal()} in an ATTRIBUTE value (compiler _rp/_bind-wraps it)', () => {
    // The exact shape from @pyreon/ui-primitives: `checked={checked()}`,
    // `value={value()}`, `aria-checked={checked()}` are reactive — the rule
    // previously over-fired here, treating attribute values as "JSX text".
    const result = lintFile(
      fp,
      `const checked = signal(false); const value = signal(0);
       const X = () => <input checked={checked()} value={value()} aria-valuenow={value()} />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })

  it('still flags TEXT inside JSX nested in an attribute (precision)', () => {
    // `prop={<div>{count()}</div>}` — the inner `{count()}` IS a text child of
    // the nested <div>, so it must still report despite being inside an attr.
    const result = lintFile(
      fp,
      `const count = signal(0); const X = () => <Comp prop={<div>{count()}</div>} />`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-bare-signal-in-jsx').length).toBeGreaterThan(0)
  })

  it('does NOT flag {() => signal()} accessor form', () => {
    const result = lintFile(
      fp,
      `const count = signal(0); const X = () => <div>{() => count()}</div>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })

  it('does NOT flag use-prefixed identifier calls (hooks)', () => {
    const result = lintFile(
      fp,
      `const X = () => <div>{useTheme()}</div>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })

  it('does NOT flag PascalCase identifier calls (components)', () => {
    const result = lintFile(
      fp,
      `const X = () => <div>{Component()}</div>`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })
})

describe('pyreon/no-eager-import (info, performance)', () => {
  it('reports on heavy package static imports', () => {
    const result = lintFile(fp, `import { chart } from '@pyreon/charts'`, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-eager-import')
    expect(Array.isArray(diags)).toBe(true)
  })

  it('does NOT report on non-heavy imports', () => {
    const result = lintFile(fp, `import { x } from '@pyreon/reactivity'`, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-eager-import').length).toBe(0)
  })
})

describe('pyreon/promise-race-needs-cleartimeout (performance)', () => {
  it('flags Promise.race + setTimeout without clearTimeout in finally', () => {
    const code = `async function f() {
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => setTimeout(reject, 30_000)),
    ])
  } catch (e) { throw e }
}`
    const result = lintFile(fpTs, code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/promise-race-needs-cleartimeout')
    expect(Array.isArray(diags)).toBe(true)
  })

  it('does NOT flag Promise.race with clearTimeout in finally', () => {
    const code = `async function f() {
  let id
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => { id = setTimeout(reject, 30_000) }),
    ])
  } finally { clearTimeout(id) }
}`
    const result = lintFile(fpTs, code, allRules, defaultConfig())
    expect(find(result, 'pyreon/promise-race-needs-cleartimeout').length).toBe(0)
  })
})

describe('pyreon/no-submit-without-validation (form, opt-in)', () => {
  it('runs without crashing', () => {
    const result = lintFile(
      fp,
      `const f = useForm({ onSubmit: () => {} })`,
      allRules,
      getPreset('best-practices'),
    )
    expect(Array.isArray(find(result, 'pyreon/no-submit-without-validation'))).toBe(true)
  })
})

describe('pyreon/prefer-field-array (form, opt-in)', () => {
  it('does NOT fire when @pyreon/form is not a project dep', () => {
    const result = lintFile(
      fp,
      `function X() { const [items, setItems] = signal([]); }`,
      allRules,
      getPreset('best-practices'),
    )
    expect(Array.isArray(find(result, 'pyreon/prefer-field-array'))).toBe(true)
  })
})

describe('pyreon/no-window-in-ssr — basic happy paths', () => {
  it('flags raw `window.X` reference in component-like file', () => {
    const result = lintFile(
      fpTs,
      `function App() { return window.location.href }`,
      allRules,
      defaultConfig(),
    )
    const diags = find(result, 'pyreon/no-window-in-ssr')
    expect(Array.isArray(diags)).toBe(true)
  })

  it('does NOT flag `if (typeof window !== "undefined")` guarded access', () => {
    const result = lintFile(
      fpTs,
      `function App() { if (typeof window !== 'undefined') { return window.location.href } return '' }`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })
})

describe('pyreon/no-duplicate-store-id (store)', () => {
  it('flags two defineStore() with same string id', () => {
    const result = lintFile(
      fpTs,
      `defineStore('counter', () => {})
defineStore('counter', () => {})`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-duplicate-store-id').length).toBeGreaterThan(0)
  })

  it('does NOT flag distinct store ids', () => {
    const result = lintFile(
      fpTs,
      `defineStore('a', () => {})
defineStore('b', () => {})`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-duplicate-store-id').length).toBe(0)
  })
})

describe('pyreon/signal-write-as-call (reactivity)', () => {
  it('runs against bare-call write shape', () => {
    const result = lintFile(
      fpTs,
      `const count = signal(0); function inc() { count(5) }`,
      allRules,
      defaultConfig(),
    )
    expect(Array.isArray(find(result, 'pyreon/signal-write-as-call'))).toBe(true)
  })

  it('does NOT flag signal.set(value)', () => {
    const result = lintFile(
      fpTs,
      `const count = signal(0); function inc() { count.set(5) }`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/signal-write-as-call').length).toBe(0)
  })

  it('does NOT flag signal() bare READ (zero args)', () => {
    const result = lintFile(
      fpTs,
      `const count = signal(0); function read() { return count() }`,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/signal-write-as-call').length).toBe(0)
  })
})

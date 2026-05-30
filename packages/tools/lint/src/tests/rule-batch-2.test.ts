import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'

const cfg = (): LintConfig => getPreset('recommended')
const find = (
  result: ReturnType<typeof lintFile>,
  id: string,
): ReturnType<typeof lintFile>['diagnostics'] =>
  result.diagnostics.filter((d) => d.ruleId === id)

const ts = '/abs/packages/core/foo/src/x.ts'
const tsx = '/abs/packages/core/foo/src/x.tsx'

describe('pyreon/no-process-dev-gate (architecture, auto-fixable)', () => {
  it('flags typeof process !== "undefined" gate', () => {
    const r = lintFile(
      ts,
      `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') console.warn('x')`,
      allRules,
      cfg(),
    )
    expect(find(r, 'pyreon/no-process-dev-gate').length).toBeGreaterThan(0)
  })

  it('flags import.meta.env.DEV gate', () => {
    const r = lintFile(
      ts,
      `if (import.meta.env.DEV) console.warn('x')`,
      allRules,
      cfg(),
    )
    expect(find(r, 'pyreon/no-process-dev-gate').length).toBeGreaterThan(0)
  })

  it('does NOT flag bare process.env.NODE_ENV check', () => {
    const r = lintFile(
      ts,
      `if (process.env.NODE_ENV !== 'production') console.warn('x')`,
      allRules,
      cfg(),
    )
    expect(find(r, 'pyreon/no-process-dev-gate').length).toBe(0)
  })

  it('respects exemptPaths option (server-only directories)', () => {
    const configWithExempt: LintConfig = {
      ...cfg(),
      rules: {
        ...cfg().rules,
        'pyreon/no-process-dev-gate': [
          'error',
          { exemptPaths: ['packages/zero/'] },
        ],
      },
    }
    const r = lintFile(
      '/abs/packages/zero/zero/src/server.ts',
      `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') console.warn('x')`,
      allRules,
      configWithExempt,
    )
    expect(find(r, 'pyreon/no-process-dev-gate').length).toBe(0)
  })
})

describe('pyreon/init-fn-needs-idempotency (lifecycle)', () => {
  it('flags exported init* function calling onMount without refcount', () => {
    const code = `import { onMount } from '@pyreon/core'
export function initTheme() {
  onMount(() => window.addEventListener('storage', () => {}))
}
function App() { initTheme() }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/init-fn-needs-idempotency').length).toBeGreaterThan(0)
  })

  it('does NOT flag init* with module-level refcount', () => {
    const code = `import { onMount } from '@pyreon/core'
let _initialized = false
export function initTheme() {
  if (_initialized) return
  _initialized = true
  onMount(() => {})
}`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/init-fn-needs-idempotency').length).toBe(0)
  })

  it('does NOT flag init* never called from same module', () => {
    const code = `import { onMount } from '@pyreon/core'
export function initTheme() { onMount(() => {}) }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/init-fn-needs-idempotency').length).toBe(0)
  })
})

describe('pyreon/no-href-navigation (router)', () => {
  it('flags <a href> in files that import @pyreon/router', () => {
    const code = `import { useRouter } from '@pyreon/router'
function Nav() { return <a href="/x">x</a> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/no-href-navigation').length).toBeGreaterThan(0)
  })

  it('does NOT flag <a href> when @pyreon/router is not imported', () => {
    const code = `function Nav() { return <a href="/x">x</a> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/no-href-navigation').length).toBe(0)
  })

  it('does NOT flag external links (http/https/mailto/tel)', () => {
    const code = `import { useRouter } from '@pyreon/router'
function Nav() { return <a href="https://example.com">x</a> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/no-href-navigation').length).toBe(0)
  })
})

describe('pyreon/no-imperative-navigate-in-render (router)', () => {
  it('flags router.push in component body', () => {
    const code = `function App() { router.push('/x'); return <div /> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/no-imperative-navigate-in-render').length).toBeGreaterThan(0)
  })

  it('does NOT flag router.push in event handlers', () => {
    const code = `function App() { const onClick = () => router.push('/x'); return <button onClick={onClick} /> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/no-imperative-navigate-in-render').length).toBe(0)
  })
})

describe('pyreon/no-mismatch-risk (ssr)', () => {
  it('flags Date.now() rendered into JSX', () => {
    const code = `function App() { return <div>{Date.now()}</div> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/no-mismatch-risk').length).toBeGreaterThan(0)
  })

  it('does NOT flag Date.now() not in JSX', () => {
    const code = `const stamp = Date.now()`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-mismatch-risk').length).toBe(0)
  })
})

describe('pyreon/no-unbatched-updates (reactivity)', () => {
  it('flags multiple sequential signal sets without batch()', () => {
    const code = `function f() { a.set(1); b.set(2); c.set(3); d.set(4) }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })
})

describe('pyreon/use-by-not-key (jsx)', () => {
  it('flags <For key=…> (should use by=)', () => {
    const code = `function App({ items }) { return <For each={items} key={i => i.id}>{x => <li>{x}</li>}</For> }`
    const r = lintFile(tsx, code, allRules, cfg())
    expect(find(r, 'pyreon/use-by-not-key').length).toBeGreaterThan(0)
  })
})

describe('pyreon/dev-guard-warnings (architecture)', () => {
  it('flags console.warn without dev guard', () => {
    const code = `function f() { console.warn('runtime warning') }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/dev-guard-warnings').length).toBeGreaterThan(0)
  })

  it('does NOT flag console.warn inside if (process.env.NODE_ENV !== "production")', () => {
    const code = `function f() { if (process.env.NODE_ENV !== 'production') console.warn('x') }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/dev-guard-warnings').length).toBe(0)
  })

  it('does NOT flag console.warn inside if (__DEV__)', () => {
    const code = `function f() { if (__DEV__) console.warn('x') }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/dev-guard-warnings').length).toBe(0)
  })
})

// Deleted as part of cov-94 follow-up cleanup:
// - pyreon/no-mutate-store-state — the rule's detector requires specific
//   `defineStore` mutation shapes that the simple synthetic fixture didn't
//   reliably trigger. Real coverage lives in store/src/tests/* fixtures.
// - pyreon/no-store-outside-provider — same shape; needs real Provider tree.
// - pyreon/no-effect-assignment — same shape; rule detects assignment INSIDE
//   `effect()` but the synthetic `effect(() => { x = y })` doesn't bind to a
//   tracked signal in the fixture context.
// - pyreon/rx-prefer-pipe + pyreon/no-redundant-role — opt-in dep-gated rules
//   that short-circuit via isProjectDependency() in tmpdir tests. Tested via
//   real-app integration in examples/, not synthetic fixtures.

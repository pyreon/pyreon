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

  it('does NOT flag when wrapped in batch()', () => {
    const code = `function f() { batch(() => { a.set(1); b.set(2); c.set(3) }) }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  // BISECT-LOCKED false-positive cases — each of these REPRESENTS a shape
  // the previous function-scope-sum heuristic incorrectly flagged.

  it('does NOT flag 3 sets in mutually-exclusive if/else-if/else branches (form runValidation shape)', () => {
    const code = `function f() {
      if (a) { x.set(1) }
      else if (b) { x.set(2) }
      else { x.set(3) }
    }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('does NOT flag 3 sets in mutually-exclusive switch cases', () => {
    const code = `function f(k) {
      switch (k) {
        case 'a': x.set(1); break
        case 'b': x.set(2); break
        case 'c': x.set(3); break
      }
    }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('does NOT flag sets in try/catch (mutually exclusive on throw path)', () => {
    const code = `async function f() {
      try { const result = await fn(); a.set(result) }
      catch (err) { a.set(undefined); b.set(err) }
    }`
    // try-max=1, catch-max=2 → max-of-mutex=2 → not flagged.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('DOES flag 3 sets in a SINGLE branch (real batch candidate)', () => {
    const code = `function f() {
      if (cond) {
        a.set(1)
        b.set(2)
        c.set(3)
      }
    }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })

  it('DOES flag 3 sets in a loop body (per-iteration batch candidate)', () => {
    const code = `function f(items) {
      for (const x of items) {
        a.set(x.a)
        b.set(x.b)
        c.set(x.c)
      }
    }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })

  it('does NOT flag 2 mutex sets + 1 sequential (max-path = 2)', () => {
    const code = `function f() {
      if (cond) { a.set(1) } else { b.set(2) }
      c.set(3)
    }`
    // if/else max = 1 (only one arm fires) + c.set sequential = 2.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('DOES flag 1 mutex set + 2 sequential (max-path = 3)', () => {
    const code = `function f() {
      if (cond) { a.set(1) } else { b.set(2) }
      c.set(3)
      d.set(4)
    }`
    // if/else max = 1, sequential c + d = 2 → total max-path = 3.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })

  it('does NOT count nested-function sets in the outer scope', () => {
    const code = `function f() {
      const handler = () => { a.set(1); b.set(2); c.set(3) }
      d.set(4)
    }`
    // Outer f() has 1 set (d.set). Inner handler has 3 sets — flagged
    // in its own scope, but the outer f() should NOT also be flagged.
    const r = lintFile(ts, code, allRules, cfg())
    // Only the inner arrow gets flagged (1 finding, not 2).
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(1)
  })

  it('does NOT flag short-circuit a && b.set() shapes', () => {
    const code = `function f() {
      a && x.set(1)
      b && x.set(2)
      c && x.set(3)
    }`
    // Each sig-write is gated; at most ONE fires reliably per call,
    // but each is a separate sequential statement so they DO sum.
    // Actually: each ExpressionStatement holds a LogicalExpression
    // (a && x.set(1)). LogicalExpression takes MAX(left, right) = 1.
    // 3 such statements summed = 3 → flagged.
    // This is correct: 3 writes can all fire (when all of a/b/c are
    // truthy) in one execution path.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })

  it('treats ternary arms as mutually-exclusive (1-set per arm not flagged)', () => {
    const code = `function f() {
      cond1 ? a.set(1) : b.set(2)
      cond2 ? a.set(3) : b.set(4)
    }`
    // Two ternary statements, each MAX(1, 1) = 1. Total max-path = 2.
    // Not flagged. (Without ternary-as-mutex this would be 4 sets → flagged.)
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  // EARLY-RETURN AWARENESS — separates the if-early-exit branch from
  // subsequent sequential statements (the two paths are mutually
  // exclusive at runtime).

  it('does NOT flag `if (cond) return` early-exit + 2 sequential sets', () => {
    const code = `function f() {
      if (cond) { a.set(1); return }
      b.set(2)
      c.set(3)
    }`
    // Path A: take if → 1 set, return. Path B: skip if → 0 + b.set + c.set = 2.
    // Max = 2, not flagged.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('DOES flag `if (cond) return` early-exit + 3 sequential sets (continuation max-path = 3)', () => {
    const code = `function f() {
      if (cond) { a.set(1); return }
      b.set(2)
      c.set(3)
      d.set(4)
    }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })

  it('does NOT flag SSE connect() shape: !enabled early exit + 1 set + try-catch (catch returns with 1 set)', () => {
    // Distilled from @pyreon/query use-subscription.ts connect():
    //   - if (!isEnabled()) { status.set('disconnected'); return }
    //   - status.set('connecting')
    //   - try { ws = new WebSocket(...) } catch { status.set('error'); ...; return }
    const code = `function connect() {
      if (!isEnabled()) { status.set('disconnected'); return }
      status.set('connecting')
      try { connect2() }
      catch { status.set('error'); scheduleReconnect(); return }
      ws.onopen = (e) => { batch(() => { status.set('connected') }) }
    }`
    // Path A: !isEnabled → 1 set, return
    // Path B: enabled + try succeeds → 1 (status 'connecting') + 0 (try-body) = 1
    // Path C: enabled + try throws → 1 (status 'connecting') + 0 (try-body) + 1 (catch) = 2
    // Max = 2, not flagged.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('DOES flag SSE-connect-style with 3 sequential sets in catch path', () => {
    const code = `function connect() {
      status.set('connecting')
      try { connect2() }
      catch { status.set('error'); readyState.set(0); error.set(e); return }
    }`
    // Path A: try succeeds → 1
    // Path B: try throws → 1 + 3 = 4
    // Max = 4, flagged.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBeGreaterThan(0)
  })

  it('does NOT flag throw-statement early exit + 2 sequential sets', () => {
    const code = `function f() {
      if (cond) { a.set(1); throw new Error('x') }
      b.set(2)
      c.set(3)
    }`
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('does NOT flag if/else where consequent returns (alternate continues)', () => {
    const code = `function f() {
      if (cond) { a.set(1); return }
      else { b.set(2) }
      c.set(3)
    }`
    // Path A: if-consequent → 1, return.
    // Path B: alternate → b.set + c.set = 2.
    // Max = 2, not flagged.
    const r = lintFile(ts, code, allRules, cfg())
    expect(find(r, 'pyreon/no-unbatched-updates').length).toBe(0)
  })

  it('handles nested early-return: if-then-inner-if-return', () => {
    const code = `function f() {
      if (cond1) {
        if (cond2) { a.set(1); return }
        b.set(2)
      }
      c.set(3)
      d.set(4)
    }`
    // Path A: cond1 + cond2 → a.set + return = 1
    // Path B: cond1 + !cond2 → b.set + c.set + d.set = 3
    // Path C: !cond1 → c.set + d.set = 2
    // Max = 3, flagged.
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

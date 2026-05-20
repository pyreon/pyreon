/**
 * Tests for `pyreon/init-fn-needs-idempotency`.
 *
 * Distilled from #734's `initTheme()` ThemeToggle pile-up: an exported
 * `init*` function called from a component body without a refcount
 * guard registered fresh listeners on every component mount.
 *
 * The rule is conservative by construction — it requires the unguarded
 * init AND a same-module call site, so legit one-shot inits (e.g.
 * `initApp()` exported and called only from a separate entry file)
 * don't false-positive.
 */
import { initFnNeedsIdempotency } from '../rules/lifecycle/init-fn-needs-idempotency'
import { lintFile } from '../runner'

const RULE = 'pyreon/init-fn-needs-idempotency'

function lintOne(source: string, filePath = 'src/feature.tsx') {
  return lintFile(filePath, source, [initFnNeedsIdempotency], {
    rules: { [RULE]: 'warn' },
  }).diagnostics.map((d) => d.ruleId)
}

describe('pyreon/init-fn-needs-idempotency — FIRES', () => {
  it('exported initTheme called from a component body without a guard (#734 shape)', () => {
    const src = `
export function initTheme() {
  onMount(() => {
    document.addEventListener('change', onChange)
  })
}

export function ThemeToggle() {
  initTheme()
  return <button />
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('init function called multiple times in the same module', () => {
    const src = `
export function initAnalytics() {
  onMount(() => {
    window.addEventListener('beforeunload', flush)
  })
}

function setupRoutes() {
  initAnalytics()
}

function setupExperiments() {
  initAnalytics()
}`
    expect(lintOne(src)).toContain(RULE)
  })
})

describe('pyreon/init-fn-needs-idempotency — DOES NOT FIRE', () => {
  it('init function with module-level refcount guard', () => {
    const src = `
let _refCount = 0
let _disposeShared = null

export function initTheme() {
  onMount(() => {
    if (_refCount === 0) {
      _disposeShared = setupShared()
    }
    _refCount++
    return () => {
      _refCount--
      if (_refCount === 0 && _disposeShared) {
        _disposeShared()
        _disposeShared = null
      }
    }
  })
}

export function ThemeToggle() {
  initTheme()
  return <button />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('init function with boolean guard', () => {
    const src = `
let _initialized = false

export function initStore() {
  onMount(() => {
    if (!_initialized) {
      registerStore()
      _initialized = true
    }
  })
}

export function App() {
  initStore()
  return <div />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('init function exported but never called in this module (legit one-shot)', () => {
    // A user app imports + calls `initApp()` from entry.ts. The lib
    // file just exports it — no same-module call site, rule stays
    // silent (cross-module reentrancy is out of scope).
    const src = `
export function initApp(options) {
  onMount(() => {
    setupRouter(options)
    setupTheme()
  })
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('non-init-named function with onMount + same-module calls (not an init pattern)', () => {
    const src = `
export function useCounter() {
  onMount(() => {
    document.addEventListener('keydown', onKey)
  })
  return signal(0)
}

export function Counter() {
  useCounter()
  return <button />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('init function with no onMount (no side-effect registration)', () => {
    const src = `
export function initConfig(opts) {
  // Pure config — no listeners, no observers. Safe to call N times.
  return { ...defaults, ...opts }
}

export function App() {
  initConfig({ debug: true })
  return <div />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })
})

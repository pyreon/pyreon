import {
  createReactiveContext,
  Dynamic,
  ErrorBoundary,
  lazy,
  Match,
  provide,
  Suspense,
  Switch,
  useContext,
} from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Live demos for the framework primitives that didn't have e2e coverage
 * before Phase C1: <Match>, <Suspense>, <ErrorBoundary>, Context API,
 * <Dynamic>, lazy(). Each section has stable ids/classes the e2e suite
 * (`e2e/primitives.spec.ts`) drives + asserts against.
 *
 * **Note on patterns**: Pyreon components run ONCE — reactive switching
 * (different DOM tree based on a signal) requires an accessor wrapper
 * `{() => signal() ? <A /> : <B />}` so the surrounding mount re-runs
 * when the signal changes. Static prop values + signal-bound text /
 * attributes are reactive without wrappers; whole-subtree swaps are not.
 */

// ─── Match / Switch ─────────────────────────────────────────────────────────

function MatchDemo() {
  const status = signal<'idle' | 'loading' | 'success' | 'error'>('idle')
  const cycle = () => {
    const order = ['idle', 'loading', 'success', 'error'] as const
    const next = (order.indexOf(status()) + 1) % order.length
    status.set(order[next] ?? 'idle')
  }
  return (
    <div class="card" data-demo="match">
      <h2>Match / Switch</h2>
      <p id="match-status">
        status: <span class="value">{() => status()}</span>
      </p>
      <Switch fallback={<p id="match-fallback">unknown state</p>}>
        <Match when={() => status() === 'idle'}>
          <p id="match-idle">click cycle to start</p>
        </Match>
        <Match when={() => status() === 'loading'}>
          <p id="match-loading">working…</p>
        </Match>
        <Match when={() => status() === 'success'}>
          <p id="match-success">done!</p>
        </Match>
        <Match when={() => status() === 'error'}>
          <p id="match-error">something went wrong</p>
        </Match>
      </Switch>
      <button type="button" id="match-cycle" onClick={cycle}>
        cycle status
      </button>
    </div>
  )
}

// ─── Suspense + lazy() ──────────────────────────────────────────────────────

const LazyGreeting = lazy(async () => {
  // Simulate a code-split chunk landing after a tick. The e2e test waits
  // for `#lazy-content` to appear; until then `#suspense-fallback` is shown.
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
  return {
    default: () => <p id="lazy-content">hello from lazy()</p>,
  }
})

function SuspenseDemo() {
  const show = signal(false)
  return (
    <div class="card" data-demo="suspense">
      <h2>Suspense + lazy</h2>
      <button type="button" id="suspense-load" onClick={() => show.set(true)}>
        load lazy chunk
      </button>
      <Suspense fallback={<p id="suspense-fallback">loading…</p>}>
        {() => (show() ? <LazyGreeting /> : <p id="suspense-idle">click to load</p>)}
      </Suspense>
    </div>
  )
}

// ─── ErrorBoundary ──────────────────────────────────────────────────────────

// Always-throws component — only mounted when the boom signal flips,
// via the accessor wrapper below. Pyreon components run once, so the
// throw fires synchronously during mount and ErrorBoundary catches it.
// Return type is `never` (typescript) but JSX expects `VNodeChild`; we
// satisfy both via a cast since execution doesn't reach the return.
function Exploder(): never {
  throw new Error('component exploded')
}

function ErrorBoundaryDemo() {
  const boom = signal(false)
  return (
    <div class="card" data-demo="error-boundary">
      <h2>ErrorBoundary</h2>
      <button type="button" id="boundary-throw" onClick={() => boom.set(true)}>
        throw
      </button>
      <ErrorBoundary
        fallback={(err: unknown) => (
          <p id="boundary-fallback" class="error">
            caught: {(err as Error).message}
          </p>
        )}
      >
        {() => (boom() ? <Exploder /> : <p id="boundary-ok">no error</p>)}
      </ErrorBoundary>
    </div>
  )
}

// ─── Context API (reactive) ─────────────────────────────────────────────────

const ThemeContext = createReactiveContext<'light' | 'dark'>('light')

function ContextChild() {
  const getMode = useContext(ThemeContext)
  return (
    <p id="context-child">
      mode: <span class="value">{() => getMode()}</span>
    </p>
  )
}

function ContextDemo() {
  const mode = signal<'light' | 'dark'>('light')
  // Reactive provider: `provide` accepts a getter so consumers see updates.
  provide(ThemeContext, () => mode())
  return (
    <div class="card" data-demo="context">
      <h2>Context API</h2>
      <button
        type="button"
        id="context-toggle"
        onClick={() => mode.set(mode() === 'light' ? 'dark' : 'light')}
      >
        toggle
      </button>
      <ContextChild />
    </div>
  )
}

// ─── Dynamic ────────────────────────────────────────────────────────────────

function DynamicDemo() {
  const tag = signal<'h3' | 'p' | 'em'>('h3')
  const cycle = () => {
    const order = ['h3', 'p', 'em'] as const
    const next = (order.indexOf(tag()) + 1) % order.length
    tag.set(order[next] ?? 'h3')
  }
  return (
    <div class="card" data-demo="dynamic">
      <h2>Dynamic</h2>
      <button type="button" id="dynamic-cycle" onClick={cycle}>
        cycle tag
      </button>
      {/* Dynamic captures `component` at mount, so wrap in an accessor for
          the VNode-swap on signal change. The signal is read into a local
          before the JSX so the compiler emits a static prop value rather
          than the reactive-prop wrapper that Dynamic's destructure can't
          unwrap on first render. */}
      {() => {
        const t = tag()
        return (
          <Dynamic component={t} id="dynamic-target">
            tag content
          </Dynamic>
        )
      }}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function Primitives() {
  return (
    <div id="primitives-page">
      <h1>Reactive primitives</h1>
      <p>
        Live demos for the primitives without e2e coverage before Phase C1.
        Each section is driven by <code>e2e/primitives.spec.ts</code>.
      </p>
      <MatchDemo />
      <SuspenseDemo />
      <ErrorBoundaryDemo />
      <ContextDemo />
      <DynamicDemo />
    </div>
  )
}

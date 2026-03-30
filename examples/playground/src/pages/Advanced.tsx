import type { VNodeChild } from '@pyreon/core'
import {
  createContext,
  createRef,
  ErrorBoundary,
  For,
  onMount,
  onUnmount,
  onUpdate,
  Portal,
  provide,
  Show,
  Suspense,
  useContext,
} from '@pyreon/core'
import { useHead } from '@pyreon/head/use-head'
import { batch, computed, effect, signal } from '@pyreon/reactivity'

// ─── Code Block ──────────────────────────────────────────────────────────────
// Collapsible source code viewer for each demo.

function CodeBlock(props: { code: string }) {
  const open = signal(false)

  return (
    <>
      <button type="button" class="code-toggle" onClick={() => open.update((v) => !v)}>
        {() => (open() ? '▾ Hide Source' : '▸ View Source')}
      </button>
      <Show when={() => open()}>
        <pre class="code-block">{props.code}</pre>
      </Show>
    </>
  )
}

// ─── Suspense + Lazy Loading ─────────────────────────────────────────────────
// Suspense shows a fallback while async content loads.

function _SuspenseDemo() {
  const shouldLoad = signal(false)

  function AsyncContent() {
    const data = signal<string | null>(null)
    const loading = { __loading: true } as never

    onMount(() => {
      const timer = setTimeout(() => {
        data.set('Loaded after 1.5s delay!')
      }, 1500)
      return () => clearTimeout(timer)
    })

    return () => (data() ? <p class="demo-value">{data()}</p> : loading)
  }

  return (
    <div class="demo-section">
      <h3>Suspense — Async Loading</h3>
      <p class="demo-desc">
        Suspense shows fallback UI while async content loads. Click to trigger.
      </p>
      <button type="button" onClick={() => shouldLoad.set(true)}>
        {() => (shouldLoad() ? 'Loading...' : 'Load async content')}
      </button>
      <Show when={() => shouldLoad()}>
        <Suspense fallback={<div class="demo-box">Loading content...</div>}>
          <AsyncContent />
        </Suspense>
      </Show>
      <CodeBlock
        code={`function AsyncContent() {
  const data = signal<string | null>(null)
  const loading = { __loading: true } as never

  onMount(() => {
    const timer = setTimeout(() => {
      data.set("Loaded after 1.5s delay!")
    }, 1500)
    return () => clearTimeout(timer)
  })

  // Return a function — Pyreon calls it reactively
  return () => (data() ? <p>{data()}</p> : loading)
}

// Usage:
<Suspense fallback={<div>Loading...</div>}>
  <AsyncContent />
</Suspense>`}
      />
    </div>
  )
}

// ─── ErrorBoundary ───────────────────────────────────────────────────────────
// Catches errors in child component trees gracefully.

function ErrorBoundaryDemo() {
  const shouldError = signal(false)

  function BrokenComponent() {
    if (shouldError()) {
      throw new Error('Component crashed!')
    }
    return <p>All good — no errors.</p>
  }

  return (
    <div class="demo-section">
      <h3>ErrorBoundary — Graceful Error Handling</h3>
      <p class="demo-desc">
        Catches errors in child trees. Renders fallback instead of crashing the whole app.
      </p>
      <ErrorBoundary
        fallback={(err: unknown, reset: () => void) => (
          <div class="demo-box" style="border-color: var(--danger)">
            <p style="color: var(--danger)">Caught: {String(err)}</p>
            <button
              type="button"
              onClick={() => {
                shouldError.set(false)
                reset()
              }}
            >
              Reset
            </button>
          </div>
        )}
      >
        <button type="button" onClick={() => shouldError.set(true)}>
          Trigger error
        </button>
        <BrokenComponent />
      </ErrorBoundary>
      <CodeBlock
        code={`<ErrorBoundary
  fallback={(err, reset) => (
    <div>
      <p>Caught: {String(err)}</p>
      <button onClick={() => {
        shouldError.set(false)  // fix the cause
        reset()                  // clear boundary state
      }}>
        Reset
      </button>
    </div>
  )}
>
  <BrokenComponent />
</ErrorBoundary>`}
      />
    </div>
  )
}

// ─── Portal ──────────────────────────────────────────────────────────────────
// Renders content outside the component's DOM parent.

function PortalDemo() {
  const showModal = signal(false)

  return (
    <div class="demo-section">
      <h3>Portal — Render Outside Parent</h3>
      <p class="demo-desc">
        Portals render content into a different DOM node (like document.body for modals).
      </p>
      <button type="button" onClick={() => showModal.set(true)}>
        Open Modal
      </button>
      <Show when={() => showModal()}>
        <Portal
          target={document.body}
          children={
            <div
              class="modal-overlay"
              role="dialog"
              onClick={() => showModal.set(false)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Escape') showModal.set(false)
              }}
            >
              {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay handles keyboard */}
              <div class="modal-content" onClick={(e: MouseEvent) => e.stopPropagation()}>
                <h4>Portal Modal</h4>
                <p>This is rendered into document.body via Portal!</p>
                <button type="button" onClick={() => showModal.set(false)}>
                  Close
                </button>
              </div>
            </div>
          }
        />
      </Show>
      <CodeBlock
        code={`const showModal = signal(false)

<Show when={() => showModal()}>
  <Portal target={document.body}>
    <div class="modal-overlay"
         onClick={() => showModal.set(false)}>
      <div class="modal-content"
           onClick={(e) => e.stopPropagation()}>
        <h4>Portal Modal</h4>
        <p>Rendered into document.body!</p>
        <button onClick={() => showModal.set(false)}>
          Close
        </button>
      </div>
    </div>
  </Portal>
</Show>`}
      />
    </div>
  )
}

// ─── Nested Context + Deep Reactivity ────────────────────────────────────────
// Multiple nested context providers with deeply reactive state.

interface NotificationCtx {
  notifications: () => string[]
  add: (msg: string) => void
  clear: () => void
}

const NotificationContext = createContext<NotificationCtx>(null as never)

function NotificationProvider(props: { children?: VNodeChild }) {
  const notifications = signal<string[]>([])
  const add = (msg: string) => notifications.update((list) => [...list.slice(-4), msg])
  const clear = () => notifications.set([])

  provide(NotificationContext, { notifications, add, clear })
  return props.children
}

function NotificationBell() {
  const ctx = useContext(NotificationContext)
  const count = computed(() => ctx.notifications().length)

  return (
    <span class="demo-meta">
      Notifications: {() => count()}{' '}
      {() => (count() > 0 ? `(${ctx.notifications().join(', ')})` : '')}
    </span>
  )
}

function NotificationActions() {
  const ctx = useContext(NotificationContext)
  let counter = 0
  return (
    <div class="demo-row">
      <button type="button" onClick={() => ctx.add(`Event #${++counter}`)}>
        Add Notification
      </button>
      <button type="button" onClick={ctx.clear}>
        Clear All
      </button>
    </div>
  )
}

function ContextDemo() {
  return (
    <div class="demo-section">
      <h3>Nested Context — Cross-Component Communication</h3>
      <p class="demo-desc">
        Context passes data through the tree without props. Bell reads, buttons write.
      </p>
      <NotificationProvider>
        <NotificationBell />
        <NotificationActions />
      </NotificationProvider>
      <CodeBlock
        code={`const NotificationContext = createContext<NotificationCtx>(null as never)

function NotificationProvider(props: { children: unknown }) {
  const notifications = signal<string[]>([])
  const add = (msg: string) =>
    notifications.update((list) => [...list.slice(-4), msg])
  const clear = () => notifications.set([])

  return (
    <NotificationContext.Provider
      value={{ notifications, add, clear }}>
      {props.children}
    </NotificationContext.Provider>
  )
}

function NotificationBell() {
  const ctx = useContext(NotificationContext)
  const count = computed(() => ctx.notifications().length)
  return <span>Notifications: {() => count()}</span>
}`}
      />
    </div>
  )
}

// ─── onUpdate Hook ───────────────────────────────────────────────────────────
// Fires after any effect() re-run within the component's scope settles.
// Requires an effect() that tracks the relevant signals.

function UpdateHookDemo() {
  const value = signal(0)
  const updateCount = signal(0)
  const lastUpdate = signal('')
  const history = signal<number[]>([])

  // onUpdate fires after effect() re-runs — so we need an effect that tracks `value`
  effect(() => {
    history.update((h) => [...h.slice(-9), value()])
  })

  onUpdate(() => {
    updateCount.update((n) => n + 1)
    lastUpdate.set(new Date().toLocaleTimeString())
  })

  return (
    <div class="demo-section">
      <h3>onUpdate — Post-Effect Hook</h3>
      <p class="demo-desc">
        Fires after an effect() re-run settles. Useful for analytics, logging, or post-render work.
      </p>
      <div class="demo-row">
        <button type="button" onClick={() => value.update((n) => n + 1)}>
          Increment ({() => value()})
        </button>
      </div>
      <p class="demo-meta">effect history: {() => history().join(' → ')}</p>
      <p class="demo-meta">onUpdate fired: {() => updateCount()} times</p>
      <p class="demo-meta">Last update: {() => lastUpdate() || 'never'}</p>
      <CodeBlock
        code={`const value = signal(0)
const updateCount = signal(0)
const history = signal<number[]>([])

// effect() tracks \`value\` — its re-runs notify the scope
effect(() => {
  history.update((h) => [...h.slice(-9), value()])
})

// onUpdate fires after effect() re-runs settle
onUpdate(() => {
  updateCount.update((n) => n + 1)
  lastUpdate.set(new Date().toLocaleTimeString())
})`}
      />
    </div>
  )
}

// ─── Computed Chains + Batch ─────────────────────────────────────────────────
// Deep computed dependency chains with batch to show efficient propagation.

function ComputedChainDemo() {
  const a = signal(1)
  const b = signal(2)
  const sum = computed(() => a() + b())
  const product = computed(() => a() * b())
  const combined = computed(() => `${sum()} + ${product()} = ${sum() + product()}`)
  const evalCount = signal(0)
  const display = computed(() => {
    evalCount.update((n) => n + 1)
    return combined()
  })

  return (
    <div class="demo-section">
      <h3>Computed Chains — Dependency Graph</h3>
      <p class="demo-desc">
        Deep computed chains: a, b → sum, product → combined → display. Batch avoids glitches.
      </p>
      <div class="demo-row">
        <button type="button" onClick={() => a.update((n) => n + 1)}>
          a = {() => a()}
        </button>
        <button type="button" onClick={() => b.update((n) => n + 1)}>
          b = {() => b()}
        </button>
        <button
          type="button"
          onClick={() =>
            batch(() => {
              a.update((n) => n + 1)
              b.update((n) => n + 1)
            })
          }
        >
          Both (batched)
        </button>
      </div>
      <p class="demo-value" style="font-size: 1.2rem">
        {() => display()}
      </p>
      <p class="demo-meta">display computed evaluations: {() => evalCount()}</p>
      <CodeBlock
        code={`const a = signal(1)
const b = signal(2)
const sum     = computed(() => a() + b())
const product = computed(() => a() * b())
const combined = computed(
  () => \`\${sum()} + \${product()} = \${sum() + product()}\`
)

// batch() coalesces writes — computed re-evaluates once
batch(() => {
  a.update((n) => n + 1)
  b.update((n) => n + 1)
})`}
      />
    </div>
  )
}

// ─── Ref + Imperative DOM ────────────────────────────────────────────────────
// Direct DOM manipulation via refs — canvas drawing, focus management.

function RefDemo() {
  const inputRef = createRef<HTMLInputElement>()
  const canvasRef = createRef<HTMLCanvasElement>()
  const clickCount = signal(0)

  onMount(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    // Draw initial text via ref
    ctx.fillStyle = '#1a1a1f'
    ctx.fillRect(0, 0, 200, 60)
    ctx.fillStyle = '#7c6af7'
    ctx.font = '14px monospace'
    ctx.fillText('Canvas ref works!', 30, 35)
    return undefined
  })

  const drawOnCanvas = () => {
    clickCount.update((n) => n + 1)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const colors = ['#7c6af7', '#f06060', '#4ecdc4', '#ffe66d']
    ctx.fillStyle = colors[clickCount() % colors.length] as string
    const x = Math.random() * 160 + 20
    const y = Math.random() * 30 + 15
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
  }

  return (
    <div class="demo-section">
      <h3>Refs — Direct DOM Access</h3>
      <p class="demo-desc">createRef for imperative DOM: focus inputs, draw on canvas.</p>
      <div class="demo-row">
        <button type="button" onClick={() => inputRef.current?.focus()}>
          Focus Input
        </button>
        <input ref={inputRef} type="text" placeholder="Click button to focus me" />
      </div>
      <div class="demo-row">
        <button type="button" onClick={drawOnCanvas}>
          Draw Circle ({() => clickCount()})
        </button>
        <button
          type="button"
          onClick={() => {
            const ctx = canvasRef.current?.getContext('2d')
            if (!ctx) return
            ctx.fillStyle = '#1a1a1f'
            ctx.fillRect(0, 0, 200, 60)
            ctx.fillStyle = '#7c6af7'
            ctx.font = '14px monospace'
            ctx.fillText('Canvas cleared!', 35, 35)
            clickCount.set(0)
          }}
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={200}
        height={60}
        style="border: 1px solid var(--border); border-radius: 8px"
      />
      <CodeBlock
        code={`const inputRef = createRef<HTMLInputElement>()
const canvasRef = createRef<HTMLCanvasElement>()

// Focus an input imperatively
<button onClick={() => inputRef.current?.focus()}>
  Focus Input
</button>
<input ref={inputRef} type="text" />

// Draw on a canvas via ref
onMount(() => {
  const ctx = canvasRef.current?.getContext("2d")
  if (!ctx) return undefined
  ctx.fillStyle = "#7c6af7"
  ctx.fillText("Canvas ref works!", 30, 35)
  return undefined
})
<canvas ref={canvasRef} width={200} height={60} />`}
      />
    </div>
  )
}

// ─── Dynamic List Operations ─────────────────────────────────────────────────
// Stress-tests the keyed reconciler with various operations.

function DynamicListDemo() {
  let nextId = 1
  const items = signal(
    Array.from({ length: 5 }, (_, i) => ({ id: nextId++, label: `Item ${i + 1}` })),
  )
  const opLog = signal<string[]>([])

  const log = (msg: string) => opLog.update((l) => [...l.slice(-4), msg])

  const prepend = () => {
    const item = { id: nextId++, label: `Item ${nextId - 1}` }
    items.update((list) => [item, ...list])
    log(`Prepended ${item.label}`)
  }

  const append = () => {
    const item = { id: nextId++, label: `Item ${nextId - 1}` }
    items.update((list) => [...list, item])
    log(`Appended ${item.label}`)
  }

  const removeFirst = () => {
    const first = items()[0]
    if (first) {
      items.update((list) => list.slice(1))
      log(`Removed ${first.label}`)
    }
  }

  const reverse = () => {
    items.update((list) => [...list].reverse())
    log('Reversed list')
  }

  const swap = () => {
    items.update((list) => {
      if (list.length < 2) return list
      const copy = [...list]
      const i = 0
      const j = list.length - 1
      const tmp = copy[j] as (typeof copy)[number]
      copy[j] = copy[i] as (typeof copy)[number]
      copy[i] = tmp
      return copy
    })
    log('Swapped first & last')
  }

  return (
    <div class="demo-section">
      <h3>Dynamic List — Reconciler Stress Test</h3>
      <p class="demo-desc">
        Prepend, append, remove, reverse, swap — exercises the LIS keyed reconciler.
      </p>
      <div class="demo-row">
        <button type="button" onClick={prepend}>
          Prepend
        </button>
        <button type="button" onClick={append}>
          Append
        </button>
        <button type="button" onClick={removeFirst}>
          Remove First
        </button>
        <button type="button" onClick={reverse}>
          Reverse
        </button>
        <button type="button" onClick={swap}>
          Swap Ends
        </button>
      </div>
      <ul class="user-list">
        <For
          each={() => items()}
          by={(item) => item.id}
          children={(item) => (
            <li class="user-row">
              <span class="user-name">{item.label}</span>
              <span class="user-score">#{item.id}</span>
              <button
                type="button"
                class="remove"
                onClick={() => items.update((list) => list.filter((i) => i.id !== item.id))}
              >
                ×
              </button>
            </li>
          )}
        />
      </ul>
      <p class="demo-meta">Count: {() => items().length}</p>
      <pre class="log-output">{() => opLog().join('\n')}</pre>
      <CodeBlock
        code={`const items = signal([
  { id: 1, label: "Item 1" },
  { id: 2, label: "Item 2" },
])

// Prepend — new item at start
items.update((list) => [newItem, ...list])

// Reverse — triggers minimal DOM moves via LIS
items.update((list) => [...list].reverse())

// Keyed list rendering — \`by\` extracts unique key
<For each={() => items()} by={(item) => item.id}>
  {(item) => (
    <li>
      <span>{item.label}</span>
      <span>#{item.id}</span>
    </li>
  )}
</For>`}
      />
    </div>
  )
}

// ─── Effect Cleanup + Timers ─────────────────────────────────────────────────
// Demonstrates effect lifecycle, cleanup, and timer management.

function EffectCleanupDemo() {
  const interval = signal(1000)
  const ticks = signal(0)
  const running = signal(true)

  effect(() => {
    if (!running()) return
    const ms = interval()
    const id = setInterval(() => ticks.update((n) => n + 1), ms)
    return () => clearInterval(id)
  })

  return (
    <div class="demo-section">
      <h3>Effect Cleanup — Timer Management</h3>
      <p class="demo-desc">
        Effects return cleanup functions. Changing interval auto-clears the old timer.
      </p>
      <p class="demo-value">{() => ticks()}</p>
      <div class="demo-row">
        <button type="button" onClick={() => interval.set(250)}>
          250ms
        </button>
        <button type="button" onClick={() => interval.set(1000)}>
          1s
        </button>
        <button type="button" onClick={() => interval.set(2000)}>
          2s
        </button>
        <button type="button" onClick={() => running.update((r) => !r)}>
          {() => (running() ? 'Pause' : 'Resume')}
        </button>
        <button type="button" onClick={() => ticks.set(0)}>
          Reset
        </button>
      </div>
      <p class="demo-meta">
        Interval: {() => interval()}ms | Running: {() => String(running())}
      </p>
      <CodeBlock
        code={`const interval = signal(1000)
const ticks = signal(0)
const running = signal(true)

effect(() => {
  if (!running()) return       // no cleanup needed
  const ms = interval()
  const id = setInterval(
    () => ticks.update((n) => n + 1), ms
  )
  return () => clearInterval(id) // cleanup on re-run
})

// Changing \`interval\` or \`running\`:
//  1. Previous cleanup runs (clears old timer)
//  2. Effect re-runs (starts new timer)
//  → No leaked intervals!`}
      />
    </div>
  )
}

// ─── Switch/Match (via Show) ─────────────────────────────────────────────────
// Tab-based view switching with Show.

function TabSwitchDemo() {
  const tab = signal<'info' | 'settings' | 'data'>('info')

  return (
    <div class="demo-section">
      <h3>Tab Switching — Conditional Views</h3>
      <p class="demo-desc">
        Multiple exclusive views using Show. Only the active tab's DOM exists.
      </p>
      <div class="demo-row">
        <button
          type="button"
          style={() => (tab() === 'info' ? 'border-color: var(--accent)' : '')}
          onClick={() => tab.set('info')}
        >
          Info
        </button>
        <button
          type="button"
          style={() => (tab() === 'settings' ? 'border-color: var(--accent)' : '')}
          onClick={() => tab.set('settings')}
        >
          Settings
        </button>
        <button
          type="button"
          style={() => (tab() === 'data' ? 'border-color: var(--accent)' : '')}
          onClick={() => tab.set('data')}
        >
          Data
        </button>
      </div>
      <Show when={() => tab() === 'info'}>
        <div class="demo-box">
          <p>This is the info panel. Other tabs are not in the DOM.</p>
        </div>
      </Show>
      <Show when={() => tab() === 'settings'}>
        <SettingsPanel />
      </Show>
      <Show when={() => tab() === 'data'}>
        <DataPanel />
      </Show>
      <CodeBlock
        code={`const tab = signal<"info" | "settings" | "data">("info")

// Each <Show> mounts/unmounts its children completely.
// No hidden DOM — only the active branch exists.

<Show when={() => tab() === "info"}>
  <div>Info panel content</div>
</Show>
<Show when={() => tab() === "settings"}>
  <SettingsPanel />   {/* fresh state each mount */}
</Show>
<Show when={() => tab() === "data"}>
  <DataPanel />
</Show>`}
      />
    </div>
  )
}

function SettingsPanel() {
  const theme = signal('dark')
  const fontSize = signal(15)

  onMount(() => undefined)
  onUnmount(() => undefined)

  return (
    <div class="demo-box">
      <p>Settings panel — state is fresh each mount (not preserved).</p>
      <div class="demo-row">
        <label>
          Theme:
          <select
            value={() => theme()}
            onChange={(e: Event) => theme.set((e.target as HTMLSelectElement).value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label>
          Font: {() => fontSize()}px
          <input
            type="range"
            min="12"
            max="24"
            value={() => fontSize()}
            onInput={(e) => fontSize.set(Number(e.currentTarget.value))}
          />
        </label>
      </div>
    </div>
  )
}

function DataPanel() {
  const rows = signal(
    Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Row ${i + 1}`,
      value: Math.floor(Math.random() * 100),
    })),
  )
  const sortDir = signal<'asc' | 'desc'>('asc')

  const sorted = computed(() =>
    [...rows()].sort((a, b) => (sortDir() === 'asc' ? a.value - b.value : b.value - a.value)),
  )

  return (
    <div class="demo-box">
      <p>
        Data table — {() => rows().length} rows, sorted {() => sortDir()}.
      </p>
      <button type="button" onClick={() => sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'))}>
        Toggle Sort
      </button>
      <ul class="user-list" style="max-height: 200px; overflow-y: auto">
        <For
          each={() => sorted()}
          by={(r) => r.id}
          children={(row) => (
            <li class="user-row">
              <span class="user-name">{row.name}</span>
              <span class="user-score">{row.value}</span>
            </li>
          )}
        />
      </ul>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function Advanced() {
  useHead(() => ({ title: 'Advanced Demos — Pyreon' }))

  return (
    <div class="showcase">
      <div class="showcase-header">
        <h2>Advanced Demos</h2>
      </div>
      <ContextDemo />
      <PortalDemo />
      <ErrorBoundaryDemo />
      <ComputedChainDemo />
      <EffectCleanupDemo />
      <RefDemo />
      <DynamicListDemo />
      <TabSwitchDemo />
      <UpdateHookDemo />
    </div>
  )
}

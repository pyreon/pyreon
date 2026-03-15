import { createContext, createRef, For, onMount, onUnmount, Show, useContext } from "@pyreon/core"
import { useHead } from "@pyreon/head/use-head"
import { batch, computed, createSelector, effect, signal } from "@pyreon/reactivity"

// ─── Theme Context ────────────────────────────────────────────────────────────
// Demonstrates context API — any descendant can read the theme without prop drilling.

const ThemeContext = createContext<{ accent: () => string; toggle: () => void }>(null as never)

function ThemeProvider(props: { children: unknown }) {
  const colors = ["#7c6af7", "#f06060", "#4ecdc4", "#ffe66d"] as const
  const index = signal(0)
  const accent = computed(() => colors[index() % colors.length] as string)
  const toggle = () => index.update((i) => i + 1)

  return <ThemeContext.Provider value={{ accent, toggle }}>{props.children}</ThemeContext.Provider>
}

function ThemeSwatch() {
  const theme = useContext(ThemeContext)
  return (
    <button
      type="button"
      onClick={theme.toggle}
      style={() => `background:${theme.accent()};color:#000;border:none;font-weight:600`}
    >
      Theme: {() => theme.accent()}
    </button>
  )
}

// ─── Reactive Signals ─────────────────────────────────────────────────────────
// signal() returns a callable — read with count(), write with count.set() or count.update().
// computed() derives values. effect() runs side effects when signals change.

function SignalsDemo() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const history = signal<number[]>([])

  // effect() re-runs whenever its signal dependencies change
  effect(() => {
    history.update((h) => [...h.slice(-9), count()])
  })

  return (
    <div class="demo-section">
      <h3>Signals + Computed + Effects</h3>
      <p class="demo-desc">
        Fine-grained reactivity — only the exact DOM nodes that read a signal update when it
        changes.
      </p>
      <div class="demo-row">
        <button type="button" onClick={() => count.update((n) => n - 1)}>
          -
        </button>
        <span class="demo-value">{() => count()}</span>
        <button type="button" onClick={() => count.update((n) => n + 1)}>
          +
        </button>
      </div>
      <p class="demo-meta">doubled: {() => doubled()}</p>
      <p class="demo-meta">history: {() => history().join(" → ")}</p>
    </div>
  )
}

// ─── Batch Updates ────────────────────────────────────────────────────────────
// batch() groups multiple signal writes into a single reactive flush.

function BatchDemo() {
  const first = signal("Jane")
  const last = signal("Doe")
  const renderCount = signal(0)
  const fullName = computed(() => {
    renderCount.update((n) => n + 1)
    return `${first()} ${last()}`
  })

  const swapBatched = () => {
    batch(() => {
      const f = first()
      const l = last()
      first.set(l)
      last.set(f)
    })
  }

  const swapUnbatched = () => {
    const f = first()
    const l = last()
    first.set(l)
    last.set(f)
  }

  return (
    <div class="demo-section">
      <h3>Batch Updates</h3>
      <p class="demo-desc">
        batch() coalesces multiple signal writes — computed re-evaluates once, not twice.
      </p>
      <p class="demo-value">{() => fullName()}</p>
      <p class="demo-meta">computed evaluations: {() => renderCount()}</p>
      <div class="demo-row">
        <button type="button" onClick={swapBatched}>
          Swap (batched)
        </button>
        <button type="button" onClick={swapUnbatched}>
          Swap (unbatched)
        </button>
      </div>
    </div>
  )
}

// ─── Conditional Rendering with <Show> ────────────────────────────────────────
// <Show> only renders children when the `when` accessor is truthy.
// The fallback renders when falsy. No VDOM diffing — direct DOM swap.

function ShowDemo() {
  const loggedIn = signal(false)
  const username = signal("pyreon_user")

  return (
    <div class="demo-section">
      <h3>{"<Show>"} — Conditional Rendering</h3>
      <p class="demo-desc">Efficiently swaps DOM branches. No virtual DOM diffing needed.</p>
      <Show
        when={() => loggedIn()}
        fallback={
          <div class="demo-box">
            <p>Not logged in</p>
            <button type="button" onClick={() => loggedIn.set(true)}>
              Log in
            </button>
          </div>
        }
      >
        <div class="demo-box">
          <p>
            Welcome, <strong>{() => username()}</strong>
          </p>
          <input
            type="text"
            value={() => username()}
            onInput={(e: InputEvent) => username.set((e.target as HTMLInputElement).value)}
          />
          <button type="button" onClick={() => loggedIn.set(false)}>
            Log out
          </button>
        </div>
      </Show>
    </div>
  )
}

// ─── Keyed List Rendering with <For> ──────────────────────────────────────────
// <For> uses a keyed reconciler with LIS algorithm for minimal DOM moves.
// The `by` prop extracts a unique key (not `key` — JSX reserves that).

interface User {
  id: number
  name: string
  score: number
}

function ForDemo() {
  const users = signal<User[]>([
    { id: 1, name: "Alice", score: 92 },
    { id: 2, name: "Bob", score: 87 },
    { id: 3, name: "Carol", score: 95 },
    { id: 4, name: "Dave", score: 78 },
  ])

  const sortByScore = () => users.update((list) => [...list].sort((a, b) => b.score - a.score))

  const sortByName = () =>
    users.update((list) => [...list].sort((a, b) => a.name.localeCompare(b.name)))

  const shuffle = () =>
    users.update((list) => {
      const shuffled = [...list]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j] as User, shuffled[i] as User]
      }
      return shuffled
    })

  const addUser = () => {
    const names = ["Eve", "Frank", "Grace", "Hank", "Ivy", "Jack"]
    const name = names[Math.floor(Math.random() * names.length)] as string
    users.update((list) => [
      ...list,
      { id: Date.now(), name, score: Math.floor(Math.random() * 40) + 60 },
    ])
  }

  const removeUser = (id: number) => users.update((list) => list.filter((u) => u.id !== id))

  // createSelector — O(1) selection tracking (only old + new row re-render on change)
  const selectedId = signal<number | null>(null)
  const isSelected = createSelector(selectedId)

  return (
    <div class="demo-section">
      <h3>{"<For>"} — Keyed List Reconciliation</h3>
      <p class="demo-desc">
        LIS-based reconciler moves DOM nodes minimally. createSelector gives O(1) row selection.
      </p>
      <div class="demo-row">
        <button type="button" onClick={sortByScore}>
          Sort by Score
        </button>
        <button type="button" onClick={sortByName}>
          Sort by Name
        </button>
        <button type="button" onClick={shuffle}>
          Shuffle
        </button>
        <button type="button" onClick={addUser}>
          Add
        </button>
      </div>
      <ul class="user-list">
        <For each={() => users()} by={(u) => u.id}>
          {(user) => (
            <li
              class={() => (isSelected(user.id) ? "user-row selected" : "user-row")}
              onClick={() => selectedId.set(user.id === selectedId() ? null : user.id)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ")
                  selectedId.set(user.id === selectedId() ? null : user.id)
              }}
            >
              <span class="user-name">{user.name}</span>
              <span class="user-score">{user.score}</span>
              <button type="button" class="remove" onClick={() => removeUser(user.id)}>
                ×
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

// ─── Lifecycle Hooks & Refs ───────────────────────────────────────────────────
// onMount fires after DOM insertion. onUnmount fires before removal.
// createRef() gives a stable { current } container for DOM references.

function LifecycleDemo() {
  const visible = signal(true)
  const log = signal<string[]>([])

  const addLog = (msg: string) => log.update((l) => [...l.slice(-7), msg])

  function TimerWidget() {
    const elapsed = signal(0)
    const canvasRef = createRef<HTMLCanvasElement>()

    onMount(() => {
      addLog("TimerWidget mounted")
      const id = setInterval(() => elapsed.update((n) => n + 1), 1000)

      // Draw on the canvas via ref
      const ctx = canvasRef.current?.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#7c6af7"
        ctx.fillRect(0, 0, 120, 40)
        ctx.fillStyle = "#fff"
        ctx.font = "14px monospace"
        ctx.fillText("ref works!", 10, 25)
      }

      // Return cleanup — runs on unmount
      return () => {
        clearInterval(id)
        addLog("TimerWidget cleanup (interval cleared)")
      }
    })

    onUnmount(() => addLog("TimerWidget unmounted"))

    return (
      <div class="demo-box">
        <p>Elapsed: {() => elapsed()}s</p>
        <canvas ref={canvasRef} width={120} height={40} />
      </div>
    )
  }

  return (
    <div class="demo-section">
      <h3>Lifecycle & Refs</h3>
      <p class="demo-desc">
        onMount returns a cleanup function. createRef provides typed DOM access.
      </p>
      <button type="button" onClick={() => visible.update((v) => !v)}>
        {() => (visible() ? "Unmount widget" : "Mount widget")}
      </button>
      <Show when={() => visible()}>
        <TimerWidget />
      </Show>
      <pre class="log-output">{() => log().join("\n")}</pre>
    </div>
  )
}

// ─── useHead — Document Head Management ───────────────────────────────────────
// Reactive <title> and <meta> tags. Updates when signals change.

function HeadDemo() {
  const title = signal("Pyreon Showcase")
  const description = signal("A comprehensive demo of the Pyreon framework")

  useHead(() => ({
    title: title(),
    meta: [{ name: "description", content: description() }],
  }))

  return (
    <div class="demo-section">
      <h3>useHead — Document Head</h3>
      <p class="demo-desc">Reactive document title and meta tags. Check your browser tab!</p>
      <input
        type="text"
        value={() => title()}
        onInput={(e: InputEvent) => title.set((e.target as HTMLInputElement).value)}
        placeholder="Page title"
      />
      <p class="demo-meta">Tab title: {() => title()}</p>
    </div>
  )
}

// ─── Showcase Page ────────────────────────────────────────────────────────────

export function Showcase() {
  return (
    <ThemeProvider>
      <div class="showcase">
        <div class="showcase-header">
          <h2>Framework Showcase</h2>
          <ThemeSwatch />
        </div>
        <HeadDemo />
        <SignalsDemo />
        <BatchDemo />
        <ShowDemo />
        <ForDemo />
        <LifecycleDemo />
      </div>
    </ThemeProvider>
  )
}

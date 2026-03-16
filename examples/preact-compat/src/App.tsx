// Core API
import {
  cloneElement,
  createContext,
  createElement,
  createRef,
  Fragment,
  h,
  isValidElement,
  options,
  render,
  toChildArray,
  useContext,
} from "@pyreon/preact-compat"
// Hooks API
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "@pyreon/preact-compat/hooks"
// Signals API
import { batch, computed, effect, signal } from "@pyreon/preact-compat/signals"

// ─── All APIs ────────────────────────────────────────────────────────────────

const ALL_APIS = [
  "h",
  "createElement",
  "Fragment",
  "render",
  "createContext",
  "useContext",
  "createRef",
  "cloneElement",
  "toChildArray",
  "isValidElement",
  "options",
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useRef",
  "useReducer",
  "useId",
  "useErrorBoundary",
  "signal",
  "computed",
  "effect",
  "batch",
]

// ─── Demo wrapper ────────────────────────────────────────────────────────────

function Demo(props: { title: string; apis: string; code: string; children?: any }) {
  const [showCode, setShowCode] = useState(false)
  return (
    <section class="demo">
      <div class="demo-header">
        <h2>{props.title}</h2>
        <div class="demo-meta">
          <span class="api-tags">{props.apis}</span>
          <button type="button" class="code-toggle" onClick={() => setShowCode((v) => !v)}>
            {() => (showCode() ? "Hide Code" : "Show Code")}
          </button>
        </div>
      </div>
      {() =>
        showCode() ? (
          <pre class="code-preview">
            <code>{props.code}</code>
          </pre>
        ) : null
      }
      {props.children}
    </section>
  )
}

// ─── 1. useState ─────────────────────────────────────────────────────────────

function UseStateDemo() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState("Preact")

  return (
    <Demo
      title="useState"
      apis="useState"
      code={`const [count, setCount] = useState(0)
setCount(count() + 1)
setCount(prev => prev + 1)`}
    >
      <p>
        count: <strong>{() => count()}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          Increment
        </button>
        <button type="button" onClick={() => setCount((c) => c - 1)}>
          Decrement
        </button>
        <button type="button" onClick={() => setCount(0)}>
          Reset
        </button>
      </div>
      <p>
        name: <strong>{() => name()}</strong>
      </p>
      <div class="row">
        <input
          value={() => name()}
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
        />
      </div>
    </Demo>
  )
}

// ─── 2. useEffect & useLayoutEffect ─────────────────────────────────────────

function UseEffectDemo() {
  const [count, setCount] = useState(0)
  const [effectLog, setEffectLog] = useState("waiting...")
  const [layoutLog, setLayoutLog] = useState("waiting...")

  useEffect(() => {
    const c = count()
    queueMicrotask(() => {
      setEffectLog(`useEffect ran, count = ${c}`)
    })
  })

  useLayoutEffect(() => {
    const c = count()
    queueMicrotask(() => {
      setLayoutLog(`useLayoutEffect ran, count = ${c}`)
    })
  })

  return (
    <Demo
      title="useEffect & useLayoutEffect"
      apis="useEffect, useLayoutEffect"
      code={`useEffect(() => {
  console.log("count is", count())
})

useLayoutEffect(() => {
  // same API, runs synchronously
})`}
    >
      <p>
        count: <strong>{() => count()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">{() => effectLog()}</p>
      <p class="muted">{() => layoutLog()}</p>
    </Demo>
  )
}

// ─── 3. useMemo & useCallback ───────────────────────────────────────────────

function UseMemoDemo() {
  const [a, setA] = useState(3)
  const [b, setB] = useState(7)
  const sum = useMemo(() => a() + b())
  const multiply = useCallback(
    ((x: number, y: number) => x * y) as unknown as (...args: unknown[]) => unknown,
  ) as unknown as (x: number, y: number) => number

  return (
    <Demo
      title="useMemo & useCallback"
      apis="useMemo, useCallback"
      code={`const sum = useMemo(() => a() + b())
// sum() is auto-tracked

const multiply = useCallback((x, y) => x * y)
// returned as-is (components run once)`}
    >
      <p>
        a: <strong>{() => a()}</strong> | b: <strong>{() => b()}</strong>
      </p>
      <p>
        useMemo sum: <strong>{() => sum()}</strong>
      </p>
      <p>
        useCallback multiply(a, b): <strong>{() => multiply(a(), b())}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => setA((v) => v + 1)}>
          a++
        </button>
        <button type="button" onClick={() => setB((v) => v + 1)}>
          b++
        </button>
      </div>
    </Demo>
  )
}

// ─── 4. useReducer ──────────────────────────────────────────────────────────

type CounterAction = { type: "inc" } | { type: "dec" } | { type: "reset" }

function counterReducer(state: number, action: CounterAction): number {
  switch (action.type) {
    case "inc":
      return state + 1
    case "dec":
      return state - 1
    case "reset":
      return 0
  }
}

function UseReducerDemo() {
  const [count, dispatch] = useReducer(counterReducer, 0)

  return (
    <Demo
      title="useReducer"
      apis="useReducer"
      code={`const [count, dispatch] = useReducer(reducer, 0)
dispatch({ type: "inc" })`}
    >
      <p>
        count: <strong>{() => count()}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => dispatch({ type: "inc" })}>
          Increment
        </button>
        <button type="button" onClick={() => dispatch({ type: "dec" })}>
          Decrement
        </button>
        <button type="button" onClick={() => dispatch({ type: "reset" })}>
          Reset
        </button>
      </div>
    </Demo>
  )
}

// ─── 5. useRef & createRef ──────────────────────────────────────────────────

function UseRefDemo() {
  const inputRef = useRef<HTMLInputElement>()
  const classRef = createRef<HTMLInputElement>()
  const [msg, setMsg] = useState("")

  return (
    <Demo
      title="useRef & createRef"
      apis="useRef, createRef"
      code={`const inputRef = useRef<HTMLInputElement>()
// later: inputRef.current?.focus()

const classRef = createRef<HTMLInputElement>()
// same API`}
    >
      <div class="row">
        <input ref={inputRef} placeholder="useRef input" />
        <button
          type="button"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.focus()
              setMsg(`Focused useRef input (value: "${inputRef.current.value}")`)
            }
          }}
        >
          Focus useRef
        </button>
      </div>
      <div class="row">
        <input ref={classRef} placeholder="createRef input" />
        <button
          type="button"
          onClick={() => {
            if (classRef.current) {
              classRef.current.focus()
              setMsg(`Focused createRef input (value: "${classRef.current.value}")`)
            }
          }}
        >
          Focus createRef
        </button>
      </div>
      <p class="muted">{() => msg() || "Click a button to focus an input"}</p>
    </Demo>
  )
}

// ─── 6. useId ───────────────────────────────────────────────────────────────

function UseIdDemo() {
  const id1 = useId()
  const id2 = useId()

  return (
    <Demo
      title="useId"
      apis="useId"
      code={`const id = useId() // ":r0:"
// Stable unique string per component instance`}
    >
      <p>
        id1: <strong>{id1}</strong>
      </p>
      <p>
        id2: <strong>{id2}</strong>
      </p>
      <p class="muted">Each call returns a unique, stable identifier</p>
    </Demo>
  )
}

// ─── 7. Context ─────────────────────────────────────────────────────────────

const ThemeCtx = createContext("dark")

function ThemeConsumer() {
  const theme = useContext(ThemeCtx)
  return (
    <p>
      Current theme:{" "}
      <strong>{() => (typeof theme === "function" ? (theme as () => string)() : theme)}</strong>
    </p>
  )
}

function ContextDemo() {
  const [theme, setTheme] = useState("dark")

  return (
    <Demo
      title="Context"
      apis="createContext, useContext"
      code={`const ThemeCtx = createContext("dark")

// Provider
<ThemeCtx.Provider value={theme}>
  <ThemeConsumer />
</ThemeCtx.Provider>

// Consumer
const theme = useContext(ThemeCtx)`}
    >
      <ThemeCtx.Provider value={theme as unknown as string}>
        <ThemeConsumer />
      </ThemeCtx.Provider>
      <div class="row">
        <button type="button" onClick={() => setTheme("dark")}>
          Dark
        </button>
        <button type="button" onClick={() => setTheme("light")}>
          Light
        </button>
        <button type="button" onClick={() => setTheme("auto")}>
          Auto
        </button>
      </div>
    </Demo>
  )
}

// ─── 8. h, createElement, Fragment ──────────────────────────────────────────

function HFragmentDemo() {
  const [items, setItems] = useState(["one", "two", "three"])

  return (
    <Demo
      title="h / createElement / Fragment"
      apis="h, createElement, Fragment"
      code={`// h() — hyperscript
h("p", null, "Hello from h()")

// createElement — alias for h
createElement("p", null, "Same thing")

// Fragment — no wrapper node
h(Fragment, null, h("span", null, "A"), h("span", null, "B"))`}
    >
      {h("p", null, "Created with ", h("strong", null, "h()"))}
      {createElement("p", null, "Created with ", createElement("strong", null, "createElement()"))}
      {h(
        Fragment,
        null,
        h("p", { class: "muted" }, "Fragment child 1"),
        h("p", { class: "muted" }, "Fragment child 2"),
      )}
      <p>
        Items: <strong>{() => items().join(", ")}</strong>
      </p>
      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, `item-${prev.length + 1}`])}
      >
        Add item
      </button>
    </Demo>
  )
}

// ─── 9. cloneElement, toChildArray, isValidElement ──────────────────────────

function UtilsDemo() {
  const original = h("p", { class: "highlight" }, "Original element")
  const cloned = cloneElement(original, { class: "muted" })
  const nested = [["a", [null, "b"]], "c", false, undefined]
  const flattened = toChildArray(nested as import("@pyreon/core").VNodeChild[])

  return (
    <Demo
      title="Utilities"
      apis="cloneElement, toChildArray, isValidElement, options"
      code={`const el = h("p", { class: "highlight" }, "Original")
const clone = cloneElement(el, { class: "muted" })

toChildArray([["a", [null, "b"]], "c", false])
// => ["a", "b", "c"]

isValidElement(el)  // true
isValidElement(42)  // false

options // {} — plugin hook object`}
    >
      <p>original:</p>
      {original}
      <p>cloneElement (class changed):</p>
      {cloned}
      <p>
        toChildArray result: <strong>{flattened.map(String).join(", ")}</strong>
      </p>
      <p>
        isValidElement(h("p")): <strong>{String(isValidElement(h("p", null)))}</strong> |
        isValidElement(42): <strong>{String(isValidElement(42))}</strong>
      </p>
      <p class="muted">
        options: <strong>{JSON.stringify(options)}</strong> (empty hook object)
      </p>
    </Demo>
  )
}

// ─── 10. render ─────────────────────────────────────────────────────────────

function RenderDemo() {
  const [mounted, setMounted] = useState(false)

  function MiniApp() {
    return <p class="highlight">Mini app mounted via render()!</p>
  }

  return (
    <Demo
      title="render()"
      apis="render"
      code={`import { render } from "@pyreon/preact-compat"
render(<App />, document.getElementById("app"))`}
    >
      <div id="preact-render-target" style="min-height: 24px" />
      <div class="row">
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("preact-render-target")
            if (el && !mounted()) {
              render(<MiniApp />, el)
              setMounted(true)
            }
          }}
        >
          render() into target
        </button>
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("preact-render-target")
            if (el) {
              el.innerHTML = ""
              setMounted(false)
            }
          }}
        >
          Clear
        </button>
      </div>
      <p class="muted">{() => (mounted() ? "Mini app is rendered" : "Not rendered")}</p>
    </Demo>
  )
}

// ─── 11. Signals ────────────────────────────────────────────────────────────

function SignalsDemo() {
  const count = signal(0)
  const doubled = computed(() => count.value * 2)
  const [effectLog, setEffectLog] = useState("waiting...")

  const dispose = effect(() => {
    const c = count.value
    queueMicrotask(() => {
      setEffectLog(`effect: count = ${c}`)
    })
  })

  const [disposed, setDisposed] = useState(false)

  return (
    <Demo
      title="Signals"
      apis="signal, computed, effect, batch"
      code={`import { signal, computed, effect, batch }
  from "@pyreon/preact-compat/signals"

const count = signal(0)
const doubled = computed(() => count.value * 2)

const dispose = effect(() => {
  console.log(count.value)
})

batch(() => {
  count.value++
  count.value++
}) // single notification`}
    >
      <p>
        signal: <strong>{() => count.value}</strong> | computed doubled:{" "}
        <strong>{() => doubled.value}</strong>
      </p>
      <p>
        peek (untracked): <strong>{() => count.peek()}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => count.value++}>
          count++
        </button>
        <button
          type="button"
          onClick={() => {
            batch(() => {
              count.value++
              count.value++
            })
          }}
        >
          batch +2
        </button>
        <button
          type="button"
          onClick={() => {
            dispose()
            setDisposed(true)
          }}
        >
          Dispose effect
        </button>
      </div>
      <p class="muted">
        {() => effectLog()}
        {() => (disposed() ? " (disposed)" : "")}
      </p>
    </Demo>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <header>
        <h1>Pyreon — Preact Compat</h1>
        <p class="subtitle">
          Preact API (core + hooks + signals) running on Pyreon's fine-grained reactive engine
        </p>
        <p class="api-count">{ALL_APIS.length} APIs demonstrated across 3 entry points</p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          {ALL_APIS.map((api) => (
            <span class="tag">{api}</span>
          ))}
        </div>
      </nav>

      <UseStateDemo />
      <UseEffectDemo />
      <UseMemoDemo />
      <UseReducerDemo />
      <UseRefDemo />
      <UseIdDemo />
      <ContextDemo />
      <HFragmentDemo />
      <UtilsDemo />
      <RenderDemo />
      <SignalsDemo />

      <footer>
        Built with @pyreon/preact-compat — all {ALL_APIS.length} APIs from 3 entry points
      </footer>
    </>
  )
}

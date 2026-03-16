import {
  batch,
  createContext,
  createPortal,
  ErrorBoundary,
  lazy,
  memo,
  Suspense,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "@pyreon/react-compat"

// ─── Demo wrapper (children via VNode path, not template) ───────────────────

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

// ─── 1. useState ────────────────────────────────────────────────────────────

function UseStateDemo() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState("World")

  return (
    <Demo
      title="State Hook"
      apis="useState"
      code={`const [count, setCount] = useState(0);
const [name, setName] = useState("World");

// Read with getter
<span>Count: {count()}</span>

// Set directly or with updater
setCount(5);
setCount(prev => prev + 1);`}
    >
      <p>
        Count: <strong>{() => count()}</strong> | Name: <strong>{() => name()}</strong>
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
      <div class="row">
        <input
          type="text"
          value="World"
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
        />
      </div>
    </Demo>
  )
}

// ─── 2. useReducer ──────────────────────────────────────────────────────────

type CounterAction = { type: "increment" } | { type: "decrement" } | { type: "reset" }

function counterReducer(state: number, action: CounterAction): number {
  switch (action.type) {
    case "increment":
      return state + 1
    case "decrement":
      return state - 1
    case "reset":
      return 0
  }
}

function UseReducerDemo() {
  const [count, dispatch] = useReducer(counterReducer, 0)

  return (
    <Demo
      title="Reducer Hook"
      apis="useReducer"
      code={`function reducer(state, action) {
  switch (action.type) {
    case "increment": return state + 1;
    case "decrement": return state - 1;
    case "reset": return 0;
  }
}

const [count, dispatch] = useReducer(reducer, 0);
dispatch({ type: "increment" });`}
    >
      <p>
        Count: <strong>{() => count()}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => dispatch({ type: "increment" })}>
          +
        </button>
        <button type="button" onClick={() => dispatch({ type: "decrement" })}>
          -
        </button>
        <button type="button" onClick={() => dispatch({ type: "reset" })}>
          Reset
        </button>
      </div>
    </Demo>
  )
}

// ─── 3. useEffect ───────────────────────────────────────────────────────────

function UseEffectDemo() {
  const [count, setCount] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [mountMsg, setMountMsg] = useState("")

  // Reactive effect — deps auto-tracked (no deps array needed!)
  useEffect(() => {
    setLog((prev) => [...prev.slice(-4), `effect: count = ${count()}`])
  })

  // Mount-only effect (empty deps)
  useEffect(() => {
    setMountMsg("Mounted!")
  }, [])

  return (
    <Demo
      title="Side Effects"
      apis="useEffect"
      code={`const [count, setCount] = useState(0);

// Auto-tracked — no deps array needed!
useEffect(() => {
  console.log("count is", count());
});

// Mount-only ([] deps still works)
useEffect(() => {
  console.log("mounted!");
}, []);`}
    >
      <p>
        Count: <strong>{() => count()}</strong> | Mount: <strong>{() => mountMsg()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">Log: {() => log().join(" | ")}</p>
    </Demo>
  )
}

// ─── 4. useMemo / useCallback ───────────────────────────────────────────────

function UseMemoDemo() {
  const [count, setCount] = useState(1)
  const doubled = useMemo(() => count() * 2)
  const quadrupled = useMemo(() => doubled() * 2)
  const increment = useCallback(() => setCount((c) => c + 1))

  return (
    <Demo
      title="Memoization"
      apis="useMemo, useCallback"
      code={`const [count, setCount] = useState(1);

// Auto-tracked — no deps array needed!
const doubled = useMemo(() => count() * 2);
const quadrupled = useMemo(() => doubled() * 2);

// useCallback is identity — no stale closures
const increment = useCallback(() =>
  setCount(c => c + 1)
);`}
    >
      <p>
        Count: <strong>{() => count()}</strong> | Doubled: <strong>{() => doubled()}</strong> |
        Quadrupled: <strong>{() => quadrupled()}</strong>
      </p>
      <button type="button" onClick={increment}>
        Increment (useCallback)
      </button>
    </Demo>
  )
}

// ─── 5. useRef ──────────────────────────────────────────────────────────────

function UseRefDemo() {
  const inputRef = useRef<HTMLInputElement>()
  const renderCount = useRef(0)
  const [value, setValue] = useState("")

  useEffect(() => {
    value()
    renderCount.current = (renderCount.current ?? 0) + 1
  })

  return (
    <Demo
      title="Refs"
      apis="useRef"
      code={`const inputRef = useRef<HTMLInputElement>();
const renderCount = useRef(0);

// Focus the input
inputRef.current?.focus();

// Track renders without causing re-renders
renderCount.current++;`}
    >
      <div class="row">
        <input
          type="text"
          ref={inputRef}
          placeholder="Type here..."
          onInput={(e: Event) => setValue((e.target as HTMLInputElement).value)}
        />
        <button type="button" onClick={() => inputRef.current?.focus()}>
          Focus Input
        </button>
      </div>
      <p class="muted">
        Value: {() => value()} | Effect runs: {() => renderCount.current}
      </p>
    </Demo>
  )
}

// ─── 6. useId ───────────────────────────────────────────────────────────────

function UseIdDemo() {
  const id1 = useId()
  const id2 = useId()

  return (
    <Demo
      title="Unique IDs"
      apis="useId"
      code={`const id = useId(); // ":r0:"

// Stable, unique per component instance
<label htmlFor={id}>Name</label>
<input id={id} />`}
    >
      <p>
        ID 1: <strong>{id1}</strong> | ID 2: <strong>{id2}</strong>
      </p>
      <div class="row">
        <label>
          {id1}: <input type="text" id={id1} placeholder="First field" />
        </label>
        <label>
          {id2}: <input type="text" id={id2} placeholder="Second field" />
        </label>
      </div>
    </Demo>
  )
}

// ─── 7. batch ───────────────────────────────────────────────────────────────

function BatchDemo() {
  const [first, setFirst] = useState("John")
  const [last, setLast] = useState("Doe")
  const [effectRuns, setEffectRuns] = useState(0)

  useEffect(() => {
    first()
    last()
    setEffectRuns((c) => c + 1)
  })

  return (
    <Demo
      title="Batched Updates"
      apis="batch"
      code={`const [first, setFirst] = useState("John");
const [last, setLast] = useState("Doe");

// Both updates in a single re-render
batch(() => {
  setFirst("Jane");
  setLast("Smith");
});`}
    >
      <p>
        Name: <strong>{() => first()}</strong> <strong>{() => last()}</strong>
      </p>
      <p class="muted">Effect runs: {() => effectRuns()}</p>
      <button
        type="button"
        onClick={() => {
          batch(() => {
            setFirst((f) => (f === "John" ? "Jane" : "John"))
            setLast((l) => (l === "Doe" ? "Smith" : "Doe"))
          })
        }}
      >
        Swap (batched)
      </button>
    </Demo>
  )
}

// ─── 8. memo ────────────────────────────────────────────────────────────────

const ExpensiveChild = memo(function _ExpensiveChild(props: { value: number }) {
  return (
    <p>
      Memoized component — value: <strong>{props.value}</strong>
    </p>
  )
})

function MemoDemo() {
  const [count, setCount] = useState(0)

  return (
    <Demo
      title="Component Memoization"
      apis="memo"
      code={`// In Pyreon, components run once — memo is a no-op
// Kept for API compatibility
const Expensive = memo(function Expensive({ value }) {
  return <p>Value: {value}</p>;
});`}
    >
      <ExpensiveChild value={42} />
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Parent re-render ({() => count()})
      </button>
      <p class="muted">memo is a no-op — Pyreon components run once</p>
    </Demo>
  )
}

// ─── 9. useTransition / useDeferredValue ────────────────────────────────────

function TransitionDemo() {
  const [isPending, startTransition] = useTransition()
  const [count, setCount] = useState(0)
  const deferred = useDeferredValue(42)

  return (
    <Demo
      title="Transitions & Deferred"
      apis="useTransition, useDeferredValue"
      code={`// No-ops in Pyreon (no concurrent mode)
// Kept for API compatibility
const [isPending, startTransition] = useTransition();

startTransition(() => {
  setCount(c => c + 1); // runs immediately
});

const deferred = useDeferredValue(value);
// returns value as-is`}
    >
      <p>
        isPending: <strong>{String(isPending)}</strong> | Deferred: <strong>{deferred}</strong>
      </p>
      <button type="button" onClick={() => startTransition(() => setCount((c) => c + 1))}>
        startTransition ({() => count()})
      </button>
      <p class="muted">Both are no-ops — Pyreon has no concurrent mode</p>
    </Demo>
  )
}

// ─── 10. createContext / useContext ──────────────────────────────────────────

const ThemeContext = createContext<"light" | "dark">("light")

function ThemeDisplay() {
  const theme = useContext(ThemeContext)
  return (
    <span>
      Theme: <strong>{theme}</strong>
    </span>
  )
}

function ContextDemo() {
  return (
    <Demo
      title="Context"
      apis="createContext, useContext"
      code={`const ThemeContext = createContext("light");

function ThemeDisplay() {
  const theme = useContext(ThemeContext);
  return <span>Theme: {theme}</span>;
}

// Default value: "light"
<ThemeDisplay />`}
    >
      <p>
        Default context: <ThemeDisplay />
      </p>
    </Demo>
  )
}

// ─── 11. useImperativeHandle ────────────────────────────────────────────────

function UseImperativeHandleDemo() {
  const ref = useRef<{ focus: () => void }>()
  const [msg, setMsg] = useState("")

  function FancyInput(props: { inputRef: { current: { focus: () => void } | null } }) {
    const realInput = useRef<HTMLInputElement>()

    useImperativeHandle(props.inputRef, () => ({
      focus: () => {
        realInput.current?.focus()
        setMsg("Focused via imperative handle!")
      },
    }))

    return <input type="text" ref={realInput} placeholder="Fancy input" />
  }

  return (
    <Demo
      title="Imperative Handle"
      apis="useImperativeHandle"
      code={`function FancyInput({ inputRef }) {
  const realInput = useRef();

  useImperativeHandle(inputRef, () => ({
    focus: () => realInput.current?.focus(),
  }));

  return <input ref={realInput} />;
}

// Parent
const ref = useRef();
ref.current?.focus();`}
    >
      <FancyInput inputRef={ref} />
      <button type="button" onClick={() => ref.current?.focus()}>
        Focus via Handle
      </button>
      <p class="muted">{() => msg()}</p>
    </Demo>
  )
}

// ─── 12. ErrorBoundary ──────────────────────────────────────────────────────

function Bomb() {
  throw new Error("Boom!")
}

function ErrorDemo() {
  const [explode, setExplode] = useState(false)

  return (
    <Demo
      title="Error Handling"
      apis="ErrorBoundary"
      code={`<ErrorBoundary
  fallback={(err) => <p>Caught: {err.message}</p>}
>
  <RiskyComponent />
</ErrorBoundary>`}
    >
      <div class="row">
        <button type="button" onClick={() => setExplode(true)}>
          Trigger Error
        </button>
        <button type="button" onClick={() => setExplode(false)}>
          Reset
        </button>
      </div>
      <ErrorBoundary fallback={(err: Error) => <p class="error-msg">Caught: {err.message}</p>}>
        {() => (explode() ? <Bomb /> : <p class="muted">No errors yet</p>)}
      </ErrorBoundary>
    </Demo>
  )
}

// ─── 13. lazy + Suspense ────────────────────────────────────────────────────

const LazyHeavy = lazy(
  () =>
    new Promise<{ default: (props: Record<string, never>) => any }>((resolve) => {
      setTimeout(() => {
        resolve({
          default: () => <p>Lazy component loaded!</p>,
        })
      }, 1000)
    }),
)

function LazyDemo() {
  const [show, setShow] = useState(false)

  return (
    <Demo
      title="Code Splitting"
      apis="lazy, Suspense"
      code={`const LazyComponent = lazy(
  () => import("./HeavyComponent")
);

<Suspense fallback={<p>Loading...</p>}>
  <LazyComponent />
</Suspense>`}
    >
      <button type="button" onClick={() => setShow(true)}>
        Load Component (1s delay)
      </button>
      {() =>
        show() ? (
          <Suspense fallback={<p class="muted">Loading...</p>}>
            <LazyHeavy />
          </Suspense>
        ) : null
      }
    </Demo>
  )
}

// ─── 14. createPortal ───────────────────────────────────────────────────────

function PortalDemo() {
  const [show, setShow] = useState(false)

  return (
    <Demo
      title="Portals"
      apis="createPortal"
      code={`import { createPortal } from "@pyreon/react-compat";

// Render children into document.body
{createPortal(
  <div class="modal">Portal content</div>,
  document.body
)}`}
    >
      <button type="button" onClick={() => setShow((v) => !v)}>
        {() => (show() ? "Hide Portal" : "Show Portal")}
      </button>
      {() =>
        show()
          ? createPortal(
              <div style="position:fixed;bottom:1rem;right:1rem;background:#1c1c20;border:1px solid #2a2a2e;border-radius:8px;padding:1rem;color:#e4e4e7;z-index:9999;">
                I'm a portal rendered in document.body!
              </div>,
              document.body,
            )
          : null
      }
      <p class="muted">
        {() => (show() ? "Portal is visible (bottom-right corner)" : "Click to show")}
      </p>
    </Demo>
  )
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div id="app-root">
      <header>
        <h1>Pyreon — React Compat</h1>
        <p class="subtitle">
          Familiar React hooks running on Pyreon's reactive engine. No hooks rules, no stale
          closures, automatic dependency tracking.
        </p>
        <p class="api-count">
          <strong>19 APIs</strong> demonstrated across <strong>14 interactive examples</strong>
        </p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          <span class="tag">useState</span>
          <span class="tag">useReducer</span>
          <span class="tag">useEffect</span>
          <span class="tag">useMemo</span>
          <span class="tag">useCallback</span>
          <span class="tag">useRef</span>
          <span class="tag">useId</span>
          <span class="tag">useImperativeHandle</span>
          <span class="tag">useTransition</span>
          <span class="tag">useDeferredValue</span>
          <span class="tag">batch</span>
          <span class="tag">memo</span>
          <span class="tag">createContext</span>
          <span class="tag">useContext</span>
          <span class="tag">createPortal</span>
          <span class="tag">lazy</span>
          <span class="tag">Suspense</span>
          <span class="tag">ErrorBoundary</span>
          <span class="tag">createRoot</span>
        </div>
      </nav>

      <main>
        <UseStateDemo />
        <UseReducerDemo />
        <UseEffectDemo />
        <UseMemoDemo />
        <UseRefDemo />
        <UseIdDemo />
        <BatchDemo />
        <MemoDemo />
        <TransitionDemo />
        <ContextDemo />
        <UseImperativeHandleDemo />
        <ErrorDemo />
        <LazyDemo />
        <PortalDemo />
      </main>

      <footer>
        <p>
          Built with <strong>@pyreon/react-compat</strong> — 0 lines of React, 100% Pyreon engine
        </p>
      </footer>
    </div>
  )
}

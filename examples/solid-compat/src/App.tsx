import {
  For,
  Show,
  Switch,
  Match,
  ErrorBoundary,
  Suspense,
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  createContext,
  useContext,
  createSelector,
  on,
  batch,
  untrack,
  onMount,
  onCleanup,
  mergeProps,
  splitProps,
  children,
  lazy,
  getOwner,
  runWithOwner,
  createRenderEffect,
  createComputed,
} from "@pyreon/solid-compat"

// ─── Code Preview Component ─────────────────────────────────────────────────

function Demo(props: { title: string; apis: string; code: string; children?: any }) {
  const [showCode, setShowCode] = createSignal(false)

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
      <Show when={showCode}>
        <pre class="code-preview"><code>{props.code}</code></pre>
      </Show>
      {props.children}
    </section>
  )
}

// ─── 1. createSignal ────────────────────────────────────────────────────────

function SignalDemo() {
  const [count, setCount] = createSignal(0)

  return (
    <Demo
      title="Reactive State"
      apis="createSignal"
      code={`const [count, setCount] = createSignal(0);

// Read with getter
<span>Count: {count()}</span>

// Set directly
setCount(5);

// Update with function
setCount(prev => prev + 1);`}
    >
      <p>Count: <strong>{() => count()}</strong></p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button type="button" onClick={() => setCount((c) => c - 1)}>Decrement</button>
      <button type="button" onClick={() => setCount(0)}>Reset</button>
    </Demo>
  )
}

// ─── 2. createEffect ────────────────────────────────────────────────────────

function EffectDemo() {
  const [count, setCount] = createSignal(0)
  const [log, setLog] = createSignal<string[]>([])

  createEffect(() => {
    setLog((prev) => [...prev.slice(-4), `Effect ran: count = ${count()}`])
  })

  return (
    <Demo
      title="Side Effects"
      apis="createEffect"
      code={`const [count, setCount] = createSignal(0);

createEffect(() => {
  // Runs whenever count() changes
  console.log("count is", count());
});`}
    >
      <p>Count: <strong>{() => count()}</strong></p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>Increment</button>
      <p class="muted">Log: {() => log().join(" | ")}</p>
    </Demo>
  )
}

// ─── 3. createMemo ──────────────────────────────────────────────────────────

function MemoDemo() {
  const [count, setCount] = createSignal(1)
  const doubled = createMemo(() => count() * 2)
  const quadrupled = createMemo(() => doubled() * 2)

  return (
    <Demo
      title="Derived Values"
      apis="createMemo"
      code={`const [count, setCount] = createSignal(1);
const doubled = createMemo(() => count() * 2);
const quadrupled = createMemo(() => doubled() * 2);

// Memos cache: only recompute when deps change
<span>{doubled()} / {quadrupled()}</span>`}
    >
      <p>
        Count: <strong>{() => count()}</strong> |
        Doubled: <strong>{() => doubled()}</strong> |
        Quadrupled: <strong>{() => quadrupled()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>Increment</button>
    </Demo>
  )
}

// ─── 4. batch ───────────────────────────────────────────────────────────────

function BatchDemo() {
  const [first, setFirst] = createSignal("John")
  const [last, setLast] = createSignal("Doe")
  const [renderCount, setRenderCount] = createSignal(0)

  createEffect(() => {
    first()
    last()
    setRenderCount((c) => c + 1)
  })

  return (
    <Demo
      title="Batched Updates"
      apis="batch"
      code={`const [first, setFirst] = createSignal("John");
const [last, setLast] = createSignal("Doe");

// Without batch: 2 re-renders
// With batch: 1 re-render
batch(() => {
  setFirst("Jane");
  setLast("Smith");
});`}
    >
      <p>Name: <strong>{() => first()}</strong> <strong>{() => last()}</strong></p>
      <p class="muted">Effect runs: {() => renderCount()}</p>
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

// ─── 5. untrack ─────────────────────────────────────────────────────────────

function UntrackDemo() {
  const [tracked, setTracked] = createSignal(0)
  const [untrackedVal, setUntrackedVal] = createSignal(0)
  const [log, setLog] = createSignal("")

  createEffect(() => {
    const t = tracked()
    const u = untrack(() => untrackedVal())
    setLog(`Effect: tracked=${t}, untracked=${u}`)
  })

  return (
    <Demo
      title="Untracked Reads"
      apis="untrack"
      code={`const [tracked, setTracked] = createSignal(0);
const [silent, setSilent] = createSignal(0);

createEffect(() => {
  const t = tracked();
  const s = untrack(() => silent()); // read without subscribing
  console.log(t, s);
});`}
    >
      <button type="button" onClick={() => setTracked((v) => v + 1)}>
        tracked++ ({() => tracked()}) — triggers effect
      </button>
      <button type="button" onClick={() => setUntrackedVal((v) => v + 1)}>
        untracked++ ({() => untrackedVal()}) — silent
      </button>
      <p class="muted">{() => log()}</p>
    </Demo>
  )
}

// ─── 6. on() ────────────────────────────────────────────────────────────────

function OnDemo() {
  const [a, setA] = createSignal(1)
  const [b, setB] = createSignal(10)
  const [result, setResult] = createSignal("(click a++ to start)")

  createEffect(
    on(
      () => a(),
      (val, prev) => {
        setResult(`a: ${prev} → ${val} (b=${untrack(b)} not tracked)`)
      },
    ),
  )

  return (
    <Demo
      title="Explicit Dependencies"
      apis="on"
      code={`const [a, setA] = createSignal(1);
const [b, setB] = createSignal(10);

createEffect(on(
  () => a(),           // only track a
  (val, prev) => {
    console.log(val, prev, untrack(b));
  }
));`}
    >
      <button type="button" onClick={() => setA((v) => v + 1)}>a++ ({() => a()}) — triggers</button>
      <button type="button" onClick={() => setB((v) => v + 1)}>b++ ({() => b()}) — silent</button>
      <p class="muted">{() => result()}</p>
    </Demo>
  )
}

// ─── 7. createRenderEffect / createComputed ─────────────────────────────────

function RenderEffectDemo() {
  const [count, setCount] = createSignal(0)
  const [renderLog, setRenderLog] = createSignal<string[]>([])
  const [computedLog, setComputedLog] = createSignal<string[]>([])

  createRenderEffect(() => {
    setRenderLog((prev) => [...prev.slice(-3), `render: ${count()}`])
  })

  createComputed(() => {
    setComputedLog((prev) => [...prev.slice(-3), `computed: ${count()}`])
  })

  return (
    <Demo
      title="Render Effect & Computed"
      apis="createRenderEffect, createComputed"
      code={`// createRenderEffect — runs during render phase
createRenderEffect(() => {
  console.log("render:", count());
});

// createComputed — legacy Solid alias for createEffect
createComputed(() => {
  console.log("computed:", count());
});`}
    >
      <p>Count: <strong>{() => count()}</strong></p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>Increment</button>
      <p class="muted">renderEffect: {() => renderLog().join(" | ")}</p>
      <p class="muted">createComputed: {() => computedLog().join(" | ")}</p>
    </Demo>
  )
}

// ─── 8. Show ────────────────────────────────────────────────────────────────

function ShowDemo() {
  const [visible, setVisible] = createSignal(true)

  return (
    <Demo
      title="Conditional Rendering"
      apis="Show"
      code={`const [visible, setVisible] = createSignal(true);

<Show
  when={visible}
  fallback={<p>Nothing to see here</p>}
>
  <p>Hello, I'm visible!</p>
</Show>`}
    >
      <button type="button" onClick={() => setVisible((v) => !v)}>
        Toggle ({() => (visible() ? "visible" : "hidden")})
      </button>
      <Show when={visible} fallback={<p class="muted">Nothing to see here</p>}>
        <p>Hello, I'm visible!</p>
      </Show>
    </Demo>
  )
}

// ─── 9. Switch / Match ──────────────────────────────────────────────────────

function SwitchDemo() {
  const [tab, setTab] = createSignal<"home" | "about" | "contact">("home")

  return (
    <Demo
      title="Multi-Branch Conditionals"
      apis="Switch, Match"
      code={`const [tab, setTab] = createSignal("home");

<Switch fallback={<p>Unknown tab</p>}>
  <Match when={() => tab() === "home"}>
    <p>Welcome home!</p>
  </Match>
  <Match when={() => tab() === "about"}>
    <p>About us</p>
  </Match>
</Switch>`}
    >
      <div class="row">
        <button type="button" class={() => (tab() === "home" ? "selected" : "")} onClick={() => setTab("home")}>Home</button>
        <button type="button" class={() => (tab() === "about" ? "selected" : "")} onClick={() => setTab("about")}>About</button>
        <button type="button" class={() => (tab() === "contact" ? "selected" : "")} onClick={() => setTab("contact")}>Contact</button>
      </div>
      <Switch>
        <Match when={() => tab() === "home"}>
          <p>Welcome home!</p>
        </Match>
        <Match when={() => tab() === "about"}>
          <p>Learn more about Pyreon.</p>
        </Match>
        <Match when={() => tab() === "contact"}>
          <p>Get in touch with us.</p>
        </Match>
      </Switch>
    </Demo>
  )
}

// ─── 10. For ────────────────────────────────────────────────────────────────

function ForDemo() {
  const [items, setItems] = createSignal([
    { id: 1, text: "Learn Pyreon" },
    { id: 2, text: "Build an app" },
    { id: 3, text: "Ship it" },
  ])
  let nextId = 4

  return (
    <Demo
      title="Keyed List Rendering"
      apis="For"
      code={`const [items, setItems] = createSignal([
  { id: 1, text: "Learn Pyreon" },
  { id: 2, text: "Build an app" },
]);

<For each={items} by={item => item.id}>
  {item => <li>{item.text}</li>}
</For>`}
    >
      <div class="row">
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { id: nextId++, text: `Task ${nextId - 1}` }])}
        >
          Add
        </button>
        <button type="button" onClick={() => setItems((prev) => prev.slice(0, -1))}>Remove Last</button>
        <button type="button" onClick={() => setItems([])}>Clear</button>
      </div>
      <ul>
        <For each={items} by={(item) => item.id}>
          {(item) => <li>{item.text}</li>}
        </For>
      </ul>
    </Demo>
  )
}

// ─── 11. createSelector ─────────────────────────────────────────────────────

function SelectorDemo() {
  const [selected, setSelected] = createSignal(1)
  const isSelected = createSelector(selected)
  const ids = [1, 2, 3, 4, 5]

  return (
    <Demo
      title="Efficient Selection"
      apis="createSelector"
      code={`const [selected, setSelected] = createSignal(1);
const isSelected = createSelector(selected);

// Only the prev and next selected item re-render
<button class={isSelected(id) ? "selected" : ""}>
  Item {id}
</button>`}
    >
      <div class="row">
        {ids.map((id) => (
          <button
            type="button"
            class={() => (isSelected(id) ? "selected" : "")}
            onClick={() => setSelected(id)}
          >
            Item {id}
          </button>
        ))}
      </div>
      <p class="muted">Selected: {() => selected()}</p>
    </Demo>
  )
}

// ─── 12. mergeProps / splitProps ─────────────────────────────────────────────

function Greeting(props: { greeting?: string; name: string; class?: string }) {
  const merged = mergeProps({ greeting: "Hello" }, props)
  const [local, rest] = splitProps(merged, ["greeting", "name"])

  return (
    <p {...rest}>
      {local.greeting}, <strong>{local.name}</strong>!
    </p>
  )
}

function PropsDemo() {
  return (
    <Demo
      title="Props Utilities"
      apis="mergeProps, splitProps"
      code={`function Greeting(props) {
  // Provide defaults
  const merged = mergeProps(
    { greeting: "Hello" },
    props
  );
  // Separate local from pass-through
  const [local, rest] = splitProps(
    merged, ["greeting", "name"]
  );

  return <p {...rest}>{local.greeting}, {local.name}!</p>;
}`}
    >
      <Greeting name="World" />
      <Greeting greeting="Hey" name="Pyreon" class="highlight" />
      <Greeting greeting="Bonjour" name="Developer" />
    </Demo>
  )
}

// ─── 13. onMount / onCleanup ────────────────────────────────────────────────

function LifecycleDemo() {
  const [show, setShow] = createSignal(true)
  const [events, setEvents] = createSignal<string[]>([])

  function Inner() {
    onMount(() => {
      setEvents((prev) => [...prev.slice(-4), "mounted"])
      return undefined
    })

    onCleanup(() => {
      setEvents((prev) => [...prev.slice(-4), "cleaned up"])
    })

    return <p>Component is alive</p>
  }

  return (
    <Demo
      title="Lifecycle Hooks"
      apis="onMount, onCleanup"
      code={`function Inner() {
  onMount(() => {
    console.log("mounted!");
    return undefined;
  });

  onCleanup(() => {
    console.log("cleaned up!");
  });

  return <p>Component is alive</p>;
}`}
    >
      <button type="button" onClick={() => setShow((v) => !v)}>
        {() => (show() ? "Unmount" : "Mount")}
      </button>
      <Show when={show}>
        <Inner />
      </Show>
      <p class="muted">Events: {() => events().join(" → ")}</p>
    </Demo>
  )
}

// ─── 14. children() ─────────────────────────────────────────────────────────

function ColoredBox(props: { color: string; children?: any }) {
  const resolved = children(() => props.children)
  return (
    <div style={`border: 2px solid ${props.color}; padding: 8px; margin: 4px 0; border-radius: 6px;`}>
      {resolved()}
    </div>
  )
}

function ChildrenDemo() {
  return (
    <Demo
      title="Children Helper"
      apis="children"
      code={`function ColoredBox(props) {
  // Resolve and memoize children
  const resolved = children(() => props.children);

  return (
    <div style="border: 2px solid blue">
      {resolved}
    </div>
  );
}`}
    >
      <ColoredBox color="#4f46e5">
        <p>Inside an indigo box</p>
      </ColoredBox>
      <ColoredBox color="#059669">
        <p>Inside an emerald box</p>
      </ColoredBox>
    </Demo>
  )
}

// ─── 15. createContext / useContext ──────────────────────────────────────────

const ThemeContext = createContext<"light" | "dark">("light")

function ThemeDisplay() {
  const theme = useContext(ThemeContext)
  return <span class="badge">Theme: <strong>{theme}</strong></span>
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
      <p>Default context: <ThemeDisplay /></p>
    </Demo>
  )
}

// ─── 16. ErrorBoundary ──────────────────────────────────────────────────────

function Bomb() {
  throw new Error("Boom!")
}

function ErrorDemo() {
  const [explode, setExplode] = createSignal(false)

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
      <button type="button" onClick={() => setExplode(true)}>Trigger Error</button>
      <button type="button" onClick={() => setExplode(false)}>Reset</button>
      <ErrorBoundary fallback={(err: Error) => <p class="error-msg">Caught: {err.message}</p>}>
        <Show when={explode}>
          <Bomb />
        </Show>
        <Show when={() => !explode()}>
          <p class="muted">No errors yet — click to trigger</p>
        </Show>
      </ErrorBoundary>
    </Demo>
  )
}

// ─── 17. lazy + Suspense ────────────────────────────────────────────────────

const LazyHeavy = lazy(
  () =>
    new Promise<{ default: (props: {}) => any }>((resolve) => {
      setTimeout(() => {
        resolve({
          default: () => <p>Lazy component loaded!</p>,
        })
      }, 1000)
    }),
)

function LazyDemo() {
  const [show, setShow] = createSignal(false)

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
      <button type="button" onClick={() => setShow(true)}>Load Component (1s delay)</button>
      <Show when={show}>
        <Suspense fallback={<p class="muted">Loading...</p>}>
          <LazyHeavy />
        </Suspense>
      </Show>
    </Demo>
  )
}

// ─── 18. createRoot ─────────────────────────────────────────────────────────

function RootDemo() {
  const [result, setResult] = createSignal("")

  const run = () => {
    createRoot((dispose) => {
      const [val] = createSignal(42)
      setResult(`Created isolated root, read value: ${val()}`)
      dispose()
    })
  }

  return (
    <Demo
      title="Manual Root Scope"
      apis="createRoot"
      code={`createRoot((dispose) => {
  // Create an isolated reactive scope
  const [val, setVal] = createSignal(42);
  console.log(val());

  // Clean up when done
  dispose();
});`}
    >
      <button type="button" onClick={run}>Run createRoot</button>
      <p class="muted">{() => result()}</p>
    </Demo>
  )
}

// ─── 19. getOwner / runWithOwner ────────────────────────────────────────────

function OwnerDemo() {
  const [result, setResult] = createSignal("")

  const run = () => {
    const owner = getOwner()
    setResult(owner ? "Captured current owner scope" : "No owner (outside reactive scope)")

    if (owner) {
      setTimeout(() => {
        runWithOwner(owner, () => {
          setResult("Ran async work inside captured owner scope!")
        })
      }, 500)
    }
  }

  return (
    <Demo
      title="Owner Scope"
      apis="getOwner, runWithOwner"
      code={`// Capture the current reactive scope
const owner = getOwner();

// Run async work in the captured scope
setTimeout(() => {
  runWithOwner(owner, () => {
    // Has access to the original scope
    createEffect(() => { ... });
  });
}, 1000);`}
    >
      <button type="button" onClick={run}>Capture & Run</button>
      <p class="muted">{() => result()}</p>
    </Demo>
  )
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div id="app-root">
      <header>
        <h1>Pyreon — Solid Compat</h1>
        <p class="subtitle">
          Complete SolidJS-compatible API running on Pyreon's reactive engine.
          Every API below is a drop-in replacement — same signatures, same patterns.
        </p>
        <p class="api-count">
          <strong>24 APIs</strong> demonstrated across <strong>19 interactive examples</strong>
        </p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          <span class="tag">createSignal</span>
          <span class="tag">createEffect</span>
          <span class="tag">createMemo</span>
          <span class="tag">createRenderEffect</span>
          <span class="tag">createComputed</span>
          <span class="tag">batch</span>
          <span class="tag">untrack</span>
          <span class="tag">on</span>
          <span class="tag">createSelector</span>
          <span class="tag">createRoot</span>
          <span class="tag">getOwner</span>
          <span class="tag">runWithOwner</span>
          <span class="tag">onMount</span>
          <span class="tag">onCleanup</span>
          <span class="tag">mergeProps</span>
          <span class="tag">splitProps</span>
          <span class="tag">children</span>
          <span class="tag">lazy</span>
          <span class="tag">createContext</span>
          <span class="tag">useContext</span>
          <span class="tag">Show</span>
          <span class="tag">Switch / Match</span>
          <span class="tag">For</span>
          <span class="tag">Suspense</span>
          <span class="tag">ErrorBoundary</span>
        </div>
      </nav>

      <main>
        <SignalDemo />
        <EffectDemo />
        <MemoDemo />
        <BatchDemo />
        <UntrackDemo />
        <OnDemo />
        <RenderEffectDemo />
        <ShowDemo />
        <SwitchDemo />
        <ForDemo />
        <SelectorDemo />
        <PropsDemo />
        <LifecycleDemo />
        <ChildrenDemo />
        <ContextDemo />
        <ErrorDemo />
        <LazyDemo />
        <RootDemo />
        <OwnerDemo />
      </main>

      <footer>
        <p>
          Built with <strong>@pyreon/solid-compat</strong> — 0 lines of SolidJS, 100% Pyreon engine
        </p>
      </footer>
    </div>
  )
}

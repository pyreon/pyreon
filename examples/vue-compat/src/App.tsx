import {
  batch,
  computed,
  createApp,
  defineComponent,
  Fragment,
  h,
  inject,
  isRef,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  onUpdated,
  provide,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowRef,
  toRaw,
  toRef,
  toRefs,
  triggerRef,
  unref,
  watch,
  watchEffect,
} from "@pyreon/vue-compat"

// ─── All APIs ────────────────────────────────────────────────────────────────

const ALL_APIS = [
  "ref",
  "shallowRef",
  "triggerRef",
  "isRef",
  "unref",
  "computed",
  "reactive",
  "shallowReactive",
  "readonly",
  "toRaw",
  "toRef",
  "toRefs",
  "watch",
  "watchEffect",
  "onMounted",
  "onUnmounted",
  "onUpdated",
  "onBeforeMount",
  "onBeforeUnmount",
  "nextTick",
  "provide",
  "inject",
  "defineComponent",
  "h",
  "Fragment",
  "createApp",
  "batch",
]

// ─── Demo wrapper ────────────────────────────────────────────────────────────

function Demo(props: { title: string; apis: string; code: string; children?: any }) {
  const showCode = ref(false)
  return (
    <section class="demo">
      <div class="demo-header">
        <h2>{props.title}</h2>
        <div class="demo-meta">
          <span class="api-tags">{props.apis}</span>
          <button
            type="button"
            class="code-toggle"
            onClick={() => {
              showCode.value = !showCode.value
            }}
          >
            {() => (showCode.value ? "Hide Code" : "Show Code")}
          </button>
        </div>
      </div>
      {() =>
        showCode.value ? (
          <pre class="code-preview">
            <code>{props.code}</code>
          </pre>
        ) : null
      }
      {props.children}
    </section>
  )
}

// ─── 1. Ref & Helpers ────────────────────────────────────────────────────────

function RefDemo() {
  const count = ref(0)
  const shallow = shallowRef({ n: 0 })
  const triggerCount = ref(0)
  const checkTarget = ref(42)

  return (
    <Demo
      title="Ref & Helpers"
      apis="ref, shallowRef, triggerRef, isRef, unref"
      code={`const count = ref(0)
const shallow = shallowRef({ n: 0 })

// triggerRef forces re-evaluation
shallow.value.n++
triggerRef(shallow)

// isRef / unref
isRef(count)    // true
unref(count)    // 0 (unwrapped)`}
    >
      <p>
        count: <strong>{() => count.value}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => count.value++}>
          Increment
        </button>
        <button type="button" onClick={() => count.value--}>
          Decrement
        </button>
      </div>
      <p>
        shallowRef.n: <strong>{() => shallow.value.n}</strong> (mutate + triggerRef)
      </p>
      <button
        type="button"
        onClick={() => {
          shallow.value.n++
          triggerRef(shallow)
          triggerCount.value++
        }}
      >
        Mutate & Trigger ({() => triggerCount.value}x)
      </button>
      <p class="muted">
        isRef(count): <strong>{() => String(isRef(checkTarget))}</strong> | unref(count):{" "}
        <strong>{() => unref(count)}</strong>
      </p>
    </Demo>
  )
}

// ─── 2. Computed ─────────────────────────────────────────────────────────────

function ComputedDemo() {
  const firstName = ref("Vue")
  const lastName = ref("Compat")
  const fullName = computed(() => `${firstName.value} ${lastName.value}`)

  const raw = ref(5)
  const writable = computed({
    get: () => raw.value * 2,
    set: (v: number) => {
      raw.value = v / 2
    },
  })

  return (
    <Demo
      title="Computed"
      apis="computed"
      code={`const firstName = ref("Vue")
const lastName = ref("Compat")
const fullName = computed(() => \`\${firstName.value} \${lastName.value}\`)

// Writable computed
const raw = ref(5)
const doubled = computed({
  get: () => raw.value * 2,
  set: (v) => { raw.value = v / 2 },
})`}
    >
      <p>
        fullName: <strong>{() => fullName.value}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => (firstName.value = "Pyreon")}>
          firstName = "Pyreon"
        </button>
        <button type="button" onClick={() => (lastName.value = "Framework")}>
          lastName = "Framework"
        </button>
      </div>
      <p>
        writable computed: <strong>{() => writable.value}</strong> (raw: {() => raw.value})
      </p>
      <div class="row">
        <button type="button" onClick={() => (writable.value = 20)}>
          Set to 20
        </button>
        <button type="button" onClick={() => raw.value++}>
          raw++
        </button>
      </div>
    </Demo>
  )
}

// ─── 3. Reactive & Readonly ──────────────────────────────────────────────────

function ReactiveDemo() {
  const state = reactive({ x: 0, y: 0 })
  const shallow = shallowReactive({ label: "hello" })
  const frozen = readonly({ secret: 42 })
  const errorMsg = ref("")

  return (
    <Demo
      title="Reactive & Readonly"
      apis="reactive, shallowReactive, readonly, toRaw"
      code={`const state = reactive({ x: 0, y: 0 })
const shallow = shallowReactive({ label: "hello" })
const frozen = readonly({ secret: 42 })

// toRaw unwraps reactive proxy
toRaw(state) // original plain object

// readonly throws on mutation
try { frozen.secret = 0 } catch (e) { ... }`}
    >
      <p>
        reactive: x=<strong>{() => state.x}</strong>, y=<strong>{() => state.y}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => state.x++}>
          x++
        </button>
        <button type="button" onClick={() => state.y++}>
          y++
        </button>
      </div>
      <p>
        shallowReactive: <strong>{() => shallow.label}</strong>
      </p>
      <button type="button" onClick={() => (shallow.label = `updated ${Date.now()}`)}>
        Update label
      </button>
      <p>
        readonly.secret: <strong>{() => frozen.secret}</strong>
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            ;(frozen as { secret: number }).secret = 0
          } catch (e) {
            errorMsg.value = (e as Error).message
          }
        }}
      >
        Try mutate readonly
      </button>
      <p class="muted">{() => (errorMsg.value ? `Error: ${errorMsg.value}` : "")}</p>
      <p class="muted">
        toRaw(state) === state: <strong>{() => String(toRaw(state) !== state)}</strong> (unwraps
        proxy)
      </p>
    </Demo>
  )
}

// ─── 4. toRef & toRefs ───────────────────────────────────────────────────────

function ToRefDemo() {
  const state = reactive({ width: 100, height: 200 })
  const widthRef = toRef(state, "width")
  const { height } = toRefs(state)

  return (
    <Demo
      title="toRef & toRefs"
      apis="toRef, toRefs"
      code={`const state = reactive({ width: 100, height: 200 })
const widthRef = toRef(state, "width")
const { height } = toRefs(state)

// Both stay linked to the reactive object
widthRef.value = 300  // also updates state.width
height.value = 400    // also updates state.height`}
    >
      <p>
        widthRef.value: <strong>{() => widthRef.value}</strong> | state.width:{" "}
        <strong>{() => state.width}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => (widthRef.value += 50)}>
          widthRef += 50
        </button>
        <button type="button" onClick={() => (state.width += 10)}>
          state.width += 10
        </button>
      </div>
      <p>
        height.value: <strong>{() => height.value}</strong> | state.height:{" "}
        <strong>{() => state.height}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => (height.value += 50)}>
          height += 50
        </button>
        <button type="button" onClick={() => (state.height += 10)}>
          state.height += 10
        </button>
      </div>
    </Demo>
  )
}

// ─── 5. Watch ────────────────────────────────────────────────────────────────

function WatchDemo() {
  const source = ref(0)
  const log = ref("")

  watch(source, (newVal, oldVal) => {
    log.value = `changed: ${oldVal} → ${newVal}`
  })

  return (
    <Demo
      title="Watch"
      apis="watch"
      code={`const source = ref(0)
const log = ref("")

watch(source, (newVal, oldVal) => {
  log.value = \`changed: \${oldVal} → \${newVal}\`
})`}
    >
      <p>
        source: <strong>{() => source.value}</strong>
      </p>
      <button type="button" onClick={() => source.value++}>
        Increment
      </button>
      <p class="muted">
        watch log: <strong>{() => log.value || "(no changes yet)"}</strong>
      </p>
    </Demo>
  )
}

// ─── 6. WatchEffect ─────────────────────────────────────────────────────────

function WatchEffectDemo() {
  const x = ref(1)
  const y = ref(1)
  const effectLog = ref("running...")

  const stop = watchEffect(() => {
    effectLog.value = `x + y = ${x.value + y.value}`
  })

  const stopped = ref(false)

  return (
    <Demo
      title="WatchEffect"
      apis="watchEffect"
      code={`const x = ref(1), y = ref(1)
const effectLog = ref("running...")

const stop = watchEffect(() => {
  effectLog.value = \`x + y = \${x.value + y.value}\`
})

stop() // dispose the effect`}
    >
      <p>
        x: <strong>{() => x.value}</strong> | y: <strong>{() => y.value}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => x.value++}>
          x++
        </button>
        <button type="button" onClick={() => y.value++}>
          y++
        </button>
        <button
          type="button"
          onClick={() => {
            stop()
            stopped.value = true
          }}
        >
          Stop effect
        </button>
      </div>
      <p class="muted">
        effect: <strong>{() => effectLog.value}</strong>
        {() => (stopped.value ? " (stopped)" : "")}
      </p>
    </Demo>
  )
}

// ─── 7. Lifecycle Hooks ──────────────────────────────────────────────────────

function LifecycleDemo() {
  const visible = ref(true)
  const log = ref("")
  // Defer signal writes out of the reactive tracking scope to avoid
  // infinite mount/unmount cycles (hooks fire inside an effect)
  let logStr = ""
  function appendLog(msg: string) {
    logStr += msg
    queueMicrotask(() => {
      log.value = logStr
    })
  }

  function LifecycleChild() {
    onBeforeMount(() => {
      appendLog("[beforeMount] ")
    })
    onMounted(() => {
      appendLog("[mounted] ")
    })
    onUpdated(() => {
      appendLog("[updated] ")
    })
    onBeforeUnmount(() => {
      appendLog("[beforeUnmount] ")
    })
    onUnmounted(() => {
      appendLog("[unmounted] ")
    })
    return <p class="highlight">Child is mounted</p>
  }

  return (
    <Demo
      title="Lifecycle Hooks"
      apis="onMounted, onUnmounted, onUpdated, onBeforeMount, onBeforeUnmount"
      code={`onBeforeMount(() => log += "[beforeMount] ")
onMounted(() => log += "[mounted] ")
onUpdated(() => log += "[updated] ")
onBeforeUnmount(() => log += "[beforeUnmount] ")
onUnmounted(() => log += "[unmounted] ")`}
    >
      <div class="row">
        <button type="button" onClick={() => (visible.value = !visible.value)}>
          {() => (visible.value ? "Unmount child" : "Mount child")}
        </button>
        <button
          type="button"
          onClick={() => {
            logStr = ""
            log.value = ""
          }}
        >
          Clear log
        </button>
      </div>
      {() => (visible.value ? <LifecycleChild /> : null)}
      <p class="muted">
        log: <strong>{() => log.value || "(none)"}</strong>
      </p>
    </Demo>
  )
}

// ─── 8. NextTick ─────────────────────────────────────────────────────────────

function NextTickDemo() {
  const count = ref(0)
  const message = ref("Click to test nextTick")

  return (
    <Demo
      title="NextTick"
      apis="nextTick"
      code={`const count = ref(0)
count.value = 42
await nextTick()
// DOM is now updated`}
    >
      <p>
        count: <strong>{() => count.value}</strong>
      </p>
      <button
        type="button"
        onClick={async () => {
          count.value = count.value + 1
          message.value = "waiting for nextTick..."
          await nextTick()
          message.value = `nextTick resolved after count = ${count.value}`
        }}
      >
        Increment + nextTick
      </button>
      <p class="muted">{() => message.value}</p>
    </Demo>
  )
}

// ─── 9. Provide / Inject ─────────────────────────────────────────────────────

const THEME_KEY = Symbol("theme")

function ThemeProvider(props: { children?: any }) {
  const theme = ref("dark")
  provide(THEME_KEY, theme)
  return (
    <>
      <div class="row">
        <button type="button" onClick={() => (theme.value = "dark")}>
          Dark
        </button>
        <button type="button" onClick={() => (theme.value = "light")}>
          Light
        </button>
        <button type="button" onClick={() => (theme.value = "auto")}>
          Auto
        </button>
      </div>
      {props.children}
    </>
  )
}

function ThemeConsumer() {
  const theme = inject<{ value: string }>(THEME_KEY)
  return (
    <p>
      Injected theme: <strong>{() => (theme ? theme.value : "none")}</strong>
    </p>
  )
}

function ProvideInjectDemo() {
  return (
    <Demo
      title="Provide / Inject"
      apis="provide, inject"
      code={`const THEME_KEY = Symbol("theme")

// Parent
const theme = ref("dark")
provide(THEME_KEY, theme)

// Descendant
const theme = inject(THEME_KEY)
theme.value // "dark"`}
    >
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    </Demo>
  )
}

// ─── 10. defineComponent ─────────────────────────────────────────────────────

const Greeting = defineComponent({
  name: "Greeting",
  setup(props: { name: string }) {
    const exclaim = ref(false)
    return () => (
      <p>
        Hello, <strong>{() => props.name}</strong>
        {() => (exclaim.value ? "!" : ".")}
        <button
          type="button"
          onClick={() => (exclaim.value = !exclaim.value)}
          style="margin-left: 8px"
        >
          Toggle !
        </button>
      </p>
    )
  },
})

function DefineComponentDemo() {
  const name = ref("World")

  return (
    <Demo
      title="defineComponent"
      apis="defineComponent"
      code={`const Greeting = defineComponent({
  name: "Greeting",
  setup(props: { name: string }) {
    const exclaim = ref(false)
    return () => (
      <p>Hello, {props.name}{exclaim.value ? "!" : "."}</p>
    )
  },
})`}
    >
      <Greeting name={name.value} />
      <div class="row">
        <button type="button" onClick={() => (name.value = "Pyreon")}>
          name = "Pyreon"
        </button>
        <button type="button" onClick={() => (name.value = "Vue")}>
          name = "Vue"
        </button>
      </div>
    </Demo>
  )
}

// ─── 11. h & Fragment ────────────────────────────────────────────────────────

function HFragmentDemo() {
  const items = ref(["one", "two", "three"])

  return (
    <Demo
      title="h() & Fragment"
      apis="h, Fragment"
      code={`// h() — manual VNode creation
h("p", null, "Created with h()")

// Fragment — group without wrapper
h(Fragment, null,
  h("span", null, "A"),
  h("span", null, "B"),
)`}
    >
      {h("p", null, "This paragraph was created with ", h("strong", null, "h()"))}
      {h(
        Fragment,
        null,
        h("p", { class: "muted" }, "Fragment child 1"),
        h("p", { class: "muted" }, "Fragment child 2"),
      )}
      <p>
        Items: <strong>{() => items.value.join(", ")}</strong>
      </p>
      <button
        type="button"
        onClick={() => (items.value = [...items.value, `item-${items.value.length + 1}`])}
      >
        Add item
      </button>
    </Demo>
  )
}

// ─── 12. Batch ───────────────────────────────────────────────────────────────

function BatchDemo() {
  const a = ref(0)
  const b = ref(0)
  const renderCount = ref(0)

  watchEffect(() => {
    // Access both to track
    void a.value
    void b.value
    renderCount.value = renderCount.value + 1
  })

  return (
    <Demo
      title="Batch"
      apis="batch"
      code={`const a = ref(0), b = ref(0)

// Without batch: 2 updates
a.value++; b.value++

// With batch: 1 update
batch(() => {
  a.value++
  b.value++
})`}
    >
      <p>
        a: <strong>{() => a.value}</strong> | b: <strong>{() => b.value}</strong> | effects ran:{" "}
        <strong>{() => renderCount.value}</strong>
      </p>
      <div class="row">
        <button
          type="button"
          onClick={() => {
            a.value++
            b.value++
          }}
        >
          Increment separately
        </button>
        <button
          type="button"
          onClick={() => {
            batch(() => {
              a.value++
              b.value++
            })
          }}
        >
          Increment batched
        </button>
      </div>
    </Demo>
  )
}

// ─── 13. createApp ───────────────────────────────────────────────────────────

function CreateAppDemo() {
  const mounted = ref(false)
  const unmountFn = ref<(() => void) | null>(null)

  function MiniApp() {
    return <p class="highlight">Mini app mounted via createApp!</p>
  }

  return (
    <Demo
      title="createApp"
      apis="createApp"
      code={`const app = createApp(MyComponent)
const unmount = app.mount("#target")
unmount() // cleanup`}
    >
      <div id="mini-app-target" style="min-height: 24px" />
      <div class="row">
        <button
          type="button"
          onClick={() => {
            if (!mounted.value) {
              const el = document.getElementById("mini-app-target")
              if (el) {
                const un = createApp(MiniApp).mount(el)
                unmountFn.value = un
                mounted.value = true
              }
            }
          }}
        >
          Mount mini app
        </button>
        <button
          type="button"
          onClick={() => {
            if (unmountFn.value) {
              unmountFn.value()
              unmountFn.value = null
              mounted.value = false
            }
          }}
        >
          Unmount
        </button>
      </div>
      <p class="muted">{() => (mounted.value ? "Mini app is mounted" : "Not mounted")}</p>
    </Demo>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <header>
        <h1>Pyreon — Vue Compat</h1>
        <p class="subtitle">
          Vue 3 Composition API running on Pyreon's fine-grained reactive engine
        </p>
        <p class="api-count">{ALL_APIS.length} APIs demonstrated</p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          {ALL_APIS.map((api) => (
            <span class="tag">{api}</span>
          ))}
        </div>
      </nav>

      <RefDemo />
      <ComputedDemo />
      <ReactiveDemo />
      <ToRefDemo />
      <WatchDemo />
      <WatchEffectDemo />
      <LifecycleDemo />
      <NextTickDemo />
      <ProvideInjectDemo />
      <DefineComponentDemo />
      <HFragmentDemo />
      <BatchDemo />
      <CreateAppDemo />

      <footer>
        Built with @pyreon/vue-compat — all {ALL_APIS.length} APIs from a single import
      </footer>
    </>
  )
}

import { inject, provide, ref } from "@pyreon/vue-compat"
import Demo from "./Demo"

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

export default function ProvideInjectDemo() {
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

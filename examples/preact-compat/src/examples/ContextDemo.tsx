import { createContext, useContext } from "@pyreon/preact-compat"
import { useState } from "@pyreon/preact-compat/hooks"
import Demo from "./Demo"

const ThemeCtx = createContext<() => string>(() => "dark")

function ThemeConsumer() {
  const theme = useContext(ThemeCtx)
  return (
    <p>
      Current theme: <strong>{() => theme()}</strong>
    </p>
  )
}

export default function ContextDemo() {
  const [theme, setTheme] = useState("dark")

  return (
    <Demo
      title="Context"
      apis="createContext, useContext"
      code={`const ThemeCtx = createContext<() => string>(() => "dark")

// Provider — pass the signal getter
<ThemeCtx.Provider value={theme}>
  <ThemeConsumer />
</ThemeCtx.Provider>

// Consumer
const theme = useContext(ThemeCtx)
theme() // read the value`}
    >
      <ThemeCtx.Provider value={theme}>
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

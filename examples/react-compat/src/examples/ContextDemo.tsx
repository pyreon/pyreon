import { createContext, useContext } from "react"
import Demo from "./Demo"

const ThemeContext = createContext<"light" | "dark">("light")

function ThemeDisplay() {
  const theme = useContext(ThemeContext)
  return (
    <span>
      Theme: <strong>{theme}</strong>
    </span>
  )
}

export default function ContextDemo() {
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

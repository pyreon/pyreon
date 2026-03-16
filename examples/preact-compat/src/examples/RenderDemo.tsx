import { render } from "@pyreon/preact-compat"
import { useState } from "@pyreon/preact-compat/hooks"
import Demo from "./Demo"

export default function RenderDemo() {
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

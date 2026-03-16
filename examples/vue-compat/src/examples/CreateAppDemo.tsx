import { createApp, ref } from "@pyreon/vue-compat"
import Demo from "./Demo"

export default function CreateAppDemo() {
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

import { nextTick, ref } from "vue"
import Demo from "./Demo"

export default function NextTickDemo() {
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
        count: <strong>{count.value}</strong>
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
      <p class="muted">{message.value}</p>
    </Demo>
  )
}

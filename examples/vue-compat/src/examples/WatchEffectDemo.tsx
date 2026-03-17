import { ref, watchEffect } from "vue"
import Demo from "./Demo"

export default function WatchEffectDemo() {
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
        x: <strong>{x.value}</strong> | y: <strong>{y.value}</strong>
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
        effect: <strong>{effectLog.value}</strong>
        {stopped.value ? " (stopped)" : ""}
      </p>
    </Demo>
  )
}

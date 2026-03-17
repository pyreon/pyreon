import { batch, ref, watchEffect } from "vue"
import Demo from "./Demo"

export default function BatchDemo() {
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
        a: <strong>{a.value}</strong> | b: <strong>{b.value}</strong> | effects ran:{" "}
        <strong>{renderCount.value}</strong>
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

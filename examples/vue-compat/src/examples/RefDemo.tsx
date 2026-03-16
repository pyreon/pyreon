import { isRef, ref, shallowRef, triggerRef, unref } from "@pyreon/vue-compat"
import Demo from "./Demo"

export default function RefDemo() {
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

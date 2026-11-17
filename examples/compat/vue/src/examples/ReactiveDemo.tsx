import { reactive, readonly, ref, shallowReactive, toRaw } from 'vue'
import Demo from './Demo'

export default function ReactiveDemo() {
  const state = reactive({ x: 0, y: 0 })
  const shallow = shallowReactive({ label: 'hello' })
  const frozen = readonly({ secret: 42 })
  const errorMsg = ref('')

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
        reactive: x=<strong>{state.x}</strong>, y=<strong>{state.y}</strong>
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
        shallowReactive: <strong>{shallow.label}</strong>
      </p>
      <button type="button" onClick={() => (shallow.label = `updated ${Date.now()}`)}>
        Update label
      </button>
      <p>
        readonly.secret: <strong>{frozen.secret}</strong>
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
      <p class="muted">{errorMsg.value ? `Error: ${errorMsg.value}` : ''}</p>
      <p class="muted">
        toRaw(state) === state: <strong>{String(toRaw(state) !== state)}</strong> (unwraps proxy)
      </p>
    </Demo>
  )
}

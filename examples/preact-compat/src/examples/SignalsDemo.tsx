import { batch, computed, effect, signal } from '@preact/signals'
import { useState } from 'preact/hooks'
import Demo from './Demo'

export default function SignalsDemo() {
  const count = signal(0)
  const doubled = computed(() => count.value * 2)
  const [effectLog, setEffectLog] = useState('waiting...')

  const dispose = effect(() => {
    const c = count.value
    queueMicrotask(() => {
      setEffectLog(`effect: count = ${c}`)
    })
  })

  const [disposed, setDisposed] = useState(false)

  return (
    <Demo
      title="Signals"
      apis="signal, computed, effect, batch"
      code={`import { signal, computed, effect, batch }
  from "@preact/signals"

const count = signal(0)
const doubled = computed(() => count.value * 2)

const dispose = effect(() => {
  console.log(count.value)
})

batch(() => {
  count.value++
  count.value++
}) // single notification`}
    >
      <p>
        signal: <strong>{count.value}</strong> | computed doubled: <strong>{doubled.value}</strong>
      </p>
      <p>
        peek (untracked): <strong>{count.peek()}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => count.value++}>
          count++
        </button>
        <button
          type="button"
          onClick={() => {
            batch(() => {
              count.value++
              count.value++
            })
          }}
        >
          batch +2
        </button>
        <button
          type="button"
          onClick={() => {
            dispose()
            setDisposed(true)
          }}
        >
          Dispose effect
        </button>
      </div>
      <p class="muted">
        {effectLog}
        {disposed ? ' (disposed)' : ''}
      </p>
    </Demo>
  )
}

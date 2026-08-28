'use plain'
import { state, effect } from '@pyreon/core/plain'
import { count, double, bump } from './store'

export const effectLog: Array<number | string> = []

let ready = state(false)
export const finish = () => {
  ready = true
}

effect(() => {
  // Conditional read — total tracking keeps the subscription alive from run 1.
  if (count > 0) effectLog.push(double)
  else effectLog.push('idle')
})

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li class="row">
      {label}: {value}
    </li>
  )
}

export function App() {
  if (!ready) return <p class="loading">loading…</p>
  return (
    <div>
      <button id="bump" onClick={bump}>
        {count}
      </button>
      <ul>
        <Row label="double" value={double} />
      </ul>
    </div>
  )
}

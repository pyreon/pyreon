import { state } from '@pyreon/core/plain'
import { onMount } from '@pyreon/core'

export default function IdleClock() {
  let now = state(new Date().toLocaleTimeString())
  onMount(() => {
    const id = setInterval(() => { now = new Date().toLocaleTimeString() }, 1000)
    return () => clearInterval(id)
  })
  return (
    <div data-testid="idle-clock" style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;">
      <strong>Idle clock:</strong> <span data-testid="idle-clock-time">{now}</span>
    </div>
  )
}

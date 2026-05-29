import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'

export default function IdleClock() {
  const now = signal(new Date().toLocaleTimeString())
  onMount(() => {
    const id = setInterval(() => now.set(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  })
  return (
    <div
      data-testid="idle-clock"
      style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;"
    >
      <strong>Idle clock:</strong> <span data-testid="idle-clock-time">{now()}</span>
    </div>
  )
}

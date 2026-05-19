import { readable } from 'svelte'
import Demo from './Demo'

const time = readable(new Date().toLocaleTimeString(), (set) => {
  const id = setInterval(() => set(new Date().toLocaleTimeString()), 1000)
  return () => clearInterval(id) // stop notifier — runs at 1→0 subscribers
})

export default function ReadableDemo() {
  let now = ''
  time.subscribe((v) => (now = v))

  return (
    <Demo
      title="Readable (start/stop notifier)"
      apis="readable"
      code={`readable(initial, (set) => {
  const id = setInterval(() => set(now()), 1000)
  return () => clearInterval(id)
})`}
    >
      <p>
        Tick: <strong>{now}</strong>
      </p>
      <p class="muted">start runs at 0→1 subscriber, stop at 1→0.</p>
    </Demo>
  )
}

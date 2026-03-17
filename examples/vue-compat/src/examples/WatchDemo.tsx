import { ref, watch } from "vue"
import Demo from "./Demo"

export default function WatchDemo() {
  const source = ref(0)
  const log = ref("")

  watch(source, (newVal, oldVal) => {
    log.value = `changed: ${oldVal} → ${newVal}`
  })

  return (
    <Demo
      title="Watch"
      apis="watch"
      code={`const source = ref(0)
const log = ref("")

watch(source, (newVal, oldVal) => {
  log.value = \`changed: \${oldVal} → \${newVal}\`
})`}
    >
      <p>
        source: <strong>{source.value}</strong>
      </p>
      <button type="button" onClick={() => source.value++}>
        Increment
      </button>
      <p class="muted">
        watch log: <strong>{log.value || "(no changes yet)"}</strong>
      </p>
    </Demo>
  )
}

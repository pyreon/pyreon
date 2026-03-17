import { onBeforeMount, onBeforeUnmount, onMounted, onUnmounted, onUpdated, ref } from "vue"
import Demo from "./Demo"

/**
 * Child component at module scope (stable function reference).
 *
 * Lifecycle hooks accumulate events in a plain variable. Only onMounted
 * triggers a single ref write to display the log. onUpdated uses a guard
 * to avoid infinite re-render loops (writing to a ref inside onUpdated
 * would cause: re-render → onUpdated → write → re-render → …).
 */
function LifecycleChild() {
  const events = ref("(pending)")
  let eventStr = ""
  let updatedOnce = false

  onBeforeMount(() => {
    eventStr += "[beforeMount] "
  })
  onMounted(() => {
    eventStr += "[mounted] "
    events.value = eventStr
  })
  onUpdated(() => {
    if (!updatedOnce) {
      updatedOnce = true
      eventStr += "[updated] "
      queueMicrotask(() => {
        events.value = eventStr
      })
    }
  })
  onBeforeUnmount(() => {
    eventStr += "[beforeUnmount] "
  })
  onUnmounted(() => {
    eventStr += "[unmounted] "
  })

  return (
    <>
      <p class="highlight">Child is mounted</p>
      <p class="muted">
        events: <strong>{events.value}</strong>
      </p>
    </>
  )
}

export default function LifecycleDemo() {
  const visible = ref(true)

  return (
    <Demo
      title="Lifecycle Hooks"
      apis="onMounted, onUnmounted, onUpdated, onBeforeMount, onBeforeUnmount"
      code={`onBeforeMount(() => log += "[beforeMount] ")
onMounted(() => log += "[mounted] ")
onUpdated(() => log += "[updated] ")
onBeforeUnmount(() => log += "[beforeUnmount] ")
onUnmounted(() => log += "[unmounted] ")`}
    >
      <div class="row">
        <button type="button" onClick={() => (visible.value = !visible.value)}>
          {visible.value ? "Unmount child" : "Mount child"}
        </button>
      </div>
      {visible.value ? <LifecycleChild /> : null}
    </Demo>
  )
}

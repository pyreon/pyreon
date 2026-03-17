import { onBeforeMount, onBeforeUnmount, onMounted, onUnmounted, onUpdated, ref } from "vue"
import Demo from "./Demo"

/**
 * Child component defined at module scope so its function reference is stable
 * across parent re-renders. Owns its own log ref to avoid writing to the
 * parent's state from lifecycle hooks (which would cause infinite re-renders
 * in the mountReactive full-unmount/remount model).
 */
function LifecycleChild() {
  const events = ref("")
  let eventStr = ""
  function append(msg: string) {
    eventStr += msg
    queueMicrotask(() => {
      events.value = eventStr
    })
  }

  onBeforeMount(() => append("[beforeMount] "))
  onMounted(() => append("[mounted] "))
  onUpdated(() => append("[updated] "))
  onBeforeUnmount(() => append("[beforeUnmount] "))
  onUnmounted(() => append("[unmounted] "))

  return (
    <>
      <p class="highlight">Child is mounted</p>
      <p class="muted">
        events: <strong>{events.value || "(none)"}</strong>
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

import { onBeforeMount, onBeforeUnmount, onMounted, onUnmounted, onUpdated, ref } from 'vue'
import Demo from './Demo'

/**
 * Child component at module scope (stable function reference).
 *
 * Lifecycle hooks accumulate events synchronously in a plain variable.
 * Only onMounted writes to the ref (one-shot). onUpdated cannot safely
 * write to refs in the re-render model (it fires every re-render, so any
 * ref write → scheduleRerender → re-render → onUpdated → infinite loop).
 */
function LifecycleChild() {
  const events = ref('')
  let eventStr = ''

  onBeforeMount(() => {
    eventStr += '[beforeMount] '
  })
  onMounted(() => {
    eventStr += '[mounted] '
    events.value = eventStr
  })
  onUpdated(() => {
    // Cannot write to refs here — would cause infinite re-render loop.
    // In the re-render model, onUpdated fires on every re-render.
    console.log('[updated]')
  })
  onBeforeUnmount(() => {
    eventStr += '[beforeUnmount] '
  })
  onUnmounted(() => {
    eventStr += '[unmounted] '
  })

  return (
    <>
      <p class="highlight">Child is mounted</p>
      <p class="muted">
        events: <strong>{events.value || '(none)'}</strong>
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
onUpdated(() => console.log("[updated]"))
onBeforeUnmount(() => log += "[beforeUnmount] ")
onUnmounted(() => log += "[unmounted] ")`}
    >
      <div class="row">
        <button type="button" onClick={() => (visible.value = !visible.value)}>
          {visible.value ? 'Unmount child' : 'Mount child'}
        </button>
      </div>
      {visible.value ? <LifecycleChild /> : null}
    </Demo>
  )
}

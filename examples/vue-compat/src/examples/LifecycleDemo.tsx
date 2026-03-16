import {
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  onUpdated,
  ref,
} from "@pyreon/vue-compat"
import Demo from "./Demo"

export default function LifecycleDemo() {
  const visible = ref(true)
  const log = ref("")
  // Defer signal writes out of the reactive tracking scope to avoid
  // infinite mount/unmount cycles (hooks fire inside an effect)
  let logStr = ""
  function appendLog(msg: string) {
    logStr += msg
    queueMicrotask(() => {
      log.value = logStr
    })
  }

  function LifecycleChild() {
    onBeforeMount(() => {
      appendLog("[beforeMount] ")
    })
    onMounted(() => {
      appendLog("[mounted] ")
    })
    onUpdated(() => {
      appendLog("[updated] ")
    })
    onBeforeUnmount(() => {
      appendLog("[beforeUnmount] ")
    })
    onUnmounted(() => {
      appendLog("[unmounted] ")
    })
    return <p class="highlight">Child is mounted</p>
  }

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
          {() => (visible.value ? "Unmount child" : "Mount child")}
        </button>
        <button
          type="button"
          onClick={() => {
            logStr = ""
            log.value = ""
          }}
        >
          Clear log
        </button>
      </div>
      {() => (visible.value ? <LifecycleChild /> : null)}
      <p class="muted">
        log: <strong>{() => log.value || "(none)"}</strong>
      </p>
    </Demo>
  )
}

import { describe, it, expect } from "bun:test"
import {
  ref,
  computed,
  watch,
  watchEffect,
  reactive,
  readonly,
  isRef,
  unref,
  toRefs,
  nextTick,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
} from "../index"
import { mount } from "@pyreon/runtime-dom"

describe("@pyreon/vue-compat", () => {
  // ─── ref ────────────────────────────────────────────────────────────────

  it("ref() creates reactive ref with .value", () => {
    const count = ref(0)
    expect(count.value).toBe(0)
  })

  it("ref().value setter updates value", () => {
    const count = ref(0)
    count.value = 5
    expect(count.value).toBe(5)
  })

  // ─── computed ───────────────────────────────────────────────────────────

  it("computed() derives from ref", () => {
    const count = ref(2)
    const doubled = computed(() => count.value * 2)
    expect(doubled.value).toBe(4)

    count.value = 10
    expect(doubled.value).toBe(20)
  })

  it("computed().value is readonly", () => {
    const c = computed(() => 42)
    expect(() => {
      ;(c as { value: number }).value = 99
    }).toThrow("readonly")
  })

  // ─── watch ──────────────────────────────────────────────────────────────

  it("watch() fires on ref change", () => {
    const count = ref(0)
    const calls: number[] = []

    watch(count, (newVal) => {
      calls.push(newVal)
    })

    count.value = 1
    count.value = 2

    expect(calls).toEqual([1, 2])
  })

  it("watch() provides old and new values", () => {
    const count = ref(10)
    const history: Array<[number, number | undefined]> = []

    watch(count, (newVal, oldVal) => {
      history.push([newVal, oldVal])
    })

    count.value = 20
    count.value = 30

    expect(history).toEqual([
      [20, 10],
      [30, 20],
    ])
  })

  it("watch() with immediate fires synchronously", () => {
    const count = ref(5)
    const calls: Array<[number, number | undefined]> = []

    watch(
      count,
      (newVal, oldVal) => {
        calls.push([newVal, oldVal])
      },
      { immediate: true },
    )

    // immediate call happens before any changes
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0]).toEqual([5, undefined])
  })

  // ─── watchEffect ───────────────────────────────────────────────────────

  it("watchEffect() tracks dependencies", () => {
    const count = ref(0)
    const values: number[] = []

    const stop = watchEffect(() => {
      values.push(count.value)
    })

    count.value = 1
    count.value = 2

    expect(values).toEqual([0, 1, 2])

    stop()
    count.value = 3
    expect(values).toEqual([0, 1, 2]) // no more tracking
  })

  // ─── reactive ──────────────────────────────────────────────────────────

  it("reactive() creates deep reactive object", () => {
    const state = reactive({ count: 0, nested: { value: "hello" } })
    const values: number[] = []

    watchEffect(() => {
      values.push(state.count)
    })

    state.count = 1
    state.count = 2

    expect(values).toEqual([0, 1, 2])
  })

  // ─── readonly ──────────────────────────────────────────────────────────

  it("readonly() prevents mutations", () => {
    const obj = readonly({ count: 0 })
    expect(obj.count).toBe(0)
    expect(() => {
      ;(obj as { count: number }).count = 5
    }).toThrow("readonly")
  })

  // ─── isRef ─────────────────────────────────────────────────────────────

  it("isRef() detects refs", () => {
    const r = ref(0)
    expect(isRef(r)).toBe(true)
    expect(isRef(0)).toBe(false)
    expect(isRef({ value: 0 })).toBe(false)

    const c = computed(() => 42)
    expect(isRef(c)).toBe(true)
  })

  // ─── unref ─────────────────────────────────────────────────────────────

  it("unref() unwraps refs", () => {
    const r = ref(42)
    expect(unref(r)).toBe(42)
    expect(unref(99)).toBe(99)
  })

  // ─── toRefs ────────────────────────────────────────────────────────────

  it("toRefs() converts reactive to refs", () => {
    const state = reactive({ a: 1, b: "hello" })
    const refs = toRefs(state)

    expect(isRef(refs.a)).toBe(true)
    expect(refs.a.value).toBe(1)
    expect(refs.b.value).toBe("hello")

    // Writing through the ref updates the original
    refs.a.value = 10
    expect(state.a).toBe(10)
  })

  // ─── nextTick ──────────────────────────────────────────────────────────

  it("nextTick() resolves after flush", async () => {
    const count = ref(0)
    count.value = 42
    await nextTick()
    expect(count.value).toBe(42)
  })

  // ─── lifecycle ─────────────────────────────────────────────────────────

  it("onMounted/onUnmounted lifecycle hooks work", () => {
    const mounted: string[] = []
    const unmounted: string[] = []

    const Comp = defineComponent({
      name: "TestComp",
      setup() {
        onMounted(() => { mounted.push("mounted") })
        onUnmounted(() => { unmounted.push("unmounted") })
        return () => h("div", null, "test")
      },
    })

    const container = document.createElement("div")
    const unmount = mount(h(Comp, null), container)

    expect(mounted).toEqual(["mounted"])
    expect(unmounted).toEqual([])

    unmount()
    expect(unmounted).toEqual(["unmounted"])
  })
})

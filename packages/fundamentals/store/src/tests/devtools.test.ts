import { signal } from "@pyreon/reactivity"
import { getRegisteredStores, getStoreById, onStoreChange } from "../devtools"
import { defineStore, resetAllStores } from "../index"

afterEach(() => resetAllStores())

describe("store devtools", () => {
  test("getRegisteredStores returns empty initially", () => {
    expect(getRegisteredStores()).toEqual([])
  })

  test("getRegisteredStores returns store IDs after creation", () => {
    const useCounter = defineStore("counter", () => ({ count: signal(0) }))
    useCounter()
    expect(getRegisteredStores()).toContain("counter")
  })

  test("getStoreById returns the store instance", () => {
    const useCounter = defineStore("counter", () => ({ count: signal(0) }))
    const store = useCounter()
    const retrieved = getStoreById("counter")
    expect(retrieved).toBe(store)
  })

  test("getStoreById returns undefined for non-existent store", () => {
    expect(getStoreById("nope")).toBeUndefined()
  })

  test("onStoreChange fires when a store is created", () => {
    const calls: number[] = []
    const unsub = onStoreChange(() => calls.push(1))

    const useCounter = defineStore("counter", () => ({ count: signal(0) }))
    useCounter()
    expect(calls.length).toBe(1)

    unsub()
  })

  test("onStoreChange fires when a store is reset", () => {
    const useCounter = defineStore("counter", () => ({ count: signal(0) }))
    useCounter()

    const calls: number[] = []
    const unsub = onStoreChange(() => calls.push(1))

    resetAllStores()
    expect(calls.length).toBe(1)

    unsub()
  })

  test("onStoreChange unsubscribe stops notifications", () => {
    const calls: number[] = []
    const unsub = onStoreChange(() => calls.push(1))
    unsub()

    const useCounter = defineStore("counter", () => ({ count: signal(0) }))
    useCounter()
    expect(calls.length).toBe(0)
  })

  test("multiple stores are tracked", () => {
    const useA = defineStore("a", () => ({ val: signal(1) }))
    const useB = defineStore("b", () => ({ val: signal(2) }))
    useA()
    useB()
    expect(getRegisteredStores().sort()).toEqual(["a", "b"])
  })
})

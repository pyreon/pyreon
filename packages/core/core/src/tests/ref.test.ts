import type { Ref, RefCallback, RefProp } from "../ref"
import { createRef } from "../ref"

describe("createRef", () => {
  test("returns object with current = null", () => {
    const ref = createRef()
    expect(ref.current).toBeNull()
  })

  test("current is mutable", () => {
    const ref = createRef<number>()
    ref.current = 42
    expect(ref.current).toBe(42)
  })

  test("typed ref — HTMLElement", () => {
    const ref = createRef<HTMLDivElement>()
    expect(ref.current).toBeNull()
    // In real code, runtime-dom sets this after mount
    ref.current = {} as HTMLDivElement
    expect(ref.current).not.toBeNull()
  })

  test("typed ref — string", () => {
    const ref = createRef<string>()
    ref.current = "hello"
    expect(ref.current).toBe("hello")
  })

  test("can be reset to null", () => {
    const ref = createRef<number>()
    ref.current = 99
    expect(ref.current).toBe(99)
    ref.current = null
    expect(ref.current).toBeNull()
  })

  test("each createRef returns a unique object", () => {
    const ref1 = createRef()
    const ref2 = createRef()
    expect(ref1).not.toBe(ref2)
  })

  test("ref object has exactly one property", () => {
    const ref = createRef()
    expect(Object.keys(ref)).toEqual(["current"])
  })

  test("ref object shape matches Ref interface", () => {
    const ref: Ref<number> = createRef<number>()
    expect("current" in ref).toBe(true)
    expect(ref.current).toBeNull()
  })
})

describe("RefCallback type (type-level verification)", () => {
  test("callback ref can be assigned to RefProp", () => {
    const callback: RefCallback<HTMLElement> = (_el) => {}
    // Type-level test: RefProp accepts both object ref and callback ref
    const prop: RefProp<HTMLElement> = callback
    expect(typeof prop).toBe("function")
  })

  test("object ref can be assigned to RefProp", () => {
    const ref = createRef<HTMLElement>()
    const prop: RefProp<HTMLElement> = ref
    expect(typeof prop).toBe("object")
    expect(prop).toBe(ref)
  })
})

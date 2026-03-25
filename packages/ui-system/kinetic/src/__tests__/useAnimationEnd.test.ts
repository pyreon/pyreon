import { signal } from "@pyreon/reactivity"
import useAnimationEnd from "../useAnimationEnd"

const createMockRef = () => {
  const el = document.createElement("div")
  return { current: el }
}

describe("useAnimationEnd", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("calls onEnd when transitionend fires on the element", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active })

    const event = new Event("transitionend", { bubbles: true })
    Object.defineProperty(event, "target", { value: ref.current })
    ref.current.dispatchEvent(event)

    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("calls onEnd when animationend fires on the element", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active })

    const event = new Event("animationend", { bubbles: true })
    Object.defineProperty(event, "target", { value: ref.current })
    ref.current.dispatchEvent(event)

    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("ignores bubbled events from children", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const child = document.createElement("span")
    ref.current.appendChild(child)
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active })

    const event = new Event("transitionend", { bubbles: true })
    child.dispatchEvent(event)

    expect(onEnd).not.toHaveBeenCalled()
  })

  it("fires timeout fallback when no event fires", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active, timeout: 1000 })

    expect(onEnd).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("uses default timeout of 5000ms", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active })

    vi.advanceTimersByTime(4999)
    expect(onEnd).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("only fires onEnd once even if multiple events fire", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active })

    const event1 = new Event("transitionend", { bubbles: true })
    Object.defineProperty(event1, "target", { value: ref.current })
    ref.current.dispatchEvent(event1)

    const event2 = new Event("animationend", { bubbles: true })
    Object.defineProperty(event2, "target", { value: ref.current })
    ref.current.dispatchEvent(event2)

    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("does not fire when active is false", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(false)

    useAnimationEnd({ ref, onEnd, active, timeout: 100 })

    vi.advanceTimersByTime(200)

    expect(onEnd).not.toHaveBeenCalled()
  })

  it("does not fire when active=true but ref.current is null", () => {
    const onEnd = vi.fn()
    const ref = { current: null } as { current: HTMLElement | null }
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active, timeout: 100 })

    // No timer should be set when ref is null
    vi.advanceTimersByTime(200)

    expect(onEnd).not.toHaveBeenCalled()
  })

  it("does not call onEnd twice when transitionend fires and then timeout fires", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active, timeout: 1000 })

    // First: transitionend fires — calls done()
    const event = new Event("transitionend", { bubbles: true })
    Object.defineProperty(event, "target", { value: ref.current })
    ref.current.dispatchEvent(event)

    expect(onEnd).toHaveBeenCalledTimes(1)

    // Second: timeout fires — should be no-op because called is true
    vi.advanceTimersByTime(1000)

    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("does not call onEnd twice when timeout fires and then transitionend fires", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active, timeout: 500 })

    // First: timeout fires — calls done()
    vi.advanceTimersByTime(500)

    expect(onEnd).toHaveBeenCalledTimes(1)

    // Second: transitionend fires — should be no-op via called guard
    const event = new Event("transitionend", { bubbles: true })
    Object.defineProperty(event, "target", { value: ref.current })
    ref.current.dispatchEvent(event)

    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("resets called when active transitions from true to false", () => {
    const onEnd = vi.fn()
    const ref = createMockRef()
    const active = signal(true)

    useAnimationEnd({ ref, onEnd, active, timeout: 1000 })

    // Fire to set called = true
    const event = new Event("transitionend", { bubbles: true })
    Object.defineProperty(event, "target", { value: ref.current })
    ref.current.dispatchEvent(event)

    expect(onEnd).toHaveBeenCalledTimes(1)

    // Deactivate — resets called
    active.set(false)

    // Re-activate
    active.set(true)

    // Should be able to fire again
    const event2 = new Event("transitionend", { bubbles: true })
    Object.defineProperty(event2, "target", { value: ref.current })
    ref.current.dispatchEvent(event2)

    expect(onEnd).toHaveBeenCalledTimes(2)
  })
})

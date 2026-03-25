import type { VNode } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

let _reducedMotion = false

vi.mock("../useReducedMotion", () => ({
  useReducedMotion: () => () => _reducedMotion,
}))

import TransitionItem from "../kinetic/TransitionItem"

// Mock rAF for deterministic double-rAF testing
let rafCallbacks: (() => void)[] = []
const originalRaf = globalThis.requestAnimationFrame
const originalCaf = globalThis.cancelAnimationFrame

beforeEach(() => {
  vi.useFakeTimers()
  rafCallbacks = []

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: () => void) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }),
  )

  vi.stubGlobal("cancelAnimationFrame", vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.stubGlobal("requestAnimationFrame", originalRaf)
  vi.stubGlobal("cancelAnimationFrame", originalCaf)
})

const flushRaf = () => {
  const cbs = [...rafCallbacks]
  rafCallbacks = []
  for (const cb of cbs) cb()
}

const fireTransitionEnd = (el: HTMLElement) => {
  const event = new Event("transitionend", { bubbles: true })
  Object.defineProperty(event, "target", { value: el })
  el.dispatchEvent(event)
}

/**
 * Recursively finds and invokes all refs in a VNode tree,
 * wiring them to the given element.
 */
const wireRef = (vnode: VNode | null, el: HTMLElement) => {
  if (!vnode) return
  const visitNode = (node: VNode) => {
    const nodeProps = node.props as Record<string, unknown>
    if (typeof nodeProps?.ref === "function") {
      ;(nodeProps.ref as (element: HTMLElement | null) => void)(el)
    } else if (nodeProps?.ref && typeof nodeProps.ref === "object") {
      ;(nodeProps.ref as { current: HTMLElement | null }).current = el
    }
    if (node.children) {
      const ch = Array.isArray(node.children) ? node.children : [node.children]
      for (const c of ch) {
        if (c && typeof c === "object" && "type" in (c as object)) visitNode(c as VNode)
      }
    }
    if (nodeProps?.children) {
      const pc = Array.isArray(nodeProps.children) ? nodeProps.children : [nodeProps.children]
      for (const c of pc) {
        if (c && typeof c === "object" && "type" in (c as object)) visitNode(c as VNode)
      }
    }
    if (
      nodeProps?.fallback &&
      typeof nodeProps.fallback === "object" &&
      "type" in (nodeProps.fallback as object)
    ) {
      visitNode(nodeProps.fallback as VNode)
    }
  }
  visitNode(vnode)
}

/**
 * Helper: call TransitionItem and wire a mock element to refs.
 */
const setupTransitionItem = (props: Record<string, unknown>) => {
  const el = document.createElement("div")
  const child: VNode = {
    type: "div",
    props: { "data-testid": "child" },
    children: ["Hello"],
    key: null,
  }

  const vnode = TransitionItem({
    ...props,
    children: child,
  } as any)

  wireRef(vnode, el)

  return { vnode, el }
}

describe("TransitionItem", () => {
  it("returns a VNode when show returns true", () => {
    const show = () => true
    const child: VNode = { type: "div", props: {}, children: ["Hello"], key: null }
    const vnode = TransitionItem({ show, children: child })
    expect(vnode).not.toBeNull()
  })

  it("wraps child in a Show component", () => {
    const show = () => true
    const child: VNode = { type: "div", props: {}, children: ["Hello"], key: null }
    const vnode = TransitionItem({ show, children: child })
    expect(vnode).not.toBeNull()
    expect(typeof vnode?.type).toBe("function")
  })

  it("clones child VNode with merged ref", () => {
    const show = () => true
    const child: VNode = { type: "div", props: {}, children: ["Hello"], key: null }
    const vnode = TransitionItem({ show, children: child })

    // The Show component's children (or fallback) should have a ref prop
    const showProps = vnode?.props as Record<string, unknown>
    const showChildren = showProps?.children as VNode | undefined
    if (showChildren) {
      const childProps = showChildren.props as Record<string, unknown>
      expect(childProps?.ref).toBeDefined()
      expect(typeof childProps?.ref).toBe("function")
    }
  })

  it("fires onEnter callback when entering", () => {
    const show = signal(false)
    const onEnter = vi.fn()

    setupTransitionItem({ show: () => show(), onEnter })

    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it("fires onLeave callback when leaving", () => {
    const show = signal(true)
    const onLeave = vi.fn()

    setupTransitionItem({ show: () => show(), onLeave })

    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it("applies enter classes when entering", () => {
    const show = signal(false)
    const { el } = setupTransitionItem({
      show: () => show(),
      enter: "ti-enter",
      enterFrom: "ti-enter-from",
      enterTo: "ti-enter-to",
    })

    show.set(true)

    expect(el.classList.contains("ti-enter")).toBe(true)
    expect(el.classList.contains("ti-enter-from")).toBe(true)
    expect(el.classList.contains("ti-enter-to")).toBe(false)
  })

  it("swaps enterFrom to enterTo after double rAF", () => {
    const show = signal(false)
    const { el } = setupTransitionItem({
      show: () => show(),
      enter: "ti-enter",
      enterFrom: "ti-enter-from",
      enterTo: "ti-enter-to",
    })

    show.set(true)

    flushRaf()
    flushRaf()

    expect(el.classList.contains("ti-enter")).toBe(true)
    expect(el.classList.contains("ti-enter-from")).toBe(false)
    expect(el.classList.contains("ti-enter-to")).toBe(true)
  })

  it("applies leave classes when leaving", () => {
    const show = signal(true)
    const { el } = setupTransitionItem({
      show: () => show(),
      leave: "ti-leave",
      leaveFrom: "ti-leave-from",
      leaveTo: "ti-leave-to",
    })

    show.set(false)

    expect(el.classList.contains("ti-leave")).toBe(true)
    expect(el.classList.contains("ti-leave-from")).toBe(true)

    flushRaf()
    flushRaf()

    expect(el.classList.contains("ti-leave-from")).toBe(false)
    expect(el.classList.contains("ti-leave-to")).toBe(true)
  })

  it("applies enter style transitions", () => {
    const show = signal(false)
    const { el } = setupTransitionItem({
      show: () => show(),
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
      enterTransition: "opacity 300ms ease",
    })

    show.set(true)

    expect(el.style.opacity).toBe("0")
    expect(el.style.transition).toBe("opacity 300ms ease")

    flushRaf()
    flushRaf()

    expect(el.style.opacity).toBe("1")
  })

  it("applies leave style transitions", () => {
    const show = signal(true)
    const { el } = setupTransitionItem({
      show: () => show(),
      leaveStyle: { opacity: 1 },
      leaveToStyle: { opacity: 0 },
      leaveTransition: "opacity 200ms ease-in",
    })

    show.set(false)

    expect(el.style.opacity).toBe("1")
    expect(el.style.transition).toBe("opacity 200ms ease-in")

    flushRaf()
    flushRaf()

    expect(el.style.opacity).toBe("0")
  })

  it("fires onAfterEnter after transitionend", () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    const { el } = setupTransitionItem({ show: () => show(), onAfterEnter })

    show.set(true)
    expect(onAfterEnter).not.toHaveBeenCalled()

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it("fires onAfterLeave after transitionend", () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()

    const { el } = setupTransitionItem({ show: () => show(), onAfterLeave })

    show.set(false)
    expect(onAfterLeave).not.toHaveBeenCalled()

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it("cleans up enter classes after transitionend", () => {
    const show = signal(false)
    const { el } = setupTransitionItem({
      show: () => show(),
      enter: "ti-enter",
      enterFrom: "ti-enter-from",
      enterTo: "ti-enter-to",
    })

    show.set(true)
    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    // enter class should be removed on entered stage
    expect(el.classList.contains("ti-enter")).toBe(false)
  })

  it("cleans up transition style on entered stage", () => {
    const show = signal(false)
    const { el } = setupTransitionItem({
      show: () => show(),
      enter: "ti-enter",
      enterTransition: "opacity 300ms ease",
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
    })

    show.set(true)
    expect(el.style.transition).toBe("opacity 300ms ease")
    expect(el.classList.contains("ti-enter")).toBe(true)

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    expect(el.style.transition).toBe("")
    expect(el.classList.contains("ti-enter")).toBe(false)
  })

  it("appear=true fires onEnter on initial mount", () => {
    const show = signal(true)
    const onEnter = vi.fn()

    setupTransitionItem({ show: () => show(), appear: true, onEnter })

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it("appear=false does not fire onEnter on initial mount when show is true", () => {
    const show = signal(true)
    const onEnter = vi.fn()

    setupTransitionItem({ show: () => show(), appear: false, onEnter })

    expect(onEnter).not.toHaveBeenCalled()
  })

  it("timeout fallback completes transition when transitionend never fires", () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    setupTransitionItem({ show: () => show(), timeout: 1000, onAfterEnter })

    show.set(true)
    expect(onAfterEnter).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it("unmount=false keeps element with display:none when hidden", () => {
    const show = () => false
    const child: VNode = { type: "div", props: {}, children: ["Hello"], key: null }
    const vnode = TransitionItem({ show, unmount: false, children: child })

    expect(vnode).not.toBeNull()
    // With unmount=false, the fallback should contain a cloned VNode with display:none
    const showProps = vnode?.props as Record<string, unknown>
    if (showProps?.fallback && typeof showProps.fallback === "object") {
      const fallbackNode = showProps.fallback as VNode
      const fallbackProps = fallbackNode.props as Record<string, unknown>
      const style = fallbackProps?.style as Record<string, unknown> | undefined
      expect(style?.display).toBe("none")
    }
  })

  it("unmount=false fallback has a merged ref", () => {
    const show = () => false
    const child: VNode = { type: "div", props: {}, children: ["Hello"], key: null }
    const vnode = TransitionItem({ show, unmount: false, children: child })

    const showProps = vnode?.props as Record<string, unknown>
    if (showProps?.fallback && typeof showProps.fallback === "object") {
      const fallbackNode = showProps.fallback as VNode
      const fallbackProps = fallbackNode.props as Record<string, unknown>
      expect(fallbackProps?.ref).toBeDefined()
      expect(typeof fallbackProps?.ref).toBe("function")
    }
  })

  it("unmount=false merges existing child style with display:none", () => {
    const show = () => false
    const child: VNode = {
      type: "div",
      props: { style: { color: "red", opacity: 1 } },
      children: ["Hello"],
      key: null,
    }
    const vnode = TransitionItem({ show, unmount: false, children: child })

    const showProps = vnode?.props as Record<string, unknown>
    if (showProps?.fallback && typeof showProps.fallback === "object") {
      const fallbackNode = showProps.fallback as VNode
      const fallbackProps = fallbackNode.props as Record<string, unknown>
      const style = fallbackProps?.style as Record<string, unknown> | undefined
      expect(style?.color).toBe("red")
      expect(style?.opacity).toBe(1)
      expect(style?.display).toBe("none")
    }
  })

  it("appear=true applies enter classes on initial mount when show is true", () => {
    const show = signal(true)
    const { el } = setupTransitionItem({
      show: () => show(),
      appear: true,
      enter: "ti-enter",
      enterFrom: "ti-enter-from",
      enterTo: "ti-enter-to",
    })

    // After appear, entering classes should be applied
    expect(el.classList.contains("ti-enter")).toBe(true)
    expect(el.classList.contains("ti-enter-from")).toBe(true)

    flushRaf()
    flushRaf()

    expect(el.classList.contains("ti-enter-from")).toBe(false)
    expect(el.classList.contains("ti-enter-to")).toBe(true)
  })

  it("appear=true completes full enter lifecycle", () => {
    const show = signal(true)
    const onEnter = vi.fn()
    const onAfterEnter = vi.fn()

    const { el } = setupTransitionItem({
      show: () => show(),
      appear: true,
      onEnter,
      onAfterEnter,
      enter: "ti-enter",
    })

    expect(onEnter).toHaveBeenCalledTimes(1)

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    // After entered stage, enter class should be cleaned up
    expect(el.classList.contains("ti-enter")).toBe(false)
    expect(el.style.transition).toBe("")
  })
})

describe("TransitionItem — reduced motion", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rafCallbacks = []
    _reducedMotion = true

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: () => void) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      }),
    )
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.stubGlobal("requestAnimationFrame", originalRaf)
    vi.stubGlobal("cancelAnimationFrame", originalCaf)
    _reducedMotion = false
  })

  it("reduced motion: entering fires onEnter and onAfterEnter immediately", () => {
    const show = signal(false)
    const onEnter = vi.fn()
    const onAfterEnter = vi.fn()

    setupTransitionItem({ show: () => show(), onEnter, onAfterEnter })

    show.set(true)

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it("reduced motion: leaving fires onLeave and onAfterLeave immediately", () => {
    const show = signal(true)
    const onLeave = vi.fn()
    const onAfterLeave = vi.fn()

    setupTransitionItem({ show: () => show(), onLeave, onAfterLeave })

    show.set(false)

    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it("reduced motion: does not apply CSS classes or rAF", () => {
    const show = signal(false)
    const { el } = setupTransitionItem({
      show: () => show(),
      enter: "ti-enter",
      enterFrom: "ti-enter-from",
      enterTo: "ti-enter-to",
    })

    show.set(true)

    // No classes should be applied — reduced motion skips CSS transitions
    expect(el.classList.contains("ti-enter")).toBe(false)
    expect(el.classList.contains("ti-enter-from")).toBe(false)
    expect(rafCallbacks.length).toBe(0)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@pyreon/reactivity", () => {
  const signal = <T>(initial: T) => {
    let value = initial
    const s = (() => value) as (() => T) & {
      set: (v: T) => void
      update: (fn: (c: T) => T) => void
      peek: () => T
      subscribe: (listener: () => void) => () => void
      direct: (updater: () => void) => () => void
      label: string | undefined
      debug: () => { name: string | undefined; value: T; subscriberCount: number }
    }
    s.set = (v: T) => {
      value = v
    }
    s.update = (fn: (c: T) => T) => {
      value = fn(value)
    }
    s.peek = () => value
    s.subscribe = () => () => {
      /* noop */
    }
    s.direct = () => () => {
      /* noop */
    }
    s.label = undefined
    s.debug = () => ({ name: undefined, value, subscriberCount: 0 })
    return s
  }

  return { signal }
})

vi.mock("@pyreon/core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    onMount: vi.fn(),
    onUnmount: vi.fn(),
    Portal: actual.Fragment,
  }
})

vi.mock("@pyreon/ui-core", async () => {
  const throttle = <F extends (...args: any[]) => any>(fn: F, _delay: number) => {
    const wrapped = (...args: any[]) => fn(...args)
    wrapped.cancel = () => {
      /* no-op */
    }
    return wrapped as F & { cancel: () => void }
  }

  return { render: vi.fn(), throttle }
})

vi.mock("@pyreon/unistyle", () => ({
  value: (v: unknown, _base?: number) => (typeof v === "number" ? `${v}px` : v),
}))

const mockSetBlocked = vi.fn()
const mockSetUnblocked = vi.fn()

vi.mock("../Overlay/context", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    useOverlayContext: () => ({
      setBlocked: mockSetBlocked,
      setUnblocked: mockSetUnblocked,
    }),
  }
})

vi.mock("~/utils", () => ({
  IS_DEVELOPMENT: false,
}))

import { useOverlay } from "../Overlay"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockElement = (rect: Partial<DOMRect> = {}): HTMLElement => {
  const el = document.createElement("div")
  el.getBoundingClientRect = () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => {},
    ...rect,
  })
  return el
}

// Set viewport dimensions for position tests
const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true })
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  setViewport(1024, 768)
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useOverlay", () => {
  // =========================================================================
  // 1. Default state
  // =========================================================================
  describe("default state", () => {
    it("active is false by default", () => {
      const o = useOverlay()
      expect(o.active()).toBe(false)
    })

    it("align defaults to bottom", () => {
      const o = useOverlay()
      expect(o.align).toBe("bottom")
    })

    it("alignX defaults to left", () => {
      const o = useOverlay()
      expect(o.alignX()).toBe("left")
    })

    it("alignY defaults to bottom", () => {
      const o = useOverlay()
      expect(o.alignY()).toBe("bottom")
    })

    it("blocked is false by default", () => {
      const o = useOverlay()
      expect(o.blocked()).toBe(false)
    })
  })

  // =========================================================================
  // 2. isOpen=true
  // =========================================================================
  describe("isOpen=true", () => {
    it("active starts true when isOpen is true", () => {
      const o = useOverlay({ isOpen: true })
      expect(o.active()).toBe(true)
    })
  })

  // =========================================================================
  // 3. Disabled state
  // =========================================================================
  describe("disabled", () => {
    it("forces active to false when disabled is true", () => {
      const o = useOverlay({ isOpen: true, disabled: true })
      expect(o.active()).toBe(false)
    })

    it("prevents event handling when disabled", () => {
      const onOpen = vi.fn()
      const o = useOverlay({ openOn: "click", disabled: true, onOpen })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: triggerEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      expect(onOpen).not.toHaveBeenCalled()
      cleanup()
    })
  })

  // =========================================================================
  // 4. triggerRef / contentRef
  // =========================================================================
  describe("triggerRef and contentRef", () => {
    it("triggerRef is a callable function", () => {
      const o = useOverlay()
      expect(typeof o.triggerRef).toBe("function")
    })

    it("contentRef is a callable function", () => {
      const o = useOverlay()
      expect(typeof o.contentRef).toBe("function")
    })

    it("triggerRef accepts an HTMLElement", () => {
      const o = useOverlay()
      const el = mockElement()
      expect(() => o.triggerRef(el)).not.toThrow()
    })

    it("contentRef accepts an HTMLElement", () => {
      const o = useOverlay()
      const el = mockElement()
      expect(() => o.contentRef(el)).not.toThrow()
    })

    it("triggerRef accepts null", () => {
      const o = useOverlay()
      expect(() => o.triggerRef(null)).not.toThrow()
    })

    it("contentRef accepts null", () => {
      const o = useOverlay()
      expect(() => o.contentRef(null)).not.toThrow()
    })
  })

  // =========================================================================
  // 5. showContent / hideContent
  // =========================================================================
  describe("showContent / hideContent", () => {
    it("showContent sets active to true", () => {
      const o = useOverlay()
      o.showContent()
      expect(o.active()).toBe(true)
    })

    it("hideContent sets active to false", () => {
      const o = useOverlay({ isOpen: true })
      o.hideContent()
      expect(o.active()).toBe(false)
    })

    it("showContent calls onOpen callback", () => {
      const onOpen = vi.fn()
      const o = useOverlay({ onOpen })
      o.showContent()
      expect(onOpen).toHaveBeenCalledOnce()
    })

    it("hideContent calls onClose callback", () => {
      const onClose = vi.fn()
      const o = useOverlay({ isOpen: true, onClose })
      o.hideContent()
      expect(onClose).toHaveBeenCalledOnce()
    })

    it("showContent calls ctx.setBlocked", () => {
      const o = useOverlay()
      o.showContent()
      expect(mockSetBlocked).toHaveBeenCalledOnce()
    })

    it("hideContent calls ctx.setUnblocked", () => {
      const o = useOverlay({ isOpen: true })
      o.hideContent()
      expect(mockSetUnblocked).toHaveBeenCalledOnce()
    })

    it("toggle between show and hide works", () => {
      const o = useOverlay()
      o.showContent()
      expect(o.active()).toBe(true)
      o.hideContent()
      expect(o.active()).toBe(false)
      o.showContent()
      expect(o.active()).toBe(true)
    })
  })

  // =========================================================================
  // 6. Blocked state
  // =========================================================================
  describe("blocked state", () => {
    it("setBlocked increments blocked count", () => {
      const o = useOverlay()
      o.setBlocked()
      expect(o.blocked()).toBe(true)
    })

    it("setUnblocked decrements blocked count", () => {
      const o = useOverlay()
      o.setBlocked()
      o.setUnblocked()
      expect(o.blocked()).toBe(false)
    })

    it("multiple setBlocked calls require matching setUnblocked calls", () => {
      const o = useOverlay()
      o.setBlocked()
      o.setBlocked()
      o.setUnblocked()
      expect(o.blocked()).toBe(true)
      o.setUnblocked()
      expect(o.blocked()).toBe(false)
    })

    it("setUnblocked does not go below zero", () => {
      const o = useOverlay()
      o.setUnblocked()
      o.setUnblocked()
      expect(o.blocked()).toBe(false)
    })

    it("blocked overlay ignores click events", () => {
      const onOpen = vi.fn()
      const o = useOverlay({ openOn: "click", onOpen })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      // Block the overlay
      o.setBlocked()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: triggerEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      expect(onOpen).not.toHaveBeenCalled()
      cleanup()
    })
  })

  // =========================================================================
  // 7. setupListeners
  // =========================================================================
  describe("setupListeners", () => {
    it("returns a cleanup function", () => {
      const o = useOverlay()
      const cleanup = o.setupListeners()
      expect(typeof cleanup).toBe("function")
      cleanup()
    })

    it("cleanup removes event listeners without error", () => {
      const o = useOverlay()
      const cleanup = o.setupListeners()
      expect(() => cleanup()).not.toThrow()
    })

    it("cleanup can be called multiple times safely", () => {
      const o = useOverlay()
      const cleanup = o.setupListeners()
      cleanup()
      expect(() => cleanup()).not.toThrow()
    })
  })

  // =========================================================================
  // 8. Click handling
  // =========================================================================
  describe("click handling", () => {
    it("openOn=click: clicking trigger when inactive opens overlay", () => {
      const o = useOverlay({ openOn: "click" })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: triggerEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(true)
      cleanup()
    })

    it("openOn=click: clicking non-trigger when inactive does not open", () => {
      const o = useOverlay({ openOn: "click" })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const outsideEl = document.createElement("div")
      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: outsideEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      cleanup()
    })

    it("closeOn=click: any click when active closes overlay", () => {
      const o = useOverlay({ openOn: "click", closeOn: "click", isOpen: true })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const outsideEl = document.createElement("div")
      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: outsideEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      cleanup()
    })

    it("closeOn=clickOnTrigger: clicking trigger when active closes overlay", () => {
      const o = useOverlay({ openOn: "click", closeOn: "clickOnTrigger", isOpen: true })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: triggerEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      cleanup()
    })

    it("closeOn=clickOnTrigger: clicking outside does not close overlay", () => {
      const o = useOverlay({ openOn: "click", closeOn: "clickOnTrigger", isOpen: true })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const outsideEl = document.createElement("div")
      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: outsideEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(true)
      cleanup()
    })

    it("closeOn=clickOutsideContent: click outside content closes overlay", () => {
      const o = useOverlay({ openOn: "click", closeOn: "clickOutsideContent", isOpen: true })
      const triggerEl = mockElement()
      const contentEl = mockElement()
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()

      const outsideEl = document.createElement("div")
      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: outsideEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      cleanup()
    })

    it("closeOn=clickOutsideContent: click inside content does not close overlay", () => {
      const o = useOverlay({ openOn: "click", closeOn: "clickOutsideContent", isOpen: true })
      const triggerEl = mockElement()
      const contentEl = mockElement()
      const childEl = document.createElement("span")
      contentEl.appendChild(childEl)
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: childEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(true)
      cleanup()
    })

    it("click on trigger child element opens overlay (contains check)", () => {
      const o = useOverlay({ openOn: "click" })
      const triggerEl = mockElement()
      const innerEl = document.createElement("span")
      triggerEl.appendChild(innerEl)
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: innerEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(true)
      cleanup()
    })
  })

  // =========================================================================
  // 9. ESC handling
  // =========================================================================
  describe("ESC handling", () => {
    it("closeOnEsc=true: Escape key when active closes overlay", () => {
      const o = useOverlay({ closeOnEsc: true, isOpen: true })
      const cleanup = o.setupListeners()

      const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      window.dispatchEvent(esc)

      expect(o.active()).toBe(false)
      cleanup()
    })

    it("closeOnEsc=true: Escape key when inactive does nothing", () => {
      const onClose = vi.fn()
      const o = useOverlay({ closeOnEsc: true, onClose })
      const cleanup = o.setupListeners()

      const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      window.dispatchEvent(esc)

      expect(o.active()).toBe(false)
      expect(onClose).not.toHaveBeenCalled()
      cleanup()
    })

    it("closeOnEsc=false: Escape key does not close overlay", () => {
      const o = useOverlay({ closeOnEsc: false, isOpen: true })
      const cleanup = o.setupListeners()

      const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      window.dispatchEvent(esc)

      expect(o.active()).toBe(true)
      cleanup()
    })

    it("closeOnEsc: Escape does not close when blocked", () => {
      const o = useOverlay({ closeOnEsc: true, isOpen: true })
      const cleanup = o.setupListeners()
      o.setBlocked()

      const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      window.dispatchEvent(esc)

      expect(o.active()).toBe(true)
      cleanup()
    })

    it("non-Escape key does not close overlay", () => {
      const o = useOverlay({ closeOnEsc: true, isOpen: true })
      const cleanup = o.setupListeners()

      const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      window.dispatchEvent(enter)

      expect(o.active()).toBe(true)
      cleanup()
    })
  })

  // =========================================================================
  // 10. Hover handling
  // =========================================================================
  describe("hover handling", () => {
    it("openOn=hover: mouseenter on trigger opens overlay", () => {
      const o = useOverlay({ openOn: "hover", closeOn: "hover" })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))

      expect(o.active()).toBe(true)
      cleanup()
    })

    it("closeOn=hover: mouseleave from trigger schedules hide with hoverDelay", () => {
      const o = useOverlay({ openOn: "hover", closeOn: "hover", hoverDelay: 100 })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      // Open first
      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      expect(o.active()).toBe(true)

      // Leave trigger
      triggerEl.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))
      // Should still be active (delay not elapsed)
      expect(o.active()).toBe(true)

      // Advance timer
      vi.advanceTimersByTime(100)
      expect(o.active()).toBe(false)
      cleanup()
    })

    it("mouseenter on content cancels hide timeout", () => {
      const o = useOverlay({ openOn: "hover", closeOn: "hover", hoverDelay: 100 })
      const triggerEl = mockElement()
      const contentEl = mockElement()
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()

      // Open
      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      expect(o.active()).toBe(true)

      // Leave trigger (starts hide timer)
      triggerEl.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))

      // Enter content (cancels hide timer)
      contentEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))

      // Advance past delay
      vi.advanceTimersByTime(200)
      expect(o.active()).toBe(true)
      cleanup()
    })

    it("mouseleave from content schedules hide", () => {
      const o = useOverlay({ openOn: "hover", closeOn: "hover", hoverDelay: 50 })
      const triggerEl = mockElement()
      const contentEl = mockElement()
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()

      // Open
      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      expect(o.active()).toBe(true)

      // Leave content
      contentEl.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))
      vi.advanceTimersByTime(50)
      expect(o.active()).toBe(false)
      cleanup()
    })

    it("hover: scroll event closes overlay when closeOn=hover and active", () => {
      const o = useOverlay({ openOn: "hover", closeOn: "hover" })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      // Open
      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      expect(o.active()).toBe(true)

      // Scroll (should trigger processVisibilityEvent with closeOn=hover + scroll)
      window.dispatchEvent(new Event("scroll"))
      expect(o.active()).toBe(false)
      cleanup()
    })

    it("openOn=hover: mouseenter when already active does not call onOpen again", () => {
      const onOpen = vi.fn()
      const o = useOverlay({ openOn: "hover", closeOn: "hover", onOpen })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      triggerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))

      expect(onOpen).toHaveBeenCalledOnce()
      cleanup()
    })
  })

  // =========================================================================
  // 11. Position calculation (dropdown)
  // =========================================================================
  describe("position calculation - dropdown", () => {
    const setupDropdown = (opts: Parameters<typeof useOverlay>[0] = {}) => {
      const o = useOverlay({
        type: "dropdown",
        align: "bottom",
        alignX: "left",
        isOpen: true,
        ...opts,
      })

      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 200,
        left: 0,
        right: 200,
        width: 200,
        height: 200,
      })

      o.triggerRef(triggerEl)
      o.contentRef(contentEl)

      return { o, triggerEl, contentEl }
    }

    it("bottom align: positions content below trigger", () => {
      const { o, contentEl } = setupDropdown({ align: "bottom", alignX: "left" })

      // Trigger setContentPosition by calling showContent (which sets active)
      // active is already true and contentRef is set, but isContentLoaded is separate
      // contentRef callback sets isContentLoaded

      // After contentRef callback, isContentLoaded is true. We need to trigger position calc.
      // The hook doesn't auto-trigger - it exposes setupListeners. Let's simulate resize.
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // Content should be positioned: top = trigger.bottom + offsetY = 130
      expect(contentEl.style.top).toBe("130px")
      // left = trigger.left + offsetX = 50
      expect(contentEl.style.left).toBe("50px")
      cleanup()
    })

    it("top align: positions content above trigger", () => {
      const { o, contentEl } = setupDropdown({ align: "top", alignX: "left" })
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // top = trigger.top - offsetY - content.height = 100 - 0 - 200 = -100
      // Doesn't fit top (-100 < 0), so falls back to bottom: trigger.bottom + offsetY = 130
      expect(contentEl.style.top).toBe("130px")
      cleanup()
    })

    it("top align with room above: positions content above trigger", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "top",
        alignX: "left",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 400,
        bottom: 430,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 100,
        left: 0,
        right: 200,
        width: 200,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // top = trigger.top - offsetY - content.height = 400 - 0 - 100 = 300
      expect(contentEl.style.top).toBe("300px")
      cleanup()
    })

    it("alignX=right: positions content aligned to right edge", () => {
      const { o, contentEl } = setupDropdown({ align: "bottom", alignX: "right" })
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // right pos = trigger.right - offsetX - content.width = 150 - 0 - 200 = -50
      // fitsRight = -50 >= 0 → false, falls back to leftPos = trigger.left + offsetX = 50
      expect(contentEl.style.left).toBe("50px")
      cleanup()
    })

    it("alignX=center: centers content horizontally under trigger", () => {
      const { o, contentEl } = setupDropdown({ align: "bottom", alignX: "center" })
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // center = trigger.left + (trigger.right - trigger.left) / 2 - content.width / 2
      //        = 50 + (150 - 50) / 2 - 200 / 2 = 50 + 50 - 100 = 0
      // fitsCL = 0 >= 0 → true, fitsCR = 0 + 200 <= 1024 → true
      expect(contentEl.style.left).toBe("0px")
      cleanup()
    })

    it("with offsets: applies offsetX and offsetY", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "bottom",
        alignX: "left",
        offsetX: 10,
        offsetY: 5,
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // top = trigger.bottom + offsetY = 130 + 5 = 135
      expect(contentEl.style.top).toBe("135px")
      // left = trigger.left + offsetX = 50 + 10 = 60
      expect(contentEl.style.left).toBe("60px")
      cleanup()
    })
  })

  // =========================================================================
  // 11b. Position calculation - horizontal dropdown
  // =========================================================================
  describe("position calculation - horizontal dropdown", () => {
    it("align=right: positions content to the right of trigger", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "right",
        alignY: "top",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // rightPos = trigger.right + offsetX = 150 + 0 = 150
      // fitsRight = 150 + 100 <= 1024 → true
      expect(contentEl.style.left).toBe("150px")
      // topPos = trigger.top + offsetY = 100
      // fitsTop = 100 + 100 <= 768 → true
      expect(contentEl.style.top).toBe("100px")
      cleanup()
    })

    it("align=left: positions content to the left of trigger", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "left",
        alignY: "top",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 300,
        right: 400,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // leftPos = trigger.left - offsetX - content.width = 300 - 0 - 100 = 200
      // fitsLeft = 200 >= 0 → true
      expect(contentEl.style.left).toBe("200px")
      cleanup()
    })

    it("align=right, alignY=center: vertically centers content", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "right",
        alignY: "center",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 300,
        bottom: 330,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // center = trigger.top + (trigger.bottom - trigger.top) / 2 - content.height / 2
      //        = 300 + (330 - 300) / 2 - 100 / 2 = 300 + 15 - 50 = 265
      expect(contentEl.style.top).toBe("265px")
      cleanup()
    })

    it("align=right, alignY=bottom: positions from bottom", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "right",
        alignY: "bottom",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 300,
        bottom: 330,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // bottomPos = trigger.bottom - offsetY - content.height = 330 - 0 - 100 = 230
      // fitsBottom = 230 >= 0 → true
      expect(contentEl.style.top).toBe("230px")
      cleanup()
    })
  })

  // =========================================================================
  // 12. Modal positioning
  // =========================================================================
  describe("position calculation - modal", () => {
    it("modal type: centers content by default", () => {
      const o = useOverlay({
        type: "modal",
        alignX: "center",
        alignY: "center",
        isOpen: true,
      })
      const contentEl = mockElement({
        top: 0,
        bottom: 200,
        left: 0,
        right: 300,
        width: 300,
        height: 200,
      })
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // left = innerWidth / 2 - width / 2 = 1024 / 2 - 300 / 2 = 362
      expect(contentEl.style.left).toBe("362px")
      // top = innerHeight / 2 - height / 2 = 768 / 2 - 200 / 2 = 284
      expect(contentEl.style.top).toBe("284px")
      cleanup()
    })

    it("modal type: alignX=left positions left edge", () => {
      const o = useOverlay({
        type: "modal",
        alignX: "left",
        alignY: "top",
        offsetX: 20,
        offsetY: 10,
        isOpen: true,
      })
      const contentEl = mockElement({ width: 300, height: 200 })
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      expect(contentEl.style.left).toBe("20px")
      expect(contentEl.style.top).toBe("10px")
      cleanup()
    })

    it("modal type: alignX=right positions right edge", () => {
      const o = useOverlay({
        type: "modal",
        alignX: "right",
        alignY: "bottom",
        offsetX: 15,
        offsetY: 25,
        isOpen: true,
      })
      const contentEl = mockElement({ width: 300, height: 200 })
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      expect(contentEl.style.right).toBe("15px")
      expect(contentEl.style.bottom).toBe("25px")
      cleanup()
    })

    it("modal type: sets document.body overflow to hidden", () => {
      const o = useOverlay({ type: "modal", isOpen: true })
      const contentEl = mockElement({ width: 300, height: 200 })
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()

      expect(document.body.style.overflow).toBe("hidden")
      cleanup()
      expect(document.body.style.overflow).toBe("")
    })
  })

  // =========================================================================
  // 13. Position - custom type
  // =========================================================================
  describe("position calculation - custom type", () => {
    it("custom type: does not set position styles", () => {
      const o = useOverlay({
        type: "custom",
        isOpen: true,
      })
      const contentEl = mockElement({ width: 100, height: 100 })
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // computePosition returns {} for custom type
      expect(contentEl.style.top).toBe("")
      expect(contentEl.style.left).toBe("")
      cleanup()
    })
  })

  // =========================================================================
  // 14. Alignment signal updates after positioning
  // =========================================================================
  describe("alignment signal updates", () => {
    it("updates alignX signal when position flips horizontally", () => {
      setViewport(200, 768)
      const o = useOverlay({
        type: "dropdown",
        align: "bottom",
        alignX: "left",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      // Content wider than remaining space on the left side
      const contentEl = mockElement({
        width: 200,
        height: 50,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // leftPos = 50 + 0 = 50, fitsLeft = 50 + 200 <= 200 → false
      // rightPos = 150 - 0 - 200 = -50, fitsRight = -50 >= 0 → false
      // Falls back: sel(fitsLeft, leftPos, rightPos) → rightPos = -50
      // resolvedAlignX = sel(fitsLeft, "left", "right") → "right"
      expect(o.alignX()).toBe("right")
      cleanup()
    })

    it("updates alignY signal when vertical position flips to top", () => {
      setViewport(1024, 200)
      const o = useOverlay({
        type: "dropdown",
        align: "bottom",
        alignX: "left",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // bottomPos = 130, fitsBottom = 130 + 100 <= 200 → false
      // useTop = sel(align === "top", fitsTop, !fitsBottom) = sel(false, _, !false) = true
      // resolvedAlignY = "top"
      expect(o.alignY()).toBe("top")
      cleanup()
    })
  })

  // =========================================================================
  // 15. Resize reposition
  // =========================================================================
  describe("resize handling", () => {
    it("recalculates position on window resize", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "bottom",
        alignX: "left",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 100,
        bottom: 130,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        width: 100,
        height: 100,
      })
      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()

      // First resize
      window.dispatchEvent(new Event("resize"))
      expect(contentEl.style.top).toBe("130px")

      // Change trigger position and resize again
      triggerEl.getBoundingClientRect = () => ({
        top: 200,
        bottom: 230,
        left: 50,
        right: 150,
        width: 100,
        height: 30,
        x: 50,
        y: 200,
        toJSON: () => {},
      })
      window.dispatchEvent(new Event("resize"))
      expect(contentEl.style.top).toBe("230px")
      cleanup()
    })
  })

  // =========================================================================
  // 16. Parent container
  // =========================================================================
  describe("parentContainer", () => {
    it("sets overflow hidden on parent when closeOn is not hover", () => {
      const parent = document.createElement("div")
      const o = useOverlay({ parentContainer: parent, closeOn: "click" })
      const cleanup = o.setupListeners()

      expect(parent.style.overflow).toBe("hidden")
      cleanup()
      expect(parent.style.overflow).toBe("")
    })

    it("does not set overflow hidden on parent when closeOn is hover", () => {
      const parent = document.createElement("div")
      const o = useOverlay({ parentContainer: parent, closeOn: "hover", openOn: "hover" })
      const cleanup = o.setupListeners()

      expect(parent.style.overflow).not.toBe("hidden")
      cleanup()
    })
  })

  // =========================================================================
  // 17. Provider
  // =========================================================================
  describe("Provider", () => {
    it("exposes Provider component", () => {
      const o = useOverlay()
      expect(typeof o.Provider).toBe("function")
    })
  })

  // =========================================================================
  // 18. Independent instances
  // =========================================================================
  describe("independent instances", () => {
    it("two useOverlay instances do not share state", () => {
      const o1 = useOverlay()
      const o2 = useOverlay()

      o1.showContent()
      expect(o1.active()).toBe(true)
      expect(o2.active()).toBe(false)

      o2.showContent()
      o1.hideContent()
      expect(o1.active()).toBe(false)
      expect(o2.active()).toBe(true)
    })
  })

  // =========================================================================
  // 19. Manual open/close mode
  // =========================================================================
  describe("manual mode", () => {
    it("openOn=manual: click on trigger does not open", () => {
      const o = useOverlay({ openOn: "manual", closeOn: "manual" })
      const triggerEl = mockElement()
      o.triggerRef(triggerEl)
      const cleanup = o.setupListeners()

      const click = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(click, "target", { value: triggerEl })
      window.dispatchEvent(click)

      expect(o.active()).toBe(false)
      cleanup()
    })

    it("manual mode: only showContent/hideContent toggle state", () => {
      const o = useOverlay({ openOn: "manual", closeOn: "manual" })
      const cleanup = o.setupListeners()

      o.showContent()
      expect(o.active()).toBe(true)

      o.hideContent()
      expect(o.active()).toBe(false)
      cleanup()
    })
  })

  // =========================================================================
  // 20. Position with absolute + ancestor offset
  // =========================================================================
  describe("position absolute with ancestor offset", () => {
    it("adjusts position for offset parent", () => {
      const o = useOverlay({
        type: "dropdown",
        align: "bottom",
        alignX: "left",
        position: "absolute",
        isOpen: true,
      })
      const triggerEl = mockElement({
        top: 200,
        bottom: 230,
        left: 100,
        right: 200,
        width: 100,
        height: 30,
      })
      const contentEl = mockElement({
        width: 100,
        height: 50,
      })

      // Mock offsetParent
      const offsetParent = document.createElement("div")
      offsetParent.getBoundingClientRect = () => ({
        top: 50,
        bottom: 400,
        left: 30,
        right: 500,
        width: 470,
        height: 350,
        x: 30,
        y: 50,
        toJSON: () => {},
      })
      Object.defineProperty(contentEl, "offsetParent", {
        value: offsetParent,
        configurable: true,
      })

      o.triggerRef(triggerEl)
      o.contentRef(contentEl)
      const cleanup = o.setupListeners()
      window.dispatchEvent(new Event("resize"))

      // Without ancestor: top = 230, left = 100
      // Adjusted: top = 230 - 50 = 180, left = 100 - 30 = 70
      expect(contentEl.style.top).toBe("180px")
      expect(contentEl.style.left).toBe("70px")
      cleanup()
    })
  })
})

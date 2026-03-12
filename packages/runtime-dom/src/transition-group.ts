import type { Props, VNode, VNodeChild } from "@pyreon/core"
import { createRef, h, onMount, onUnmount } from "@pyreon/core"
import { effect, runUntracked, signal } from "@pyreon/reactivity"
import { mountChild } from "./mount"

export interface TransitionGroupProps<T = unknown> {
  /** Wrapper element tag. Default: "div" */
  tag?: string
  /** CSS class prefix. Default: "pyreon" */
  name?: string
  /** Animate items on initial mount. Default: false */
  appear?: boolean
  // CSS class overrides
  enterFrom?: string
  enterActive?: string
  enterTo?: string
  leaveFrom?: string
  leaveActive?: string
  leaveTo?: string
  /** Class applied during FLIP move animation. Default: "{name}-move" */
  moveClass?: string
  /** Reactive list source */
  items: () => T[]
  /** Stable key extractor */
  keyFn: (item: T, index: number) => string | number
  /**
   * Render a single DOM-element VNode for each item.
   * Must return a VNode whose `type` is a string (e.g. "div", "li") so
   * the component can inject a ref and read the underlying DOM node.
   */
  render: (item: T, index: number) => VNode
  // Lifecycle callbacks
  onBeforeEnter?: (el: HTMLElement) => void
  onAfterEnter?: (el: HTMLElement) => void
  onBeforeLeave?: (el: HTMLElement) => void
  onAfterLeave?: (el: HTMLElement) => void
}

type ItemEntry = {
  key: string | number
  ref: ReturnType<typeof createRef<HTMLElement>>
  cleanup: () => void
  leaving: boolean
}

/**
 * TransitionGroup — animates a keyed reactive list with CSS enter/leave and
 * FLIP move animations.
 *
 * Class lifecycle:
 *   Enter: {name}-enter-from → {name}-enter-active + {name}-enter-to → cleanup
 *   Leave: {name}-leave-from → {name}-leave-active + {name}-leave-to → item removed
 *   Move:  {name}-move (applied when an item shifts position)
 *
 * @example
 * const items = signal([{ id: 1 }, { id: 2 }])
 *
 * h(TransitionGroup, {
 *   tag: "ul",
 *   name: "list",
 *   items,
 *   keyFn: (item) => item.id,
 *   render: (item) => h("li", { class: "item" }, item.id),
 * })
 *
 * // CSS:
 * // .list-enter-from, .list-leave-to { opacity: 0; transform: translateY(-10px); }
 * // .list-enter-active, .list-leave-active { transition: all 300ms ease; }
 * // .list-move { transition: transform 300ms ease; }
 */
export function TransitionGroup<T = unknown>(props: TransitionGroupProps<T>): VNodeChild {
  const tag = props.tag ?? "div"
  const n = props.name ?? "pyreon"
  const cls = {
    ef: props.enterFrom ?? `${n}-enter-from`,
    ea: props.enterActive ?? `${n}-enter-active`,
    et: props.enterTo ?? `${n}-enter-to`,
    lf: props.leaveFrom ?? `${n}-leave-from`,
    la: props.leaveActive ?? `${n}-leave-active`,
    lt: props.leaveTo ?? `${n}-leave-to`,
    mv: props.moveClass ?? `${n}-move`,
  }

  const containerRef = createRef<HTMLElement>()
  const entries = new Map<string | number, ItemEntry>()
  // Gates the effect until the container element is in the DOM
  const ready = signal(false)
  let firstRun = true

  const applyEnter = (el: HTMLElement) => {
    props.onBeforeEnter?.(el)
    el.classList.remove(cls.lf, cls.la, cls.lt)
    el.classList.add(cls.ef, cls.ea)
    requestAnimationFrame(() => {
      el.classList.remove(cls.ef)
      el.classList.add(cls.et)
      const done = () => {
        el.removeEventListener("transitionend", done)
        el.removeEventListener("animationend", done)
        el.classList.remove(cls.ea, cls.et)
        props.onAfterEnter?.(el)
      }
      el.addEventListener("transitionend", done, { once: true })
      el.addEventListener("animationend", done, { once: true })
    })
  }

  const applyLeave = (el: HTMLElement, onDone: () => void) => {
    props.onBeforeLeave?.(el)
    el.classList.remove(cls.ef, cls.ea, cls.et)
    el.classList.add(cls.lf, cls.la)
    requestAnimationFrame(() => {
      el.classList.remove(cls.lf)
      el.classList.add(cls.lt)
      const done = () => {
        el.removeEventListener("transitionend", done)
        el.removeEventListener("animationend", done)
        el.classList.remove(cls.la, cls.lt)
        props.onAfterLeave?.(el)
        onDone()
      }
      el.addEventListener("transitionend", done, { once: true })
      el.addEventListener("animationend", done, { once: true })
    })
  }

  const e = effect(() => {
    if (!ready()) return
    const container = containerRef.current
    if (!container) return

    const items = props.items()
    const newKeys = new Set(items.map((item, i) => props.keyFn(item, i)))
    const isFirst = firstRun
    firstRun = false

    // 1. Record old positions for FLIP (before any DOM mutations)
    const oldPositions = new Map<string | number, DOMRect>()
    for (const [key, entry] of entries) {
      if (!entry.leaving && entry.ref.current) {
        oldPositions.set(key, entry.ref.current.getBoundingClientRect())
      }
    }

    // 2. Start leave animation for removed items
    for (const [key, entry] of entries) {
      if (!newKeys.has(key) && !entry.leaving) {
        entry.leaving = true
        const el = entry.ref.current
        if (el) {
          applyLeave(el, () => {
            entry.cleanup()
            entries.delete(key)
          })
        } else {
          entry.cleanup()
          entries.delete(key)
        }
      }
    }

    // 3. Mount new items (appended to container; re-ordered in step 4)
    const newEntries: ItemEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as T
      const key = props.keyFn(item, i)
      if (!entries.has(key)) {
        const itemRef = createRef<HTMLElement>()
        // Use runUntracked so item-level signals don't re-trigger this effect
        const rawVNode = runUntracked(() => props.render(item, i))
        // Inject ref only into DOM-element VNodes
        const vnode: VNode =
          typeof rawVNode.type === "string"
            ? { ...rawVNode, props: { ...rawVNode.props, ref: itemRef } as Props }
            : rawVNode
        const cleanup = mountChild(vnode, container, null)
        const entry: ItemEntry = { key, ref: itemRef, cleanup, leaving: false }
        entries.set(key, entry)
        newEntries.push(entry)
      }
    }

    // 4. Re-order all non-leaving elements to match new items order
    //    appendChild on an existing node moves it — no clone needed
    for (let i = 0; i < items.length; i++) {
      const key = props.keyFn(items[i] as T, i)
      const entry = entries.get(key)
      if (!entry || entry.leaving || !entry.ref.current) continue
      container.appendChild(entry.ref.current)
    }

    // 5. Enter animations for new items (skip on first render unless `appear`)
    if (!isFirst || props.appear) {
      for (const entry of newEntries) {
        queueMicrotask(() => {
          if (entry.ref.current) applyEnter(entry.ref.current)
        })
      }
    }

    // 6. FLIP move animations for existing items that shifted position
    if (!isFirst && oldPositions.size > 0) {
      requestAnimationFrame(() => {
        for (const [key, entry] of entries) {
          if (entry.leaving || !entry.ref.current) continue
          const oldPos = oldPositions.get(key)
          if (!oldPos) continue // new item — enter animation handles it
          const newPos = entry.ref.current.getBoundingClientRect()
          const dx = oldPos.left - newPos.left
          const dy = oldPos.top - newPos.top
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
          // Apply inverse transform instantly (no transition), then animate to zero
          const el = entry.ref.current
          el.style.transform = `translate(${dx}px, ${dy}px)`
          el.style.transition = "none"
          requestAnimationFrame(() => {
            el.classList.add(cls.mv)
            el.style.transform = ""
            el.style.transition = ""
            const done = () => {
              el.removeEventListener("transitionend", done)
              el.removeEventListener("animationend", done)
              el.classList.remove(cls.mv)
            }
            el.addEventListener("transitionend", done, { once: true })
            el.addEventListener("animationend", done, { once: true })
          })
        }
      })
    }
  })

  // Fire the effect once the container is in the DOM
  onMount(() => {
    ready.set(true)
    return undefined
  })

  onUnmount(() => {
    e.dispose()
    for (const entry of entries.values()) entry.cleanup()
    entries.clear()
  })

  return h(tag, { ref: containerRef })
}

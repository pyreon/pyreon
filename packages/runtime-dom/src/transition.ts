import type { Props, VNode, VNodeChild } from "@pyreon/core"
import { createRef, Fragment, h, onUnmount } from "@pyreon/core"
import { effect, runUntracked, signal } from "@pyreon/reactivity"

const __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production"

export interface TransitionProps {
  /**
   * CSS class name prefix.
   * "fade" → fade-enter-from, fade-enter-active, fade-enter-to, fade-leave-from, …
   * Default: "pyreon"
   */
  name?: string
  /** Reactive boolean controlling whether the child is shown. */
  show: () => boolean
  /**
   * If true, runs the enter transition on the initial mount (instead of
   * appearing immediately). Default: false.
   */
  appear?: boolean
  // Individual class name overrides (override the prefix-based defaults)
  enterFrom?: string
  enterActive?: string
  enterTo?: string
  leaveFrom?: string
  leaveActive?: string
  leaveTo?: string
  // Lifecycle callbacks
  onBeforeEnter?: (el: HTMLElement) => void
  onAfterEnter?: (el: HTMLElement) => void
  onBeforeLeave?: (el: HTMLElement) => void
  onAfterLeave?: (el: HTMLElement) => void
  /**
   * The single child element to animate.
   * Must be a direct DOM element VNode (not a component) for class injection to work.
   */
  children?: VNodeChild
}

/**
 * Transition — adds CSS enter/leave animation classes to a single child element,
 * controlled by the reactive `show` prop.
 *
 * Class lifecycle:
 *   Enter: {name}-enter-from  → (next frame) → {name}-enter-active + {name}-enter-to → cleanup
 *   Leave: {name}-leave-from  → (next frame) → {name}-leave-active + {name}-leave-to → unmount
 *
 * The child element stays in the DOM during the leave animation and is removed only
 * after the CSS transition / animation completes.
 *
 * @example
 * const visible = signal(false)
 *
 * h(Transition, { name: "fade", show: () => visible() },
 *   h("div", { class: "modal" }, "content")
 * )
 *
 * // CSS:
 * // .fade-enter-from, .fade-leave-to  { opacity: 0; }
 * // .fade-enter-active, .fade-leave-active { transition: opacity 300ms ease; }
 */
export function Transition(props: TransitionProps): VNodeChild {
  const n = props.name ?? "pyreon"
  const cls = {
    ef: props.enterFrom ?? `${n}-enter-from`,
    ea: props.enterActive ?? `${n}-enter-active`,
    et: props.enterTo ?? `${n}-enter-to`,
    lf: props.leaveFrom ?? `${n}-leave-from`,
    la: props.leaveActive ?? `${n}-leave-active`,
    lt: props.leaveTo ?? `${n}-leave-to`,
  }

  // Ref injected into the child element so we can apply/remove classes
  const ref = createRef<HTMLElement>()
  const isMounted = signal(runUntracked<boolean>(props.show))

  // Cancel an in-progress leave when re-entering before the animation ends
  let pendingLeaveCancel: (() => void) | null = null
  let initialized = false

  const applyEnter = (el: HTMLElement) => {
    pendingLeaveCancel?.()
    pendingLeaveCancel = null
    props.onBeforeEnter?.(el)
    el.classList.remove(cls.lf, cls.la, cls.lt)
    el.classList.add(cls.ef, cls.ea)
    requestAnimationFrame(() => {
      el.classList.remove(cls.ef)
      el.classList.add(cls.et)
      const done = () => {
        // Remove both listeners — only one fires, so clean up the other
        el.removeEventListener("transitionend", done)
        el.removeEventListener("animationend", done)
        el.classList.remove(cls.ea, cls.et)
        props.onAfterEnter?.(el)
      }
      el.addEventListener("transitionend", done, { once: true })
      el.addEventListener("animationend", done, { once: true })
    })
  }

  const applyLeave = (el: HTMLElement) => {
    props.onBeforeLeave?.(el)
    el.classList.remove(cls.ef, cls.ea, cls.et)
    el.classList.add(cls.lf, cls.la)
    requestAnimationFrame(() => {
      el.classList.remove(cls.lf)
      el.classList.add(cls.lt)
      const done = () => {
        // Remove both listeners — only one fires, so clean up the other
        el.removeEventListener("transitionend", done)
        el.removeEventListener("animationend", done)
        el.classList.remove(cls.la, cls.lt)
        pendingLeaveCancel = null
        isMounted.set(false)
        props.onAfterLeave?.(el)
      }
      pendingLeaveCancel = () => {
        el.removeEventListener("transitionend", done)
        el.removeEventListener("animationend", done)
        el.classList.remove(cls.lf, cls.la, cls.lt)
      }
      el.addEventListener("transitionend", done, { once: true })
      el.addEventListener("animationend", done, { once: true })
    })
  }

  const handleVisibilityChange = (visible: boolean) => {
    if (visible) {
      if (!isMounted.peek()) isMounted.set(true)
      queueMicrotask(() => applyEnter(ref.current as HTMLElement))
      return
    }
    if (!isMounted.peek()) return
    const el = ref.current
    if (!el) {
      isMounted.set(false)
      return
    }
    applyLeave(el)
  }

  effect(() => {
    const visible = props.show()
    if (!initialized) {
      initialized = true
      if (visible && props.appear) {
        queueMicrotask(() => applyEnter(ref.current as HTMLElement))
      }
      return
    }
    handleVisibilityChange(visible)
  })

  onUnmount(() => {
    pendingLeaveCancel?.()
    pendingLeaveCancel = null
  })

  // Return a reactive getter. Each call clones the child VNode with our injected ref
  // so we can read / write classes on the underlying DOM element.
  const rawChild = props.children
  // Return an empty Fragment (not null) when unmounted so mountChild uses
  // mountReactive instead of the null/primitive text-node fast-path, which
  // cannot later be swapped for a VNode when the element enters.
  const emptyFragment = h(Fragment, null)
  return (() => {
    if (!isMounted()) return emptyFragment
    if (!rawChild || typeof rawChild !== "object" || Array.isArray(rawChild)) {
      return rawChild ?? null
    }
    const vnode = rawChild as VNode
    // Only inject ref into DOM element children — component children need ref forwarding
    if (typeof vnode.type !== "string") {
      if (__DEV__) {
        console.warn(
          "[Pyreon] Transition child is a component. Wrap it in a DOM element for enter/leave animations to work.",
        )
      }
      return vnode
    }
    return { ...vnode, props: { ...vnode.props, ref } as Props }
  }) as unknown as VNode
}

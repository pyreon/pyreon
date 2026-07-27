import type { Props, VNodeChild } from '@pyreon/core'
import { createRef, h, nativeCompat, onMount } from '@pyreon/core'
import { effect, runUntracked } from '@pyreon/reactivity'
import { mountChild } from './mount'

export interface KeepAliveProps extends Props {
  /**
   * Accessor that returns true when this slot's children should be visible.
   * When false, children are CSS-hidden but remain mounted — effects and
   * signals stay alive.
   * Defaults to true (always visible / always mounted).
   */
  active?: () => boolean
  children?: VNodeChild
}

/**
 * KeepAlive — mounts its children once and keeps them alive even when hidden.
 *
 * Unlike conditional rendering (which destroys and recreates component state),
 * KeepAlive CSS-hides the children while preserving all reactive state,
 * scroll position, form values, and in-flight async operations.
 *
 * Children are mounted imperatively on first activation and are never unmounted
 * while the KeepAlive itself is mounted.
 *
 * Multi-slot pattern (one KeepAlive per route):
 * @example
 * h(Fragment, null, [
 *   h(KeepAlive, { active: () => route() === "/a" }, h(RouteA, null)),
 *   h(KeepAlive, { active: () => route() === "/b" }, h(RouteB, null)),
 * ])
 *
 * With JSX:
 * @example
 * <>
 *   <KeepAlive active={() => route() === "/a"}><RouteA /></KeepAlive>
 *   <KeepAlive active={() => route() === "/b"}><RouteB /></KeepAlive>
 * </>
 */
function KeepAlive(props: KeepAliveProps): VNodeChild {
  const containerRef = createRef<HTMLElement>()
  let childCleanup: (() => void) | null = null
  let childMounted = false

  onMount(() => {
    const container = containerRef.current
    if (!container) return

    const e = effect(() => {
      const isActive = props.active?.() ?? true

      if (!childMounted) {
        // Mount children UNTRACKED — child setup must not subscribe this effect.
        // Otherwise an unrelated signal flip re-runs KeepAlive, runCleanup()
        // disposes the children's inner effects (collected as inner effects of
        // this run), and the `if (!childMounted)` guard skips re-mount, leaving
        // the children permanently un-reactive while still rendered.
        childCleanup = runUntracked(() => mountChild(props.children ?? null, container, null))
        childMounted = true
      }

      // Show/hide without unmounting — state is fully preserved
      container.style.display = isActive ? '' : 'none'
    })

    return () => {
      e.dispose()
      childCleanup?.()
    }
  })

  // `display: contents` makes the wrapper transparent to layout
  // (children appear as if directly in the parent flow)
  return h('div', { ref: containerRef, style: 'display: contents' })
}

// Marked native so compat-mode jsx() runtimes skip wrapCompatComponent — this
// component needs Pyreon's setup frame. ASSIGNMENT + /* @__PURE__ */ rather than
// a bare `nativeCompat(X)` statement: inside the built lib's shared chunk a bare
// call is an unremovable side effect that RETAINS the whole component body in
// every consumer bundle that never imports it (~1.5KB gz measured). The PURE
// annotation lets the bundler drop it when the export is unused.
const _KeepAlive = /* @__PURE__ */ nativeCompat(KeepAlive)
export { _KeepAlive as KeepAlive }

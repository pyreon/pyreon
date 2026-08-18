// Web implementation of `<TransitionGroup>` — animate a container's size
// as its content changes.

import { h, onMount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { TransitionGroupProps } from '../types/animation'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

const DEFAULT_DURATION_MS = 300
const DEFAULT_EASING = 'ease-in-out'

/**
 * `<TransitionGroup>` — a container that animates its own size as rows
 * enter and leave the keyed list inside it.
 *
 * Compiles to:
 * - Web (this impl): a wrapper `<div>` whose height is measured with
 *   `ResizeObserver` and transitioned
 * - iOS (via PMTC): `VStack { … }.animation(.default, value: <list>.count)`
 * - Android (via PMTC): `Column(modifier = Modifier.animateContentSize())`
 *
 * Compose's `animateContentSize()` is the closest thing to a definition of
 * this primitive — animate the container's LAYOUT as its content changes —
 * so the web impl measures the content and transitions the outer height
 * rather than trying to animate individual rows. `overflow: hidden` on the
 * outer element is what makes the height animation read as a reveal, and
 * matches the native behaviour of clipping to the animated layout bounds.
 *
 * The height is only ever driven from a measurement, so:
 * - server-rendered / no-JS output has NO inline height and lays out
 *   naturally at the content's own size,
 * - the FIRST measurement is applied without a transition (adopting the
 *   already-correct size must not animate from zero),
 * - a runtime with no `ResizeObserver` degrades to a plain container
 *   rather than pinning a height it can never update.
 *
 * As on native, this takes CHILDREN ONLY. Neither emitter reads any other
 * attribute, so a `duration` / `easing` prop here would be web-only
 * decoration on a primitive whose entire purpose is cross-target parity.
 */
export const TransitionGroup = (props: TransitionGroupProps): VNode => {
  let outer: HTMLElement | null = null
  let content: HTMLElement | null = null

  const outerRef = (node: HTMLElement | null): void => {
    outer = node
  }
  const contentRef = (node: HTMLElement | null): void => {
    content = node
  }

  onMount(() => {
    const box = outer
    const inner = content
    // `ResizeObserver` is absent on the server and in stripped-down
    // runtimes. Degrade to an un-animated container: a height we cannot
    // keep in sync is worse than none.
    if (box === null || inner === null || typeof ResizeObserver === 'undefined') return

    let measured = false
    const sync = (height: number): void => {
      // The first measurement adopts the content's CURRENT size, so it
      // must land without a transition — otherwise every mount animates
      // from 0 to its natural height.
      if (!measured) {
        measured = true
        box.style.height = `${height}px`
        // Longhands only, never the `transition` shorthand: the shorthand
        // resets every longhand it omits (`transition-delay` included) in
        // spec-compliant engines, silently discarding a consumer's own.
        box.style.transitionProperty = 'height'
        box.style.transitionDuration = `${DEFAULT_DURATION_MS}ms`
        box.style.transitionTimingFunction = DEFAULT_EASING
        return
      }
      box.style.height = `${height}px`
    }

    // The observer watches the CONTENT, and the height is written to the
    // OUTER element — so the write can never feed back into a measurement
    // and loop.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      sync(entry.contentRect.height)
    })
    ro.observe(inner)
    return () => {
      ro.disconnect()
    }
  })

  const style: Record<string, string> = { overflow: 'hidden' }

  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      ref: outerRef,
      style: mergePassthroughStyle(style, props.style),
    },
    h('div', { ref: contentRef }, props.children),
  )
}

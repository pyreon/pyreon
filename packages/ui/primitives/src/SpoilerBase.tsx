import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createUniqueId, mergeProps, splitProps } from '@pyreon/core'
import { useControllableState, useElementSize, useReducedMotion } from '@pyreon/hooks'
import { computed, signal } from '@pyreon/reactivity'

export interface SpoilerBaseProps {
  /** Collapsed height in px. Content taller than this gets a toggle. */
  maxHeight?: number
  /**
   * Expand/collapse animation in ms (default 200; `0` disables).
   *
   * The primitive owns this rather than leaving it to a class, because
   * `clipProps` owns the clip element's `style`: a consumer adding their own
   * `style` after the spread would silently override `max-height`/`overflow`
   * and break the component outright. Owning the transition here means there is
   * never a reason to touch that style.
   *
   * Forced to 0 under `prefers-reduced-motion: reduce` (WCAG 2.3.3).
   */
  transitionDuration?: number
  /** Expanded state (controlled). */
  expanded?: boolean
  /** Default expanded state (uncontrolled). */
  defaultExpanded?: boolean
  /** Called when the expanded state changes. */
  onExpandedChange?: (expanded: boolean) => void
  /** Render function. */
  children?: (state: SpoilerState) => VNodeChild
  [key: string]: unknown
}

export interface SpoilerState {
  /** Whether the spoiler is expanded. */
  expanded: () => boolean
  /** Expand. */
  expand: () => void
  /** Collapse. */
  collapse: () => void
  /** Toggle. */
  toggle: () => void
  /**
   * Whether the content actually OVERFLOWS `maxHeight` — i.e. whether a toggle
   * is needed at all. Render the control conditionally on this: a spoiler whose
   * content already fits must not offer a "Show more" that does nothing.
   */
  needsToggle: () => boolean
  /** The content's natural (unclipped) height in px. */
  contentHeight: () => number
  /** Props for the outer element. Carries the component's class + user props. */
  rootProps: () => Record<string, unknown>
  /**
   * Props for the CLIPPING element. Owns `max-height` + `overflow` — the whole
   * behaviour of the component — as an ACCESSOR-valued style, so expanding
   * re-renders the STYLE rather than the subtree.
   *
   * This must be a SEPARATE element from both the root and the content:
   *  - the root cannot clip, or it would also clip the toggle control;
   *  - the content cannot clip, or its measured height would be the CLIPPED
   *    height and the overflow could never be detected (see contentProps).
   */
  clipProps: () => Record<string, unknown>
  /**
   * Props for the inner content element. This element is NOT clipped, which is
   * what makes it measurable: `ResizeObserver` reports `contentRect`, so
   * observing the clipped element would report `maxHeight` forever and
   * `needsToggle` would always be false.
   */
  contentProps: () => Record<string, unknown>
  /** Props for the toggle control. Pair with your own label. */
  toggleProps: () => Record<string, unknown>
}

/**
 * SpoilerBase — a truncate-with-"show more" disclosure.
 *
 * NOT an AccordionBase: an accordion HIDES its content and keys expansion by
 * `value` across a set of items with arrow-key navigation between triggers. A
 * spoiler always shows a TRUNCATED PREVIEW of one region and only offers a
 * toggle when the content actually overflows — a threshold an accordion has no
 * concept of. The only overlap is `aria-expanded`/`aria-controls`, which is a
 * few lines and not worth the coupling.
 *
 * Measurement rides `useElementSize` (@pyreon/hooks) rather than a hand-rolled
 * ResizeObserver, so the observer lifecycle is owned by the hook.
 *
 * ```tsx
 * <Spoiler maxHeight={80}>
 *   {(s) => (
 *     <div {...s.rootProps()}>
 *       <div {...s.clipProps()}>
 *         <div {...s.contentProps()}>{longContent}</div>
 *       </div>
 *       {() => s.needsToggle() && (
 *         <button {...s.toggleProps()}>{s.expanded() ? 'Hide' : 'Show more'}</button>
 *       )}
 *     </div>
 *   )}
 * </Spoiler>
 * ```
 */
export const SpoilerBase: ComponentFn<SpoilerBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'maxHeight',
    'transitionDuration',
    'expanded',
    'defaultExpanded',
    'onExpandedChange',
    'children',
  ])

  const [expanded, setExpanded] = useControllableState<boolean>({
    value: () => own.expanded,
    defaultValue: own.defaultExpanded ?? false,
    onChange: own.onExpandedChange,
  })

  const contentId = `${createUniqueId()}-spoiler-content`
  const contentEl = signal<HTMLElement | null>(null)
  const size = useElementSize(() => contentEl())

  const prefersReducedMotion = useReducedMotion()
  const maxHeight = (): number => own.maxHeight ?? 100
  const duration = (): number => (prefersReducedMotion() ? 0 : own.transitionDuration ?? 200)
  const contentHeight = computed(() => size().height)
  // A 1px tolerance: sub-pixel layout rounding otherwise reports a 100.4px
  // content as overflowing a 100px cap and shows a toggle that does nothing.
  const needsToggle = computed(() => contentHeight() - maxHeight() > 1)

  return (() => {
    const state: SpoilerState = {
      expanded,
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
      toggle: () => setExpanded(!expanded()),
      needsToggle,
      contentHeight,
      // mergeProps (descriptor-safe) so a getter-shaped reactive prop from the
      // component layer is not frozen; forwarding `rest` is what carries the
      // rocketstyle class onto a real element (a primitive that drops `rest`
      // renders its component UNSTYLED).
      rootProps: () => mergeProps(rest as Record<string, unknown>, {
        'data-spoiler': '',
        'data-expanded': () => (expanded() ? '' : undefined),
      } as Record<string, unknown>),
      clipProps: () => ({
        // ACCESSOR-valued: expanding re-renders this STYLE, not the subtree.
        // Expanded pins max-height to the MEASURED height rather than `none`,
        // so a CSS transition on max-height can actually animate (there is no
        // interpolation to `none`).
        style: () =>
          `overflow: hidden; max-height: ${expanded() ? contentHeight() : maxHeight()}px;` +
          (duration() > 0 ? ` transition: max-height ${duration()}ms ease;` : ''),
      }),
      contentProps: () => ({
        id: contentId,
        ref: (el: HTMLElement | null) => contentEl.set(el),
      }),
      toggleProps: () => ({
        // A bare <button> in a form submits it without this.
        type: 'button' as const,
        onClick: () => setExpanded(!expanded()),
        // Accessors: these ride a one-time spread, so a value would freeze.
        'aria-expanded': () => (expanded() ? 'true' : 'false'),
        'aria-controls': contentId,
      }),
    }

    if (typeof own.children === 'function') {
      return (own.children as (state: SpoilerState) => VNodeChild)(state)
    }
    return null
  })()
}

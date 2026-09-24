import { h, mergeProps, splitProps } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

export interface VisuallyHiddenProps {
  /** Element tag to render (default `'span'`). Use a block tag where inline
   *  flow would be wrong (e.g. `'div'` inside a list). */
  as?: string
  children?: VNodeChild
  /** Any other props (id, class, aria-*, ...) are forwarded to the element. */
  [key: string]: unknown
}

// The canonical "visually hidden but screen-reader accessible" rule set.
// Clipped to a 1px box and pulled out of flow so it never affects layout,
// but kept in the accessibility tree (unlike `display:none` / `hidden`).
const SR_ONLY: Record<string, string> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
}

/**
 * Render content that is invisible on screen but available to screen readers.
 *
 * Use it for labels, headings, and status text that sighted users get from
 * visual context but assistive-tech users need spelled out — e.g. a "Search"
 * label on an icon-only button, or an off-screen `<h2>` that structures a
 * landmark. Unlike `display:none` / `hidden`, the content stays in the
 * accessibility tree.
 *
 * @example
 * ```tsx
 * <button>
 *   <SearchIcon />
 *   <VisuallyHidden>Search</VisuallyHidden>
 * </button>
 * ```
 */
export function VisuallyHidden(props: VisuallyHiddenProps): VNodeChild {
  // splitProps, not a destructure: the compiler passes signal-driven props as
  // getters, and a destructure read each once — a reactive attribute or style
  // on VisuallyHidden froze at its first value. `as` is the element's TAG, a
  // structural choice read once at setup.
  const [own, rest] = splitProps(
    props as VisuallyHiddenProps & { style?: Record<string, string> | string },
    ['as', 'children', 'style'],
  )
  // Merge caller styles AFTER the sr-only base so an explicit override wins,
  // but the clipping defaults still apply for any property the caller omits.
  const style = () => {
    const s = own.style
    return s && typeof s === 'object' ? { ...SR_ONLY, ...s } : SR_ONLY
  }
  return h(own.as ?? 'span', mergeProps(rest as Record<string, unknown>, { style }), own.children)
}

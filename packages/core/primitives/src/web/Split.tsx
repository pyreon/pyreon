// Web implementation of `<Split>` — adaptive list/detail layout.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import type { SplitProps } from '../types/navigation'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * Same 600px breakpoint as `useSizeClass()` and the native targets. Below it
 * exactly one pane is displayed; `display:none` takes the other out of the
 * accessibility tree as well, which is what a pushed screen does natively.
 */
const SPLIT_CSS =
  '.pyreon-split{display:flex;flex-direction:column;min-height:0;min-width:0}' +
  '.pyreon-split__sidebar,.pyreon-split__detail{min-width:0;min-height:0;overflow:auto}' +
  '.pyreon-split[data-split-pane="detail"]>.pyreon-split__sidebar{display:none}' +
  '.pyreon-split[data-split-pane="sidebar"]>.pyreon-split__detail{display:none}' +
  '.pyreon-split__back{align-self:flex-start;border:0;background:none;color:inherit;font:inherit;' +
  'padding:8px 12px;cursor:pointer}' +
  '@media (min-width:600px){.pyreon-split{display:grid;grid-template-columns:minmax(220px,320px) 1fr}' +
  '.pyreon-split[data-split-pane]>.pyreon-split__sidebar,.pyreon-split[data-split-pane]>.pyreon-split__detail{display:block}' +
  '.pyreon-split__sidebar{border-right:1px solid rgba(127,127,127,.3)}' +
  '.pyreon-split__back{display:none}}'

/**
 * `<Split>` — list/detail layout that collapses to one pane on a narrow
 * window.
 *
 * Compiles to:
 * - Web (this impl): two columns at 600px+ of viewport width; below it the
 *   sidebar, or (while `showDetail`) the detail with a back button calling
 *   `onBack`.
 * - iOS (via PMTC): `PyreonSplit` → `NavigationSplitView` (regular width) /
 *   a pushed detail on a `NavigationStack` (compact)
 * - Android (via PMTC): `PyreonSplit` → two panes at 600dp+, else one pane
 *   with `BackHandler` calling `onBack`
 *
 * Both panes are always MOUNTED; only their display changes. Collapsing a
 * wide window therefore keeps the list's scroll position and the detail's
 * state, and going "back" on a phone is a display change rather than a
 * rebuild of the list.
 */
export const Split = (props: SplitProps): VNode => {
  const showDetail = (): boolean => {
    const v = props.showDetail
    return typeof v === 'function' ? (v as () => boolean)() : (v as boolean)
  }

  // Moving into the detail on a narrow window hides the element that had
  // focus (the list row the user activated). Native platforms move focus to
  // the pushed screen; here the back button is the first focusable thing in
  // it, so it takes focus — only on a TRANSITION, never on the first render.
  let backEl: HTMLButtonElement | null = null
  let previous: boolean | undefined
  renderEffect(() => {
    const now = showDetail()
    const was = previous
    previous = now
    if (was === undefined || was === now || !now || backEl === null) return
    if (backEl.ownerDocument.defaultView?.matchMedia('(min-width: 600px)').matches === true) return
    // Deferred: this effect runs BEFORE the root's `data-split-pane` binding
    // re-applies, and an element still under `display:none` cannot take
    // focus (real Chromium silently refuses; happy-dom does not model it).
    const el = backEl
    queueMicrotask(() => el.focus())
  })

  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      class: props.class === undefined ? 'pyreon-split' : `pyreon-split ${props.class}`,
      'data-split-pane': () => (showDetail() ? 'detail' : 'sidebar'),
      style: mergePassthroughStyle({}, props.style),
    },
    h('style', null, SPLIT_CSS),
    h('div', { class: 'pyreon-split__sidebar' }, props.sidebar),
    h(
      'div',
      { class: 'pyreon-split__detail' },
      h(
        'button',
        {
          type: 'button',
          class: 'pyreon-split__back',
          ref: (el: HTMLButtonElement | null) => {
            backEl = el
          },
          onClick: () => props.onBack(),
        },
        props.backLabel ?? 'Back',
      ),
      props.children,
    ),
  )
}

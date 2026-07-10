/**
 * Overlay component that renders a trigger element and conditionally shows
 * content via a Portal. The trigger receives a ref and optional show/hide
 * callbacks; the content is positioned and managed by the useOverlay hook.
 * A context Provider wraps the content to support nested overlays (e.g.,
 * a dropdown inside another dropdown) via blocked-state propagation.
 */

import type { VNodeChild } from '@pyreon/core'
// `_rp` MUST be imported under an ALIAS: the real `@pyreon/vite-plugin`
// compiler injects its own `import { _rp } from '@pyreon/core'` into any
// file it transforms (this one, in every dev/build pipeline) — a bare
// `_rp` import collides with the injected one ("Identifier `_rp` has
// already been declared", which broke the ui-showcase dev boot). Same
// class as the compiler's `cx` → `_cx` aliasing rule (anti-patterns
// "alias injected PUBLIC-name imports"); caught by the ui-showcase e2e —
// vitest's esbuild transform never injects, so unit tests can't see it.
import {
  _rp as _reactiveProp,
  createUniqueId,
  isClient,
  nativeCompat,
  onMount,
  Portal,
  splitProps,
} from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import type { Content, PyreonComponent } from '../types'
import useOverlay, { type UseOverlayProps } from './useOverlay'

type Align = 'bottom' | 'top' | 'left' | 'right'
type AlignX = 'left' | 'center' | 'right'
type AlignY = 'bottom' | 'top' | 'center'

type TriggerRenderer = (
  props: Partial<{
    active: boolean
    showContent: () => void
    hideContent: () => void
  }>,
) => VNodeChild

type ContentRenderer = (
  props: Partial<{
    active: boolean
    showContent: () => void
    hideContent: () => void
    align: Align
    alignX: AlignX
    alignY: AlignY
  }>,
) => VNodeChild

export type Props = {
  children: ContentRenderer | Content
  trigger: TriggerRenderer | Content
  DOMLocation?: HTMLElement
  triggerRefName?: string
  contentRefName?: string
} & UseOverlayProps

const Component: PyreonComponent<Props> = (props) => {
  const [own, overlayProps] = splitProps(props, [
    'children',
    'trigger',
    'DOMLocation',
    'triggerRefName',
    'contentRefName',
  ])

  const triggerRefName = own.triggerRefName ?? 'ref'
  const contentRefName = own.contentRefName ?? 'ref'

  const {
    active,
    triggerRef,
    contentRef,
    showContent,
    hideContent,
    align,
    alignX,
    alignY,
    setupListeners,
    Provider,
    ...ctx
  } = useOverlay(overlayProps)

  // LAZY config reads — `overlayProps` is a splitProps rest, so a compiler
  // getter-shaped prop (`type={sig()}` → `_rp()` → getter) survives onto it;
  // a destructure (`const { type } = overlayProps`) would fire the getter
  // once and freeze it. The CONTENT render calls these per open/close cycle
  // (its accessor re-runs), so they stay live there; the TRIGGER render runs
  // once at mount — its prop PRESENCE decisions (aria-haspopup /
  // aria-describedby / showContent-hideContent spread) are mount-time by
  // design (prop presence cannot be reactive).
  const readType = () => overlayProps.type
  const passHandlers = () =>
    overlayProps.openOn === 'manual' ||
    overlayProps.closeOn === 'manual' ||
    overlayProps.closeOn === 'clickOutsideContent'

  const ariaHasPopup = () => {
    switch (readType()) {
      case 'modal':
        return 'dialog' as const
      case 'tooltip':
        // A tooltip is a DESCRIPTION, not an interactive popup — the trigger
        // associates with it via aria-describedby (below), NOT aria-haspopup
        // (which is for menu/listbox/tree/grid/dialog popups). Omit it per the
        // WAI-ARIA Tooltip pattern; emitting both would be contradictory.
        return undefined
      default:
        return 'menu' as const
    }
  }

  // WAI-ARIA Tooltip pattern: the tooltip container has role="tooltip" and the
  // trigger references it via aria-describedby, so a screen reader reads the
  // tip when the trigger is focused. One stable id shared by both (SSR-safe).
  const tooltipId = createUniqueId()

  // Set up event listeners on mount
  onMount(() => {
    const cleanup = setupListeners()
    return cleanup
  })

  return (
    <>
      {
        // The trigger is rendered ONCE (stable element identity — a per-flip
        // re-render would REMOUNT the trigger subtree, destroying the element
        // the focus-restore in useOverlay.hideContent returns focus to, and
        // dropping focus mid-interaction). Reactivity rides on the PROPS
        // instead: `active` / `aria-expanded` are passed as `_rp()`-branded
        // accessors — the exact shape the compiler emits for
        // `active={signal()}` — which `makeReactiveProps` converts to live
        // getters in the mount pipeline. A trigger forwarding them to a DOM
        // element (directly or through Element/rocketstyle, which are
        // descriptor-preserving) gets a reactive binding: `aria-expanded`
        // flips "false" → "true" on open with NO trigger remount. Pre-fix,
        // `active: active()` read the signal at setup and froze both forever
        // (screen readers were told the popup never opens).
        render(own.trigger, {
          [triggerRefName]: triggerRef,
          active: _reactiveProp(() => active()),
          'aria-expanded': _reactiveProp(() => active()),
          'aria-haspopup': ariaHasPopup(),
          'aria-describedby': readType() === 'tooltip' ? tooltipId : undefined,
          ...(passHandlers() ? { showContent, hideContent } : {}),
        })
      }

      {() =>
        isClient && active() ? (
          <Portal target={own.DOMLocation ?? document.body}>
            <Provider {...ctx}>
              {render(own.children, {
                [contentRefName]: contentRef,
                // Inside the accessor these re-read `overlayProps` per
                // open/close cycle — live for getter-shaped config props.
                role:
                  readType() === 'modal'
                    ? 'dialog'
                    : readType() === 'tooltip'
                      ? 'tooltip'
                      : undefined,
                id: readType() === 'tooltip' ? tooltipId : undefined,
                'aria-modal': readType() === 'modal' ? true : undefined,
                active: active(),
                align: align(),
                alignX: alignX(),
                alignY: alignY(),
                ...(passHandlers() ? { showContent, hideContent } : {}),
              })}
            </Provider>
          </Portal>
        ) : null
      }
    </>
  )
}

const name = `${PKG_NAME}/Overlay` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// Overlay's onMount + Portal + useOverlay hook setup run inside Pyreon's
// setup frame.
nativeCompat(Component)

export default Component

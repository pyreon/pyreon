/**
 * Overlay component that renders a trigger element and conditionally shows
 * content via a Portal. The trigger receives a ref and optional show/hide
 * callbacks; the content is positioned and managed by the useOverlay hook.
 * A context Provider wraps the content to support nested overlays (e.g.,
 * a dropdown inside another dropdown) via blocked-state propagation.
 */

import type { VNodeChild } from "@pyreon/core"
import { onMount, Portal } from "@pyreon/core"
import { render } from "@pyreon/ui-core"
import { PKG_NAME } from "../constants"
import type { Content, PyreonComponent } from "../types"
import useOverlay, { type UseOverlayProps } from "./useOverlay"

const IS_BROWSER = typeof window !== "undefined"

type Align = "bottom" | "top" | "left" | "right"
type AlignX = "left" | "center" | "right"
type AlignY = "bottom" | "top" | "center"

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

const Component: PyreonComponent<Props> = ({
  children,
  trigger,
  DOMLocation,
  triggerRefName = "ref",
  contentRefName = "ref",
  ...props
}) => {
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
  } = useOverlay(props)

  const { openOn, closeOn, type } = props

  const passHandlers =
    openOn === "manual" || closeOn === "manual" || closeOn === "clickOutsideContent"

  const ariaHasPopup = (() => {
    switch (type) {
      case "modal":
        return "dialog" as const
      case "tooltip":
        return "true" as const
      default:
        return "menu" as const
    }
  })()

  // Set up event listeners on mount
  onMount(() => {
    const cleanup = setupListeners()
    return cleanup
  })

  return (
    <>
      {render(trigger, {
        [triggerRefName]: triggerRef,
        active: active(),
        "aria-expanded": active(),
        "aria-haspopup": ariaHasPopup,
        ...(passHandlers ? { showContent, hideContent } : {}),
      })}

      {() =>
        IS_BROWSER && active() ? (
          <Portal target={DOMLocation ?? document.body}>
            <Provider {...ctx}>
              {render(children, {
                [contentRefName]: contentRef,
                role: type === "modal" ? "dialog" : undefined,
                "aria-modal": type === "modal" ? true : undefined,
                active: active(),
                align,
                alignX: alignX(),
                alignY: alignY(),
                ...(passHandlers ? { showContent, hideContent } : {}),
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

export default Component

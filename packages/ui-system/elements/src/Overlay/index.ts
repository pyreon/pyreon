import component, { type Props } from "./component"
import OverlayProvider from "./context"
import useOverlay, { type UseOverlayProps } from "./useOverlay"

export type { Props as OverlayProps, UseOverlayProps }

export { component as Overlay, OverlayProvider, useOverlay }

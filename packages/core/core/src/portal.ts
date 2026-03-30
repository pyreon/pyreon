import type { Props, VNode, VNodeChild } from "./types";

/**
 * Symbol used as the VNode type for a Portal — runtime-dom mounts the
 * children into `target` instead of the normal parent.
 */
export const PortalSymbol: unique symbol = Symbol("pyreon.Portal");

export interface PortalProps {
  /** DOM element to render children into (e.g. document.body). */
  target: Element;
  children: VNodeChild;
}

/**
 * Portal — renders `children` into a different DOM node than the
 * current parent tree.
 *
 * Useful for modals, tooltips, dropdowns, and any overlay that needs to
 * escape CSS overflow/stacking context restrictions.
 *
 * @example
 * // Render a modal at document.body level regardless of where in the
 * // component tree <Modal> is used:
 * Portal({ target: document.body, children: h(Modal, { onClose }) })
 *
 * // JSX:
 * <Portal target={document.body}>
 *   <Modal onClose={close} />
 * </Portal>
 */
export function Portal(props: PortalProps): VNode {
  return {
    type: PortalSymbol as unknown as string,
    props: props as unknown as Props,
    children: [],
    key: null,
  };
}

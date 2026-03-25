import type { Configuration } from "../types/configuration"
import type { ComponentFn } from "../types/utils"
import { calculateChainOptions, removeUndefinedProps } from "../utils/attrs"

export type AttrsStyleHOC = ({
  attrs,
  priorityAttrs,
}: Pick<Configuration, "attrs" | "priorityAttrs">) => (
  WrappedComponent: ComponentFn<any>,
) => ComponentFn<any>

/**
 * Creates the core HOC that computes default props from the `.attrs()` chain.
 *
 * This is always the outermost HOC in the compose chain, so it runs first.
 * It resolves both priority and normal attrs callbacks, then merges them
 * with the consumer's explicit props following this precedence:
 *
 *   priorityAttrs < normalAttrs < explicit props  (last wins)
 *
 * In Pyreon, components are plain functions — no forwardRef needed.
 * The ref flows as a normal prop through the chain.
 */
const createAttrsHOC: AttrsStyleHOC = ({ attrs, priorityAttrs }) => {
  // Pre-build the chain reducers once (not per render).
  const calculateAttrs = calculateChainOptions(attrs)
  const calculatePriorityAttrs = calculateChainOptions(priorityAttrs)

  const attrsHoc = (WrappedComponent: ComponentFn<any>) => {
    const HOCComponent: ComponentFn<any> = (props) => {
      // Strip undefined values so they don't shadow defaults from attrs callbacks.
      const filteredProps = removeUndefinedProps(props)

      // 1. Resolve priority attrs (lowest precedence defaults).
      const prioritizedAttrs = calculatePriorityAttrs([filteredProps])
      // 2. Resolve normal attrs — these see priority + explicit props as input.
      const finalAttrs = calculateAttrs([
        {
          ...prioritizedAttrs,
          ...filteredProps,
        },
      ])

      // 3. Merge: priority < normal attrs < explicit props (last wins).
      const finalProps = {
        ...prioritizedAttrs,
        ...finalAttrs,
        ...filteredProps,
      }

      return WrappedComponent(finalProps)
    }

    return HOCComponent
  }

  return attrsHoc
}

export default createAttrsHOC

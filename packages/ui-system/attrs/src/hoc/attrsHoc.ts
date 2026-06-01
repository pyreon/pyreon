import type { Configuration } from '../types/configuration'
import type { ComponentFn } from '../types/utils'
import { calculateChainOptions, mergeDescriptors, removeUndefinedProps } from '../utils/attrs'

export type AttrsStyleHOC = ({
  attrs,
  priorityAttrs,
}: Pick<Configuration, 'attrs' | 'priorityAttrs'>) => (
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
  // Most components never call .attrs() — short-circuit the merge work below
  // so the no-chain mount path skips 2 reducer invocations + 3 object spreads.
  // Mirrors vitus-labs's attrsHoc fast-path; React-side memoization
  // (useMemo / useStableValue) is omitted because Pyreon components run once
  // per mount, not on every render.
  const hasAttrs = (attrs?.length ?? 0) > 0
  const hasPriorityAttrs = (priorityAttrs?.length ?? 0) > 0
  const hasAnyChain = hasAttrs || hasPriorityAttrs

  const attrsHoc = (WrappedComponent: ComponentFn<any>) => {
    const HOCComponent: ComponentFn<any> = (props) => {
      // Strip undefined values so they don't shadow defaults from attrs callbacks.
      const filteredProps = removeUndefinedProps(props)

      // Fast path: no attrs configured — skip reducers + spreads entirely.
      if (!hasAnyChain) return WrappedComponent(filteredProps)

      // 1. Resolve priority attrs (lowest precedence defaults).
      const prioritizedAttrs = hasPriorityAttrs
        ? calculatePriorityAttrs([filteredProps])
        : null
      // 2. Resolve normal attrs — these see priority + explicit props as input.
      //
      // The argument passed INTO `.attrs()` callbacks must preserve getter
      // descriptors on filteredProps, so any callback that reads a reactive
      // prop (e.g. `(p) => ({ x: p.someSignalDrivenProp + 1 })`) reads the
      // live value, not a one-shot snapshot. Plain spread `{ …priority,
      // …filteredProps }` would fire every getter at this site — that was
      // the pre-fix shape that silently broke reactivity for direct
      // `attrs(Component)` consumers.
      const finalAttrs = hasAttrs
        ? calculateAttrs([
            prioritizedAttrs
              ? mergeDescriptors(prioritizedAttrs, filteredProps)
              : filteredProps,
          ])
        : null

      // 3. Merge: priority < normal attrs < explicit props (last wins).
      // `mergeDescriptors` (not spread) so the explicit-props level keeps
      // any getter-shaped reactive props live all the way to the wrapped
      // component. `prioritizedAttrs` and `finalAttrs` always come from
      // freshly-constructed object literals (in user `.attrs()` callbacks),
      // so they carry no getters — descriptor-copy is a no-op cost there.
      const finalProps = mergeDescriptors(prioritizedAttrs, finalAttrs, filteredProps)

      return WrappedComponent(finalProps)
    }

    return HOCComponent
  }

  return attrsHoc
}

export default createAttrsHOC

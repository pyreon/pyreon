import { mergeProps } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { useTheme } from '../hooks'
import type { Configuration } from '../types/configuration'
import type { ComponentFn } from '../types/utils'
import { calculateChainOptions, removeUndefinedProps } from '../utils/attrs'

export type RocketStyleHOC = ({
  inversed,
  attrs,
  priorityAttrs,
}: Pick<Configuration, 'inversed' | 'attrs' | 'priorityAttrs'>) => (
  WrappedComponent: ComponentFn<any>,
) => ComponentFn<any>

/**
 * HOC that resolves the `.attrs()` chain before the inner component renders.
 * Evaluates both regular and priority attrs callbacks with the current theme
 * and mode, then merges the results with explicit props (priority attrs
 * are applied first, regular attrs can be overridden by direct props).
 *
 * In Pyreon, there is no forwardRef — ref flows as a normal prop.
 * Components are plain functions.
 */
const rocketStyleHOC: RocketStyleHOC = ({ inversed, attrs, priorityAttrs }) => {
  const calculateAttrs = calculateChainOptions(attrs)
  const hasAttrs = (attrs?.length ?? 0) > 0
  const hasPriorityAttrs = (priorityAttrs?.length ?? 0) > 0

  const makeCallbackParams = (themeAttrs: ReturnType<typeof useTheme>) => [
    themeAttrs.theme,
    { render, mode: themeAttrs.mode, isDark: themeAttrs.isDark, isLight: themeAttrs.isLight },
  ]

  // Fast path — no `.priorityAttrs()` chain. This is the dominant case in
  // practice (priorityAttrs is unused across the whole component library), so
  // `prioritizedAttrs` would always be `{}`. The full path below would then
  // (a) call `calculatePriorityAttrs` to produce `{}`, (b) run a wasted
  // `mergeProps({}, filteredProps)` — a full descriptor copy of every prop just
  // to merge with `{}` — and (c) pass that empty `{}` as the first arg of the
  // final 3-way merge. The fast path skips all three. `removeUndefinedProps`
  // (load-bearing: strips `undefined` so consumer props don't shadow `.attrs()`
  // defaults) is kept. Variant picked at factory time so render-time work is
  // fixed. Merge precedence is preserved: props win over attrs win over {}.
  if (!hasPriorityAttrs) {
    const Enhanced = (WrappedComponent: ComponentFn<any>) => {
      const HOCComponent: ComponentFn<any> = (props) => {
        const themeAttrs = useTheme({ inversed })
        const filteredProps = removeUndefinedProps(props)
        if (!hasAttrs) {
          // No chain at all — filteredProps IS the final props (the full path
          // would just re-copy them via `mergeProps({}, {}, filteredProps)`).
          return WrappedComponent(filteredProps)
        }
        const finalAttrs = calculateAttrs([filteredProps, ...makeCallbackParams(themeAttrs)])
        return WrappedComponent(mergeProps(finalAttrs, filteredProps))
      }
      return HOCComponent
    }
    return Enhanced
  }

  // Full path — `.priorityAttrs()` present.
  const calculatePriorityAttrs = calculateChainOptions(priorityAttrs)
  const Enhanced = (WrappedComponent: ComponentFn<any>) => {
    const HOCComponent: ComponentFn<any> = (props) => {
      // IMPORTANT: Do NOT destructure — useTheme returns getter properties.
      // Keep the object reference so properties re-evaluate lazily.
      const themeAttrs = useTheme({ inversed })
      const filteredProps = removeUndefinedProps(props)
      const callbackParams = makeCallbackParams(themeAttrs)
      const prioritizedAttrs = calculatePriorityAttrs([filteredProps, ...callbackParams])
      // Merge via canonical `mergeProps` so reactive getter props survive the
      // chain (a `{...A, ...B}` spread would fire every getter and break the
      // reactive subscription downstream). Attrs callbacks legitimately read
      // prop VALUES (`({ href }) => ({ tag: href ? 'a' : 'button' })`) — a
      // one-shot read at setup time by design.
      const finalAttrs = calculateAttrs([
        mergeProps(prioritizedAttrs, filteredProps),
        ...callbackParams,
      ])
      return WrappedComponent(mergeProps(prioritizedAttrs, finalAttrs, filteredProps))
    }
    return HOCComponent
  }
  return Enhanced
}

export default rocketStyleHOC

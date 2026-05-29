import { render } from '@pyreon/ui-core'
import { useTheme } from '../hooks'
import type { Configuration } from '../types/configuration'
import type { ComponentFn } from '../types/utils'
import { calculateChainOptions, mergeDescriptors, removeUndefinedProps } from '../utils/attrs'

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
  const calculatePriorityAttrs = calculateChainOptions(priorityAttrs)

  const Enhanced = (WrappedComponent: ComponentFn<any>) => {
    const HOCComponent: ComponentFn<any> = (props) => {
      // IMPORTANT: Do NOT destructure — useTheme returns getter properties.
      // Destructuring calls getters once and captures static values.
      // Keep the object reference so properties re-evaluate lazily.
      const themeAttrs = useTheme({ inversed })

      // Remove undefined props not to override potential default props
      const filteredProps = removeUndefinedProps(props)

      // Read theme attrs eagerly — .attrs() callbacks run once at mount.
      // Mode-dependent styling is handled reactively by the $rocketstyle
      // accessor in EnhancedComponent, not by re-running attrs.
      const callbackParams = [
        themeAttrs.theme,
        { render, mode: themeAttrs.mode, isDark: themeAttrs.isDark, isLight: themeAttrs.isLight },
      ]

      const prioritizedAttrs = calculatePriorityAttrs([filteredProps, ...callbackParams])

      // Merge via descriptor-copy so reactive getter props on
      // filteredProps survive the chain. A `{...A, ...B}` spread
      // would fire every getter on A and B and store the resolved
      // value, breaking the reactive subscription downstream.
      // Attrs callbacks legitimately read prop VALUES (e.g.
      // `({ href }) => ({ tag: href ? 'a' : 'button' })`) — that's
      // a one-shot read at setup time by design. The pipeline only
      // needs to preserve reactivity for props the callbacks DON'T
      // consume, which the descriptor-merge does.
      const finalAttrs = calculateAttrs([
        mergeDescriptors(prioritizedAttrs, filteredProps),
        ...callbackParams,
      ])

      const finalProps = mergeDescriptors(prioritizedAttrs, finalAttrs, filteredProps)

      return WrappedComponent(finalProps)
    }
    return HOCComponent
  }

  return Enhanced
}

export default rocketStyleHOC

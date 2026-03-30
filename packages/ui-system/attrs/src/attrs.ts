import { compose, hoistNonReactStatics, omit, pick } from '@pyreon/ui-core'
import { attrsHoc } from './hoc'
import type { AttrsComponent as AttrsComponentType } from './types/AttrsComponent'
import type { Configuration, ExtendedConfiguration } from './types/configuration'
import type { InitAttrsComponent } from './types/InitAttrsComponent'
import { calculateChainOptions } from './utils/attrs'
import { chainOptions } from './utils/chaining'
import { calculateHocsFuncs } from './utils/compose'
import { createStaticsEnhancers } from './utils/statics'

/**
 * Clones the current configuration and merges new options, then creates a
 * fresh component. This makes the chaining API immutable — each `.attrs()`
 * / `.config()` / `.statics()` call returns a brand-new component with an
 * updated configuration rather than mutating the existing one.
 */
type CloneAndEnhance = (
  defaultOpts: Configuration,
  opts: Partial<ExtendedConfiguration>,
) => ReturnType<typeof attrsComponent>

const cloneAndEnhance: CloneAndEnhance = (defaultOpts, opts) =>
  attrsComponent({
    ...defaultOpts,
    ...(opts.name ? { name: opts.name } : undefined),
    ...(opts.component ? { component: opts.component } : undefined),
    attrs: chainOptions(opts.attrs, defaultOpts.attrs),
    filterAttrs: [...(defaultOpts.filterAttrs ?? []), ...(opts.filterAttrs ?? [])],
    priorityAttrs: chainOptions(opts.priorityAttrs, defaultOpts.priorityAttrs),
    statics: { ...defaultOpts.statics, ...opts.statics },
    compose: { ...defaultOpts.compose, ...opts.compose },
  } as Parameters<typeof attrsComponent>[0])

/**
 * Core factory that builds an attrs-enhanced Pyreon component.
 *
 * Creates a plain ComponentFn that:
 * 1. Wraps the original with attrsHoc (default props) + user HOCs from `.compose()`.
 * 2. Filters out internal props listed in `filterAttrs`.
 * 3. Attaches `data-attrs` attribute in development for debugging.
 *
 * Then adds chaining methods (`.attrs()`, `.config()`, `.compose()`, `.statics()`)
 * as static properties — each calls `cloneAndEnhance` to produce a new component.
 *
 * In Pyreon, there is no forwardRef — ref flows as a normal prop.
 * Components are plain functions that run once per mount.
 */
const attrsComponent: InitAttrsComponent = (options) => {
  const componentName = options.name ?? options.component.displayName ?? options.component.name

  const RenderComponent = options.component

  // Build the HOC chain: attrsHoc is always first (resolves default props),
  // followed by user-composed HOCs in reverse order (outermost wraps first).
  const hocsFuncs = [attrsHoc(options), ...calculateHocsFuncs(options.compose)]

  // The inner component receives already-computed props from the HOC chain.
  // It handles prop filtering and final rendering.
  const EnhancedComponent = (props: Record<string, any>) => {
    const needsFiltering = options.filterAttrs && options.filterAttrs.length > 0

    const filteredProps = needsFiltering ? omit(props, options.filterAttrs) : props

    const finalProps =
      process.env.NODE_ENV !== 'production'
        ? { ...filteredProps, 'data-attrs': componentName }
        : filteredProps

    return RenderComponent(finalProps)
  }

  // Apply the full HOC chain: compose(attrsHoc, ...userHocs)(EnhancedComponent)
  const AttrsComponent: AttrsComponentType = compose(...hocsFuncs)(EnhancedComponent)

  AttrsComponent.IS_ATTRS = true
  AttrsComponent.displayName = componentName
  AttrsComponent.meta = {}

  // Copy static properties from the original component.
  hoistNonReactStatics(AttrsComponent, options.component)

  // Populate `component.meta` with user-defined statics from `.statics()`.
  createStaticsEnhancers({
    context: AttrsComponent.meta,
    options: options.statics,
  })

  // ─── Chaining Methods ──────────────────────────────────
  // Each method creates a new component via cloneAndEnhance.
  // The original component is never mutated.
  Object.assign(AttrsComponent, {
    attrs: (attrs: any, { priority, filter }: any = {}) => {
      const result: Record<string, any> = {}

      if (filter) {
        result.filterAttrs = filter
      }

      if (priority) {
        result.priorityAttrs = attrs as ExtendedConfiguration['priorityAttrs']

        return cloneAndEnhance(options, result)
      }

      result.attrs = attrs as ExtendedConfiguration['attrs']

      return cloneAndEnhance(options, result)
    },

    config: (opts: any = {}) => {
      const result = pick(opts)

      return cloneAndEnhance(options, result)
    },

    compose: (opts: any) => cloneAndEnhance(options, { compose: opts }),

    statics: (opts: any) => cloneAndEnhance(options, { statics: opts }),

    getDefaultAttrs: (props: any) => calculateChainOptions(options.attrs)([props]),
  })

  return AttrsComponent
}

export default attrsComponent

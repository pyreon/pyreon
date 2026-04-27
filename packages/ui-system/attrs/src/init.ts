import { isEmpty } from '@pyreon/ui-core'
import attrsComponent from './attrs'
import type { InitAttrsComponent } from './types/InitAttrsComponent'
import type { ElementType } from './types/utils'

// Dev-mode gate. `import.meta.env.DEV` is literal-replaced by Vite at build
// time and tree-shakes to zero bytes in prod. The previous
// `process.env.NODE_ENV !== 'production'` form was dead code in real Vite
// browser bundles (Vite does not polyfill `process`).
const __DEV__ = process.env.NODE_ENV !== 'production'

/**
 * Public entry point for creating an attrs-enhanced component.
 *
 * ```tsx
 * const Button = attrs({ name: 'Button', component: Element })
 *   .attrs({ tag: 'button' })
 *   .attrs<{ primary?: boolean }>(({ primary }) => ({
 *     backgroundColor: primary ? 'blue' : 'gray',
 *   }))
 * ```
 */
export type Attrs = <C extends ElementType>({
  name,
  component,
}: {
  name: string
  component: C
}) => ReturnType<InitAttrsComponent<C>>

const attrs: Attrs = ({ name, component }) => {
  // Validate required params in development — fail fast with clear errors.
  if (__DEV__) {
    type Errors = Partial<{
      component: string
      name: string
    }>

    const errors: Errors = {}
    if (!component) {
      errors.component = 'Parameter `component` is missing in params!'
    }

    if (!name) {
      errors.name = 'Parameter `name` is missing in params!'
    }

    if (!isEmpty(errors)) {
      throw Error(JSON.stringify(errors))
    }
  }

  // Bootstrap with empty configuration — all chains start from scratch.
  return attrsComponent({
    name,
    component,
    attrs: [],
    priorityAttrs: [],
    filterAttrs: [],
    compose: {},
    statics: {},
  })
}

export default attrs

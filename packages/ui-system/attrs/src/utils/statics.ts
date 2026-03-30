import { isEmpty } from '@pyreon/ui-core'

/**
 * Copies user-defined statics from `.statics()` into the component's
 * `meta` object. These are accessible at `Component.meta.myStatic`.
 */
type CreateStaticsEnhancers = (params: {
  context: Record<string, any>
  options: Record<string, any>
}) => void

export const createStaticsEnhancers: CreateStaticsEnhancers = ({ context, options }) => {
  if (!isEmpty(options)) {
    Object.assign(context, options)
  }
}

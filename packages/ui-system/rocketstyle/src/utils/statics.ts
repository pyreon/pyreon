import { isEmpty } from "@pyreon/ui-core"
import { STATIC_KEYS } from "../constants"

// --------------------------------------------------------
// helpers for create statics chaining methods on component
// --------------------------------------------------------
/**
 * Attaches chaining static methods (e.g. `.states()`, `.sizes()`, `.theme()`)
 * to a component. Each method calls `cloneAndEnhance` with the corresponding key.
 */
type CreateStaticsChainingEnhancers = <O extends Record<string, any>, DK extends string[]>(props: {
  context: Record<string, any>
  dimensionKeys: DK
  func: (defaultOpts: O, opts: any) => void
  options: O
}) => void

export const createStaticsChainingEnhancers: CreateStaticsChainingEnhancers = ({
  context,
  dimensionKeys,
  func,
  options,
}) => {
  const keys = [...dimensionKeys, ...STATIC_KEYS]

  keys.forEach((item) => {
    context[item] = (props: any) => func(options, { [item]: props })
  })
}

// --------------------------------------------------------
// helpers for create statics on component
// --------------------------------------------------------
/** Copies user-defined static properties onto the component's `meta` object. */
type CreateStaticsEnhancers = (params: {
  context: Record<string, any>
  options: Record<string, any>
}) => void

export const createStaticsEnhancers: CreateStaticsEnhancers = ({ context, options }) => {
  if (!isEmpty(options)) {
    Object.assign(context, options)
  }
}

import { isEmpty } from '@pyreon/ui-core'
import { ALL_RESERVED_KEYS } from './constants'
import defaultDimensions from './constants/defaultDimensions'
import rocketComponent from './rocketstyle'
import type { DefaultDimensions, Dimensions } from './types/dimensions'
import type { RocketComponent } from './types/rocketComponent'
import type { ElementType } from './types/utils'
import {
  getDimensionsValues,
  getKeys,
  getMultipleDimensions,
  getTransformDimensions,
} from './utils/dimensions'

export type Rocketstyle = <
  const D extends Dimensions = DefaultDimensions,
  UB extends boolean = false,
>({
  dimensions,
  useBooleans,
}?: {
  dimensions?: D
  useBooleans?: UB
}) => <C extends ElementType>({
  name,
  component,
}: {
  name: string
  component: C
}) => ReturnType<RocketComponent<C, {}, {}, D, UB>>

/**
 * Factory initializer for rocketstyle components. Validates dimension
 * configurations against reserved keys, then delegates to the core
 * `rocketComponent` builder with pre-computed dimension metadata.
 */
type InitErrors = Partial<{
  component: string
  name: string
  dimensions: string
  invalidDimensions: string
}>

const validateInit = (name: string, component: unknown, dimensions: Dimensions) => {
  const errors: InitErrors = {}

  if (!component) {
    errors.component = 'Parameter `component` is missing in params!'
  }

  if (!name) {
    errors.name = 'Parameter `name` is missing in params!'
  }

  if (isEmpty(dimensions)) {
    errors.dimensions = 'Parameter `dimensions` is missing in params!'
  } else {
    const definedDimensions = getKeys(dimensions)
    const invalidDimension = ALL_RESERVED_KEYS.some((item) =>
      definedDimensions.some((d) => d === item),
    )

    if (invalidDimension) {
      errors.invalidDimensions = `Some of your \`dimensions\` is invalid and uses reserved static keys which are
          ${defaultDimensions.toString()}`
    }
  }

  if (!isEmpty(errors)) {
    throw Error(JSON.stringify(errors))
  }
}

// The impl-level `component: unknown` and `rocketComponent as unknown as ...`
// casts bridge the outer `Rocketstyle` generic contract (5 type-parameters,
// captures `C extends ElementType`) to the internal `rocketComponent`'s
// `Configuration<C, D>` shape. The outer cast on line 93 (`as unknown as
// Rocketstyle`) is the authoritative type; the impl just has to be runtime-
// correct. Previously this used `any` here, which silently exempted these
// call sites from `noImplicitAny` audits — `unknown` is more honest.
const rocketstyle = (({ dimensions = defaultDimensions, useBooleans = false } = {}) =>
  ({ name, component }: { name: string; component: unknown }) => {
    if (process.env.NODE_ENV !== 'production') {
      validateInit(name, component, dimensions)
    }

    return (rocketComponent as unknown as (opts: Record<string, unknown>) => unknown)({
      name,
      component,
      useBooleans,
      dimensions,
      dimensionKeys: getKeys(dimensions),
      dimensionValues: getDimensionsValues(dimensions),
      multiKeys: getMultipleDimensions(dimensions),
      transformKeys: getTransformDimensions(dimensions),
      styled: true,
    })
  }) as unknown as Rocketstyle

export default rocketstyle

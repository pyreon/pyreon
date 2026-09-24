import { isEmpty } from '@pyreon/ui-core'
import { ALL_RESERVED_KEYS } from './constants'
import defaultDimensions from './constants/defaultDimensions'
import rocketComponent from './rocketstyle'
import type { DefaultDimensions, Dimensions } from './types/dimensions'
import type { RocketComponent } from './types/rocketComponent'
import type { ElementType, TObj } from './types/utils'
import {
  getDimensionsValues,
  getKeys,
  getMultipleDimensions,
  getTransformDimensions,
} from './utils/dimensions'

export type Rocketstyle = <
  const D extends Dimensions = DefaultDimensions,
  UB extends boolean = false,
>(
  // A NAMED optional param, not a destructuring pattern. Binding-pattern
  // params in a function TYPE are documentary (the names are unreferenceable),
  // but destructuring an OPTIONAL param (`{ … }?: { … }`) makes some
  // TypeScript builds report `Property 'x' does not exist on type '{ … } |
  // undefined'` — a cross-package typecheck of this src (e.g. `@pyreon/loom`
  // importing rocketstyle) then fails, while rocketstyle's own build may not.
  // The runtime impl below already destructures WITH defaults, so this is a
  // type-only, behaviour-preserving change.
  config?: {
    dimensions?: D
    useBooleans?: UB
  },
) => RocketstyleFactory<D, UB, {}>

/**
 * Normalize a theme shape to an anonymous object type. An `interface` carries no
 * implicit index signature, so `interface Tokens { accent: string }` does not
 * satisfy the `Record<string, unknown>` bound every rocketstyle theme generic
 * uses; the homomorphic mapped copy is structurally identical and does.
 */
export type ThemeShape<T extends object> = { [K in keyof T]: T[K] }

/**
 * The component factory `rocketstyle(config)` returns.
 *
 * `withTheme<Tokens>()` binds the theme type every `.theme()` and dimension
 * callback built from this factory receives — so `t` is typed LOCALLY, with no
 * global `declare module '@pyreon/rocketstyle'` augmentation (which merges into
 * every other consumer's `ThemeDefault` and makes their tokens claim properties
 * that are `undefined` at runtime). Type-only: it returns the same factory.
 *
 * @example
 * interface Tokens { accent: string; surface: string }
 * const rs = rocketstyle({ useBooleans: false }).withTheme<Tokens>()
 * const Box = rs({ name: 'Box', component: Element }).theme((t) => ({
 *   backgroundColor: t.surface, // typed: Tokens
 * }))
 */
export type RocketstyleFactory<
  D extends Dimensions = DefaultDimensions,
  UB extends boolean = false,
  T extends TObj = {},
> = (<C extends ElementType>(config: {
  name: string
  component: C
}) => ReturnType<RocketComponent<C, T, {}, D, UB>>) & {
  withTheme: <NT extends object>() => RocketstyleFactory<D, UB, ThemeShape<NT>>
}

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
const rocketstyle = (({ dimensions = defaultDimensions, useBooleans = false } = {}) => {
  const factory = ({ name, component }: { name: string; component: unknown }) => {
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
  }
  // Type-only channel (see `RocketstyleFactory`): the theme type changes, the
  // factory does not.
  return Object.assign(factory, { withTheme: () => factory })
}) as unknown as Rocketstyle

export default rocketstyle

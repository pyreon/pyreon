import type { config } from '@pyreon/ui-core'
import type { PseudoState } from './pseudo'
import type { TObj } from './utils'

// biome-ignore lint/suspicious/noEmptyInterface: this is an interface to be extended in consuming projects
export interface StylesDefault {}

// biome-ignore lint/correctness/noUnusedVariables: S kept for backward compatibility
export type Styles<S = unknown> = StylesDefault

export type Css = typeof config.css
export type Style = ReturnType<Css>
export type OptionStyles = ((css: Css) => ReturnType<Css>)[]

/**
 * Props available inside `.styles()` interpolation functions.
 *
 * - `$rocketstyle` — reactive theme accessor. Call it to get the resolved theme:
 *   `props.$rocketstyle()` returns the CSS object for the current mode.
 * - `$rocketstate` — active dimension values + pseudo state
 */
export type RocketStyleInterpolationProps<CSS extends TObj = TObj> = {
  /** Reactive theme accessor — call `$rocketstyle()` to resolve the current theme. */
  $rocketstyle: (() => CSS) | CSS
  $rocketstate: Record<string, string | string[]> & {
    pseudo: Partial<PseudoState>
  }
} & Record<string, any>

/**
 * A tagged-template css function whose interpolation functions
 * receive typed props including `$rocketstyle` and `$rocketstate`.
 */
export type RocketCss<CSS extends TObj = TObj> = (
  strings: TemplateStringsArray,
  ...values: Array<
    | string
    | number
    | boolean
    | null
    | undefined
    | ((props: RocketStyleInterpolationProps<CSS>) => any)
    | any[]
  >
) => any

export type StylesCb<CSS extends TObj = TObj> = (css: RocketCss<CSS>) => ReturnType<Css>
export type StylesCbArray = StylesCb[]

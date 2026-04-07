import type { config } from '@pyreon/ui-core'
import type { PseudoState } from './pseudo'
import type { TObj } from './utils'

export interface StylesDefault {}

export type Styles<S = unknown> = StylesDefault

export type Css = typeof config.css
export type Style = ReturnType<Css>
export type OptionStyles = ((css: Css) => ReturnType<Css>)[]

/**
 * Props available inside `.styles()` interpolation functions.
 *
 * - `$rocketstyle` — resolved theme object (the styled() runtime resolves
 *   the reactive accessor before calling interpolation functions)
 * - `$rocketstate` — active dimension values + pseudo state
 *
 * Note: internally, rocketstyle passes $rocketstyle as a `() => CSS` accessor
 * to DynamicStyled for reactive class swapping. But by the time interpolation
 * functions run, it's always been resolved to a plain CSS object.
 */
/** Pseudo-state style overrides — always present (default to {}). */
type PseudoStyleOverrides = {
  hover: Record<string, unknown>
  focus: Record<string, unknown>
  active: Record<string, unknown>
  disabled: Record<string, unknown>
  pressed: Record<string, unknown>
  readOnly: Record<string, unknown>
}

export type RocketStyleInterpolationProps<CSS extends TObj = TObj> = {
  /** Resolved theme object — merged from .theme(), .states(), .sizes(), .variants(). */
  $rocketstyle: CSS & PseudoStyleOverrides & Record<string, unknown>
  /** Active dimension values + pseudo state (hover, focus, pressed, etc.). */
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

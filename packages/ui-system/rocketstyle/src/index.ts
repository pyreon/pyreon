import type { TProvider } from './context/context'
import Provider, { context } from './context/context'
import type { Rocketstyle } from './init'
import rocketstyle from './init'
import type { IsRocketComponent } from './isRocketComponent'
import isRocketComponent from './isRocketComponent'
import type { AttrsCb } from './types/attrs'
import type {
  ConfigAttrs,
  ConsumerCb,
  ConsumerCtxCBValue,
  ConsumerCtxCb,
  RocketComponentType,
  RocketProviderState,
} from './types/config'
import type { DefaultProps } from './types/configuration'
import type {
  DimensionCallbackParam,
  DimensionProps,
  Dimensions,
  DimensionValue,
  ExtractDimensionProps,
  ExtractDimensions,
  TDKP,
} from './types/dimensions'
import type { ComposeParam, GenericHoc } from './types/hoc'
import type { IRocketStyleComponent, RocketStyleComponent } from './types/rocketstyle'
import type { RocketStyleInterpolationProps, StylesCb, StylesDefault } from './types/styles'
import type {
  ThemeCb,
  ThemeDefault,
  ThemeMode,
  ThemeModeCallback,
  ThemeModeKeys,
} from './types/theme'
import type { ComponentFn, ElementType, ExtractProps, MergeTypes, TObj } from './types/utils'

export type {
  AttrsCb,
  ComponentFn,
  ComposeParam,
  ConfigAttrs,
  ConsumerCb,
  ConsumerCtxCBValue,
  ConsumerCtxCb,
  DefaultProps,
  DimensionCallbackParam,
  DimensionProps,
  Dimensions,
  DimensionValue,
  ElementType,
  ExtractDimensionProps,
  ExtractDimensions,
  ExtractProps,
  GenericHoc,
  IRocketStyleComponent,
  IsRocketComponent,
  MergeTypes,
  RocketComponentType,
  RocketProviderState,
  RocketStyleComponent,
  RocketStyleInterpolationProps,
  Rocketstyle,
  StylesCb,
  StylesDefault,
  TDKP,
  ThemeCb,
  ThemeDefault,
  ThemeMode,
  ThemeModeCallback,
  ThemeModeKeys,
  TObj,
  TProvider,
}

/**
 * Resolve a $rocketstyle value — handles both function accessor and plain object.
 * Use in styled() interpolation functions when $rocketstyle may be a reactive accessor.
 *
 * @example
 * ```ts
 * styled(Component)`
 *   color: ${(props) => resolveTheme(props.$rocketstyle).color};
 * `
 * ```
 */
export function resolveTheme<T = Record<string, unknown>>(
  value: (() => T) | T,
): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export { context, isRocketComponent, Provider, rocketstyle }
export default rocketstyle

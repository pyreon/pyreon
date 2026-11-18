import type { BreakpointKeys } from '@pyreon/ui-core'
import type { DefaultDimensions } from '../constants/defaultDimensions'
import type { Css } from './styles'
import type { ThemeModeCallback } from './theme'
import type { CallBackParam, NullableKeys, ReturnCbParam, Spread, TObj, ValueOf } from './utils'

export type { DefaultDimensions }

export type ExtractNullableDimensionKeys<T> = {
  [P in keyof T as T[P] extends false ? never : P]: T[P]
}

export type ExtractDimensionKey<T extends DimensionValue> = T extends DimensionValueObj
  ? T['propName']
  : T

export type ExtractDimensionMulti<T extends DimensionValue> = T extends DimensionValueObj
  ? true
  : false

export type ExtractDimensionAttrsKeys<D extends Dimensions> = {
  [I in keyof D]: ExtractDimensionKey<D[I]>
}[keyof D]

export type DimensionValuePrimitive = string

export type DimensionValueObj = {
  propName: string
  multi?: boolean
  /** When true, this dimension is evaluated last and its values receive the accumulated theme as argument. */
  transform?: boolean
}

export type DimensionValue = DimensionValuePrimitive | DimensionValueObj
export type Dimensions = Record<string, DimensionValue>

export type MultiKeys<T extends Dimensions = Dimensions> = Partial<
  Record<ExtractDimensionKey<T[keyof T]>, true>
>

/** Mode-aware value — either the value directly or a m(light, dark) callback. */
type ModeAware<T> = T | ((mode: 'light' | 'dark') => T)

/**
 * A style value in a dimension slice, in every form a `.theme()` value takes:
 * a single value, a mobile-first array (`null` = inherit the smaller
 * breakpoint) or a breakpoint object. A responsive slice value wins from its
 * first breakpoint up (`mergeTheme` in utils/theme.ts).
 */
type ResponsiveValue<T> =
  | ModeAware<T>
  | readonly (ModeAware<T> | null | undefined)[]
  | Partial<Record<BreakpointKeys, ModeAware<T> | null | undefined>>

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : NonNullable<T[K]> extends Record<string, any>
      ? DeepPartial<NonNullable<T[K]>> | ModeAware<DeepPartial<NonNullable<T[K]>>> | Extract<T[K], null>
      : ResponsiveValue<T[K]>
}

/** The pseudo-state groups a theme nests (`hover: { color }` → `:hover`). */
type PseudoGroup = 'hover' | 'focus' | 'active' | 'disabled' | 'pressed' | 'readOnly'

/**
 * One dimension value's style object. With a typed `StylesDefault` (an app
 * augments it with unistyle's `ITheme`), the keys are checked, so a misspelt
 * property is an error, and the pseudo groups nest one level. Without one
 * (`StylesDefault` is `{}`), any object is accepted, as before.
 */
export type DimensionStyle<CT> = [keyof CT] extends [never]
  ? DeepPartial<CT>
  : DeepPartial<CT> & { [P in Exclude<PseudoGroup, keyof CT>]?: DeepPartial<CT> | undefined }

export type DimensionResult<CT, T = any> = Record<
  string,
  | boolean
  | null
  | DimensionStyle<CT>
  | ((theme: CT, appTheme: T, mode: ThemeModeCallback, css: Css) => DimensionStyle<CT>)
>

export type DimensionObj<CT, T = any> = DimensionResult<CT, T>

export type DimensionCb<T, CT> = (
  theme: T,
  mode: ThemeModeCallback,
  css: Css,
) => DimensionResult<CT, T>

export type DimensionCallbackParam<T, CT> = DimensionObj<CT, T> | DimensionCb<T, CT>

export type DimensionReturn<P, A> = P extends TObj ? A & P : A

export type TDKP = Record<string, unknown>

export type DimensionProps<
  K extends DimensionValue,
  D extends Dimensions,
  P extends CallBackParam,
  DKP extends TDKP,
> = {
  [I in ExtractDimensionKey<D[keyof D]>]: I extends ExtractDimensionKey<K>
    ? ExtractNullableDimensionKeys<Spread<[DKP[I], NullableKeys<ReturnCbParam<P>>]>>
    : DKP[I]
}

type DimensionTypesHelper<D extends Dimensions, DKP extends TDKP> = {
  [I in ExtractDimensionKey<D[keyof D]> & keyof DKP]: keyof DKP[I]
}

export type DimensionObjAttrs<D extends Dimensions, DKP extends TDKP> = {
  [I in ExtractDimensionKey<D[keyof D]> & keyof DKP]: ExtractDimensionMulti<
    D[I & keyof D]
  > extends true
    ? keyof DKP[I] | Array<keyof DKP[I]>
    : keyof DKP[I]
}

export type DimensionBooleanAttrs<D extends Dimensions, DKP extends TDKP> = Partial<
  Record<ValueOf<DimensionTypesHelper<D, DKP>>, boolean>
>

/**
 * A dimension PROP also accepts an ACCESSOR (`state={() => cond ? 'a' : 'b'}`).
 *
 * `calculateStylingAttrs` resolves a function-valued dimension prop at read time
 * (`typeof rawProp === 'function' ? rawProp() : rawProp`, see utils/attrs.ts) —
 * that landed with the INLINE-signal fix so a reactive dimension re-resolves
 * inside rocketstyle's own computed, with no remount. The runtime shipped, but
 * this type never widened to match, so the very form the fix exists to support
 * failed to typecheck and call sites needed a cast.
 *
 * Applied ONLY to the props-facing type — never to `ExtractDimensions`, which is
 * the RESOLVED shape behind `$$rocketstyle` and the `.config()` callback, where a
 * function is genuinely not a valid value.
 *
 * Widening only ever ACCEPTS more, so no existing call site can break.
 */
type WithDimensionAccessor<T> = { [K in keyof T]: T[K] | (() => T[K]) }

/**
 * A multi-value dimension list may hold falsy entries, skipped at runtime
 * (`calculateStylingAttrs`), so a modifier composes conditionally:
 * `multiple={['threeUp', compact() && 'dense']}`. Props-facing only, like the
 * accessor widening above; the resolved shape keeps the clean list.
 */
type Falsy = false | null | undefined | 0 | ''

type WithFalsyEntries<T> = {
  [K in keyof T]:
    | T[K]
    | ([Extract<T[K], readonly unknown[]>] extends [never]
        ? never
        : Extract<T[K], readonly unknown[]> extends readonly (infer E)[]
          ? ReadonlyArray<E | Falsy>
          : never)
}

export type ExtractDimensionProps<
  D extends Dimensions,
  DKP extends TDKP,
  UB extends boolean,
> = UB extends true
  ? Partial<
      WithDimensionAccessor<
        WithFalsyEntries<ExtractNullableDimensionKeys<DimensionObjAttrs<D, DKP> & DimensionBooleanAttrs<D, DKP>>>
      >
    >
  : Partial<WithDimensionAccessor<WithFalsyEntries<ExtractNullableDimensionKeys<DimensionObjAttrs<D, DKP>>>>>

export type ExtractDimensions<
  D extends Dimensions,
  DKP extends TDKP,
> = ExtractNullableDimensionKeys<DimensionObjAttrs<D, DKP>>

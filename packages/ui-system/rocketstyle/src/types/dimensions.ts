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

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : NonNullable<T[K]> extends Record<string, any>
      ? DeepPartial<NonNullable<T[K]>> | Extract<T[K], null>
      : T[K]
}

export type DimensionResult<CT, T = any> = Record<
  string,
  | boolean
  | null
  | DeepPartial<CT>
  | ((theme: CT, appTheme: T, mode: ThemeModeCallback, css: Css) => DeepPartial<CT>)
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
    ? Array<keyof DKP[I]>
    : keyof DKP[I]
}

export type DimensionBooleanAttrs<D extends Dimensions, DKP extends TDKP> = Partial<
  Record<ValueOf<DimensionTypesHelper<D, DKP>>, boolean>
>

export type ExtractDimensionProps<
  D extends Dimensions,
  DKP extends TDKP,
  UB extends boolean,
> = UB extends true
  ? Partial<ExtractNullableDimensionKeys<DimensionObjAttrs<D, DKP> & DimensionBooleanAttrs<D, DKP>>>
  : Partial<ExtractNullableDimensionKeys<DimensionObjAttrs<D, DKP>>>

export type ExtractDimensions<
  D extends Dimensions,
  DKP extends TDKP,
> = ExtractNullableDimensionKeys<DimensionObjAttrs<D, DKP>>

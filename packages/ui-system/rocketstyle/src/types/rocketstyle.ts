import type { VNodeChild } from '@pyreon/core'
import type { AttrsCb } from './attrs'
import type { ConfigAttrs } from './config'
import type { DefaultProps } from './configuration'
import type {
  DimensionCallbackParam,
  DimensionProps,
  Dimensions,
  DimensionValue,
  ExtractDimensionProps,
  ExtractDimensions,
  MultiKeys,
  TDKP,
} from './dimensions'
import type { ComposeParam } from './hoc'
import type { Styles, StylesCb } from './styles'
import type { Theme, ThemeCb, ThemeModeKeys } from './theme'
import type { ElementType, ExtractProps, MergeTypes, TObj } from './utils'

export type InnerComponentProps = {
  'data-rocketstyle'?: string | undefined
} & Record<string, any>

export type RocketStyleComponent<
  OA extends TObj = {},
  EA extends TObj = {},
  T extends TObj = {},
  CSS extends TObj = {},
  S extends TObj = {},
  HOC extends TObj = {},
  D extends Dimensions = Dimensions,
  UB extends boolean = boolean,
  DKP extends TDKP = TDKP,
> = IRocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP> & {
  [I in keyof D]: <
    K extends DimensionValue = D[I],
    P extends DimensionCallbackParam<Theme<T>, Styles<CSS>> = DimensionCallbackParam<
      Theme<T>,
      Styles<CSS>
    >,
  >(
    param: P,
  ) => P extends DimensionCallbackParam<Theme<T>, Styles<CSS>>
    ? RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DimensionProps<K, D, P, DKP>>
    : RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP>
}

/**
 * @param OA   Origin component props params.
 * @param EA   Extended prop types
 * @param T    Theme passed via context.
 * @param CSS  Custom theme accepted by styles.
 * @param S    Defined statics
 * @param D    Dimensions to be used for defining component states.
 * @param UB   Use booleans value
 * @param DKP  Dimensions key props.
 * @param DFP  Calculated final component props
 */
export interface IRocketStyleComponent<
  // original component props
  OA extends TObj = {},
  // extended component props
  EA extends TObj = {},
  // theme
  T extends TObj = {},
  // custom style properties
  CSS extends TObj = {},
  // statics
  S extends TObj = {},
  // hocs
  HOC extends TObj = {},
  // dimensions
  D extends Dimensions = Dimensions,
  // use booleans
  UB extends boolean = boolean,
  // dimension key props
  DKP extends TDKP = TDKP,
  // calculated final props
  DFP = MergeTypes<[OA, EA, DefaultProps, ExtractDimensionProps<D, DKP, UB>]>,
> {
  // The component is callable — Pyreon components are plain functions
  (props: DFP): VNodeChild

  // CONFIG chaining method
  config: <NC extends ElementType | unknown = unknown>({
    name,
    component: NC,
    provider,
    consumer,
    DEBUG,
    inversed,
    passProps,
  }: ConfigAttrs<NC, D, DKP, UB>) => NC extends ElementType
    ? RocketStyleComponent<ExtractProps<NC>, EA, T, CSS, S, HOC, D, UB, DKP>
    : RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP>

  // ATTRS chaining method
  attrs: <P extends TObj | unknown = unknown>(
    param: P extends TObj
      ?
          | Partial<DFP & P>
          | ((
              props: Partial<DFP & P>,
              theme: Theme<T>,
              helpers: any,
            ) => Partial<P> & Record<string, unknown>)
      : Partial<DFP> | AttrsCb<DFP, Theme<T>>,
    config?: Partial<{
      priority: boolean
      filter: P extends TObj ? Partial<keyof (EA & P)>[] : Partial<keyof EA>[]
    }>,
  ) => P extends TObj
    ? RocketStyleComponent<OA, MergeTypes<[EA, P]>, T, CSS, S, HOC, D, UB, DKP>
    : RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP>

  // THEME chaining method
  theme: <P extends TObj = TObj>(
    param: Partial<P> | Partial<Styles<CSS>> | ThemeCb<P, Theme<T>>,
  ) => RocketStyleComponent<OA, EA, T, MergeTypes<[CSS, P]>, S, HOC, D, UB, DKP>

  // STYLES chaining method
  styles: (param: StylesCb<CSS>) => RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP>

  // COMPOSE chaining method
  compose: <P extends ComposeParam>(
    param: P,
  ) => P extends TObj
    ? RocketStyleComponent<OA, EA, T, CSS, S, MergeTypes<[HOC, P]>, D, UB, DKP>
    : RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP>

  // STATICS chaining method
  statics: <P extends TObj | unknown = unknown>(
    param: P,
  ) => P extends TObj
    ? RocketStyleComponent<OA, EA, T, CSS, MergeTypes<[S, P]>, HOC, D, UB, DKP>
    : RocketStyleComponent<OA, EA, T, CSS, S, HOC, D, UB, DKP>

  /** Access to all defined statics on the component. */
  meta: S

  getStaticDimensions: (theme: TObj) => {
    dimensions: DKP
    useBooleans: UB
    multiKeys: MultiKeys<D>
  }

  getDefaultAttrs: (props: TObj, theme: TObj, mode: ThemeModeKeys) => TObj

  readonly $$rocketstyle: ExtractDimensions<D, DKP>
  readonly $$originTypes: OA
  readonly $$extendedTypes: EA
  readonly $$types: DFP

  IS_ROCKETSTYLE: true
  displayName: string

  /**
   * The accumulated `.attrs()` callback chain — hoisted at component-creation
   * time so external inspectors (notably `extractDocumentTree` from
   * `@pyreon/connector-document`) can compute post-attrs props without
   * invoking the full styled wrapper. Each callback maps user props to a
   * partial props object; `chain.reduce(Object.assign, {})` produces the
   * post-attrs result.
   *
   * Stable contract — consumers can rely on this property being present on
   * every rocketstyle-wrapped component. Empty array when no `.attrs()`
   * was ever called on the chain. Treat as read-only; mutating breaks
   * `extractDocumentTree` and any other inspector consuming the hoist.
   */
  readonly __rs_attrs: ReadonlyArray<(props: Record<string, unknown>) => Record<string, unknown>>
}

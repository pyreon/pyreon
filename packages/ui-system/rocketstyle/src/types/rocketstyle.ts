import type { VNodeChild } from '@pyreon/core'
import type { AttrsHelpers } from './attrs'
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
  //
  // `OA extends infer O` distributes over OA's union branches — future-proofs
  // against the overload-aware `ExtractProps` (follow-up PR); for today's
  // single-typed OA the distribution collapses to a single branch.
  //
  // **OA-overlapping EA keys are widened**. When `.attrs({ tag: 'a' })` sets
  // a default for `tag` on a wrapper whose OA has `tag: HTMLTags`, we strip
  // `tag` from OA and re-add it as `Partial<Pick<O, 'tag'>>` — taking O's
  // WIDER type (`HTMLTags`), not EA's narrow literal `'a'`. The runtime
  // default is `'a'`; the JSX call site still accepts any `HTMLTags` value
  // (so `<Btn tag="span" />` is valid). `Partial<Omit<EA, keyof O>>` handles
  // net-new EA-only keys (no OA conflict) and marks them optional too —
  // every `.attrs()` value is semantically a default, never required of the
  // consumer. Mirrors vitus-labs/ui-system PR #225.
  DFP = OA extends infer O
    ? Omit<O, keyof EA & keyof O> &
        Partial<Pick<O, keyof EA & keyof O>> &
        MergeTypes<
          [Partial<Omit<EA, keyof O>>, DefaultProps, ExtractDimensionProps<D, DKP, UB>]
        >
    : never,
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
  //
  // Two overloads. TS resolves in declaration order; the callback form is
  // listed FIRST so a function argument matches it before falling through to
  // the object form. Mirrors vitus-labs/ui-system PR #227 Issue 2 (callback
  // overload split).
  //
  // **Callback overload — asymmetric props/return**: the `props` arg is
  // typed strictly as `Partial<DFP & P>` (so reading `props.x` narrows
  // against the wrapped component's full surface), while the RETURN is
  // `Partial<P> & Record<string, unknown>` — only the user's explicit `<P>`
  // generic is checked, with a wildcard for runtime extras. This preserves
  // Pyreon's documented convention where `.attrs(callback)` returns can
  // carry runtime-only fields (`_documentProps` markers for the document-
  // export pipeline, `tag: 'a'` overrides on Text-based components where
  // the rendered DOM tag is outside the component's narrow `tag` union,
  // etc.). The runtime is loose by design — `.attrs(cb, { filter })`
  // strips keys before forwarding to the DOM. Consumers wanting strict
  // typed extras pass `<P>` with the precise keys they expect.
  //
  // **Object overload — `P & Partial<NoInfer<DFP>>`**: TS infers P from
  // the param's keys. `NoInfer<DFP>` (TS 5.4+) prevents DFP from
  // contributing to P inference. Combined with DFP widening above, this
  // makes `.attrs({ tag: 'a' })` keys optional at the JSX call site —
  // every `.attrs()` value is a default, not a required prop. Mirrors
  // vitus-labs PR #225.
  attrs: {
    <P extends TObj = {}>(
      param: (
        props: Partial<DFP & P>,
        theme: Theme<T>,
        helpers: AttrsHelpers,
      ) => Partial<P> & Record<string, unknown>,
      config?: Partial<{
        priority: boolean
        filter: (keyof MergeTypes<[EA, P]>)[]
      }>,
    ): RocketStyleComponent<OA, MergeTypes<[EA, P]>, T, CSS, S, HOC, D, UB, DKP>

    <P extends TObj = {}>(
      param: P & Partial<NoInfer<DFP>>,
      config?: Partial<{
        priority: boolean
        filter: (keyof MergeTypes<[EA, P]>)[]
      }>,
    ): RocketStyleComponent<OA, MergeTypes<[EA, P]>, T, CSS, S, HOC, D, UB, DKP>
  }

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

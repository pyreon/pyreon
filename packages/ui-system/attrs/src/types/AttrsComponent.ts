import type { VNode } from "@pyreon/core"
import type { AttrsCb } from "./attrs"
import type { ConfigAttrs } from "./config"
import type { ComposeParam } from "./hoc"
import type { ElementType, ExtractProps, MergeTypes, TObj } from "./utils"

/**
 * Props passed to the inner enhanced component.
 * In Pyreon there's no forwardRef — ref flows as a normal prop.
 */
export type InnerComponentProps = {
  "data-attrs"?: string | undefined
}

/**
 * @param OA   Origin component props params.
 * @param EA   Extended prop types
 * @param S    Defined statics
 * @param HOC  High-order components
 * @param DFP  Calculated final component props
 */
export interface AttrsComponent<
  C extends ElementType = ElementType,
  // original component props
  OA extends TObj = {},
  // extended component props
  EA extends TObj = {},
  // statics
  S extends TObj = {},
  // hocs
  HOC extends TObj = {},
  // calculated final props
  DFP extends Record<string, any> = MergeTypes<[OA, EA]>,
> {
  // The component is callable — Pyreon components are plain functions
  (props: DFP): VNode | null

  // CONFIG chaining method
  config: <NC extends ElementType | unknown = unknown>({
    name,
    component: NC,
    DEBUG,
  }: ConfigAttrs<NC>) => NC extends ElementType
    ? AttrsComponent<NC, ExtractProps<NC>, EA, S, HOC>
    : AttrsComponent<C, OA, EA, S, HOC>

  // ATTRS chaining method
  attrs: <P extends TObj | unknown = unknown>(
    param: P extends TObj ? Partial<DFP & P> | AttrsCb<DFP & P> : Partial<DFP> | AttrsCb<DFP>,
    config?: Partial<{
      priority: boolean
      filter: unknown extends P ? string[] : (keyof (EA & P))[]
    }>,
  ) => P extends TObj
    ? AttrsComponent<C, OA, MergeTypes<[EA, P]>, S, HOC>
    : AttrsComponent<C, OA, EA, S, HOC>

  // COMPOSE chaining method
  compose: <P extends ComposeParam>(
    param: P,
  ) => P extends TObj
    ? AttrsComponent<C, OA, EA, S, MergeTypes<[HOC, P]>>
    : AttrsComponent<C, OA, EA, S, HOC>

  // STATICS chaining method
  statics: <P extends TObj | unknown = unknown>(
    param: P,
  ) => P extends TObj
    ? AttrsComponent<C, OA, EA, MergeTypes<[S, P]>, HOC>
    : AttrsComponent<C, OA, EA, S, HOC>

  /** Access to all defined statics on the component. */
  meta: S

  getDefaultAttrs: (props: TObj) => TObj

  readonly $$originTypes: OA
  readonly $$extendedTypes: EA
  readonly $$types: DFP

  IS_ATTRS: true
  displayName: string
}

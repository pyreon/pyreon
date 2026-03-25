import type { DimensionBooleanAttrs, Dimensions, ExtractDimensions, TDKP } from "./dimensions"
import type { PseudoState } from "./pseudo"
import type { ElementType, TObj } from "./utils"

// --------------------------------------------------------
// CONFIG
// --------------------------------------------------------
export type RocketComponentType = ElementType & {
  IS_ROCKETSTYLE: true
  $$rocketstyle: Record<string, unknown>
}

export type RocketProviderState<T extends RocketComponentType | TObj | unknown = unknown> =
  T extends RocketComponentType ? Partial<T["$$rocketstyle"]> & { pseudo: PseudoState } : T

export type ConsumerCtxCBValue<
  T extends RocketComponentType,
  D extends Dimensions,
  DKP extends TDKP,
> = (
  attrs: RocketProviderState<T>,
) => DKP extends TDKP ? Partial<ExtractDimensions<D, DKP> & { pseudo: PseudoState }> : TObj

export type ConsumerCtxCb<D extends Dimensions, DKP extends TDKP = TDKP> = <
  T extends RocketComponentType,
>(
  attrs: ConsumerCtxCBValue<T, D, DKP>,
) => ReturnType<ConsumerCtxCBValue<T, D, DKP>>

export type ConsumerCb<D extends Dimensions, DKP extends TDKP = TDKP> = (
  ctx: ConsumerCtxCb<D, DKP>,
) => ReturnType<ConsumerCtxCb<D, DKP>>

export type ConfigAttrs<
  C extends ElementType | unknown,
  D extends Dimensions,
  DKP extends TDKP,
  UB extends boolean,
> = Partial<{
  name: string
  component: C
  provider: boolean
  consumer: ConsumerCb<D, DKP>
  DEBUG: boolean
  inversed: boolean
  passProps: UB extends true ? keyof DimensionBooleanAttrs<D, DKP>[] : never
  styled: boolean
}>

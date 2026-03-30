import type { ConsumerCb } from "./config";
import type { Dimensions, MultiKeys } from "./dimensions";
import type { PseudoProps } from "./pseudo";
import type { StylesCbArray } from "./styles";
import type { ArrayOfKeys, ArrayOfValues, ElementType, TFn } from "./utils";

export type __ROCKETSTYLE__ = {
  dimensions: Record<string, string>;
  reservedPropNames: Record<string, true>;
  baseTheme: Record<string, unknown>;
  themes: Record<string, unknown>;
};

export type OptionFunc = (...arg: unknown[]) => Record<string, unknown>;

export type InitConfiguration<C, D> = {
  name?: string | undefined;
  component: C;
  useBooleans: boolean;
  dimensions: D;
  dimensionKeys: ArrayOfKeys<D>;
  dimensionValues: ArrayOfValues<D>;
  multiKeys: MultiKeys;
  transformKeys: Partial<Record<string, true>>;
};

export type Configuration<
  C = ElementType | unknown,
  D extends Dimensions = Dimensions,
> = InitConfiguration<C, D> & {
  provider?: boolean | undefined;
  consumer?: ConsumerCb<D> | undefined;
  DEBUG?: boolean | undefined;
  inversed?: boolean | undefined;
  passProps?: string[] | undefined;
  styled?: boolean | undefined;

  // array chaining options
  attrs: OptionFunc[];
  priorityAttrs: OptionFunc[];
  filterAttrs: string[];
  theme: OptionFunc[];
  styles: StylesCbArray;
  compose: Record<string, TFn | null | undefined | false>;
  statics: Record<string, any>;
} & Record<string, any>;

export type ExtendedConfiguration<
  C = ElementType | unknown,
  D extends Dimensions = Dimensions,
> = InitConfiguration<C, D> & {
  provider?: boolean | undefined;
  consumer?: ConsumerCb<D> | undefined;
  DEBUG?: boolean | undefined;
  inversed?: boolean | undefined;
  passProps?: string[] | undefined;
  styled?: boolean | undefined;

  // array chaining options
  attrs: OptionFunc;
  priorityAttrs: OptionFunc;
  filterAttrs: string[];
  theme: OptionFunc;
  styles: StylesCbArray;
  compose: Record<string, TFn | null | undefined | false>;
  statics: Record<string, any>;
} & Record<string, any>;

export type DefaultProps = Partial<PseudoProps>;

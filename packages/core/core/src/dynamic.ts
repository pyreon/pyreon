import { h } from "./h";
import type { ComponentFn, Props, VNode } from "./types";

const __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

export interface DynamicProps extends Props {
  component: ComponentFn | string;
}

export function Dynamic(props: DynamicProps): VNode | null {
  const { component, ...rest } = props;
  if (__DEV__ && !component) {
    // biome-ignore lint/suspicious/noConsole: dev-only warning
    console.warn("[Pyreon] <Dynamic> received a falsy `component` prop. Nothing will be rendered.");
  }
  if (!component) return null;
  return h(component as string | ComponentFn, rest as Props);
}

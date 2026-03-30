import type { VNodeChild } from "@pyreon/core";
import { createContext, provide } from "@pyreon/core";
import isEmpty from "./isEmpty";
import type { Breakpoints } from "./types";

/**
 * Internal context shared across all @pyreon packages.
 * Carries the theme object plus any extra provider props.
 */
const context = createContext<any>({});

type Theme = Partial<
  {
    rootSize: number;
    breakpoints: Breakpoints;
  } & Record<string, any>
>;

type ProviderType = Partial<
  {
    theme: Theme;
    children: VNodeChild;
  } & Record<string, any>
>;

/**
 * Provider that feeds the internal Pyreon context with the theme.
 * When no theme is supplied, renders children directly.
 */
function Provider({ theme, children, ...props }: ProviderType): VNodeChild {
  if (isEmpty(theme) || !theme) return children ?? null;

  provide(context, { theme, ...props });

  return children ?? null;
}

export { context };

export default Provider;

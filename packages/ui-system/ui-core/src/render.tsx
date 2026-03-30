import type { ComponentFn, Props, VNodeChild } from "@pyreon/core";
import { h } from "@pyreon/core";

type RenderProps<T extends Record<string, unknown> | undefined> = (props: Partial<T>) => VNodeChild;

/**
 * Flexible element renderer that handles multiple content types:
 * - Primitives (string, number) — returned as-is
 * - Arrays — returned as-is
 * - Component functions — created via h()
 * - VNode objects — returned as-is (with props merged if provided)
 * - Render props (functions) — called with attachProps
 * - Falsy values — return null
 */
export type Render = <T extends Record<string, any> | undefined>(
  content?: ComponentFn | string | VNodeChild | VNodeChild[] | RenderProps<T>,
  attachProps?: T,
) => VNodeChild;

const render: Render = (content, attachProps) => {
  if (!content) return null;

  const t = typeof content;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") {
    return content as VNodeChild;
  }

  if (Array.isArray(content)) {
    return content as VNodeChild;
  }

  if (typeof content === "function") {
    // Extract key from props — it's a VNode concept, not a component prop.
    // Passing key inside props causes JSX runtime warnings.
    if (attachProps && "key" in attachProps) {
      const { key, ...rest } = attachProps;
      return h(content as string | ComponentFn, rest as Props);
    }
    return h(content as string | ComponentFn, (attachProps ?? {}) as Props);
  }

  // VNode object — return directly
  if (typeof content === "object") {
    return content as VNodeChild;
  }

  return content as VNodeChild;
};

export default render;

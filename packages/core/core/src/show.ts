import type { Props, VNode, VNodeChild, VNodeChildAtom } from "./types";

// ─── Show ─────────────────────────────────────────────────────────────────────

export interface ShowProps extends Props {
  /** Accessor — children render when truthy, fallback when falsy. */
  when: () => unknown;
  fallback?: VNodeChild;
  children?: VNodeChild;
}

/**
 * Conditionally render children based on a reactive condition.
 *
 * @example
 * h(Show, { when: () => isLoggedIn() },
 *   h(Dashboard, null)
 * )
 *
 * // With fallback:
 * h(Show, { when: () => user(), fallback: h(Login, null) },
 *   h(Dashboard, null)
 * )
 */
export function Show(props: ShowProps): VNode | null {
  // Returns a reactive accessor; the renderer unwraps it at mount time.
  return ((): VNodeChildAtom =>
    (props.when()
      ? (props.children ?? null)
      : (props.fallback ?? null)) as VNodeChildAtom) as unknown as VNode;
}

// ─── Switch / Match ───────────────────────────────────────────────────────────

export interface MatchProps extends Props {
  /** Accessor — this branch renders when truthy. */
  when: () => unknown;
  children?: VNodeChild;
}

/**
 * A branch inside `<Switch>`. Renders when `when()` is truthy.
 * Must be used as a direct child of `Switch`.
 *
 * `Match` acts as a pure type/identity marker — Switch identifies it by checking
 * `vnode.type === Match` rather than by the runtime return value.
 */
export function Match(_props: MatchProps): VNode | null {
  // Match is never mounted directly — Switch inspects Match VNodes by type identity.
  return null;
}

export interface SwitchProps extends Props {
  /** Rendered when no Match branch is truthy. */
  fallback?: VNodeChild;
  children?: VNodeChild | VNodeChild[];
}

/**
 * Multi-branch conditional rendering. Evaluates each `Match` child in order,
 * renders the first whose `when()` is truthy, or `fallback` if none match.
 *
 * @example
 * h(Switch, { fallback: h("p", null, "404") },
 *   h(Match, { when: () => route() === "/" }, h(Home, null)),
 *   h(Match, { when: () => route() === "/about" }, h(About, null)),
 * )
 */
function isMatchVNode(branch: VNodeChild): branch is VNode {
  return (
    branch !== null &&
    typeof branch === "object" &&
    !Array.isArray(branch) &&
    (branch as VNode).type === Match
  );
}

function resolveMatchChildren(matchVNode: VNode): VNodeChildAtom {
  if (matchVNode.children.length === 0) {
    return ((matchVNode.props as unknown as MatchProps).children ?? null) as VNodeChildAtom;
  }
  if (matchVNode.children.length === 1) return matchVNode.children[0] as VNodeChildAtom;
  return matchVNode.children as unknown as VNodeChildAtom;
}

function normalizeBranches(children: SwitchProps["children"]): VNodeChild[] {
  if (Array.isArray(children)) return children;
  if (children != null) return [children];
  return [];
}

export function Switch(props: SwitchProps): VNode | null {
  // Returns a reactive accessor; the renderer unwraps it at mount time.
  return ((): VNodeChildAtom => {
    const branches = normalizeBranches(props.children);

    for (const branch of branches) {
      if (!isMatchVNode(branch)) continue;
      const matchProps = branch.props as unknown as MatchProps;
      if (matchProps.when()) return resolveMatchChildren(branch);
    }

    return (props.fallback ?? null) as VNodeChildAtom;
  }) as unknown as VNode;
}

// Keep MatchSymbol export for any code that was using it
export const MatchSymbol: unique symbol = Symbol("pyreon.Match");

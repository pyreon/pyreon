import type { Props, VNode, VNodeChild, VNodeChildAtom } from "./types"

// ─── Show ─────────────────────────────────────────────────────────────────────

export interface ShowProps extends Props {
  /** Accessor — children render when truthy, fallback when falsy. */
  when: () => unknown
  fallback?: VNodeChild
  children?: VNodeChild
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
      : (props.fallback ?? null)) as VNodeChildAtom) as unknown as VNode
}

// ─── Switch / Match ───────────────────────────────────────────────────────────

export interface MatchProps extends Props {
  /** Accessor — this branch renders when truthy. */
  when: () => unknown
  children?: VNodeChild
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
  return null
}

export interface SwitchProps extends Props {
  /** Rendered when no Match branch is truthy. */
  fallback?: VNodeChild
  children?: VNodeChild | VNodeChild[]
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
export function Switch(props: SwitchProps): VNode | null {
  // Returns a reactive accessor; the renderer unwraps it at mount time.
  return ((): VNodeChildAtom => {
    const branches = Array.isArray(props.children)
      ? props.children
      : props.children != null
        ? [props.children]
        : []

    for (const branch of branches) {
      // Identify Match branches by VNode type === Match function reference
      if (
        branch !== null &&
        typeof branch === "object" &&
        !Array.isArray(branch) &&
        (branch as VNode).type === Match
      ) {
        const matchVNode = branch as VNode
        const matchProps = matchVNode.props as unknown as MatchProps
        if (matchProps.when()) {
          // Children are stored in vnode.children (rest args of h())
          // or in props.children (when passed explicitly)
          const ch =
            matchVNode.children.length > 0
              ? matchVNode.children.length === 1
                ? matchVNode.children[0]
                : matchVNode.children
              : (matchProps.children ?? null)
          return ch as VNodeChildAtom
        }
      }
    }

    return (props.fallback ?? null) as VNodeChildAtom
  }) as unknown as VNode
}

// Keep MatchSymbol export for any code that was using it
export const MatchSymbol: unique symbol = Symbol("pyreon.Match")

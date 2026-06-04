import type { VNodeChild } from '@pyreon/core'
import { createContext, provide, useContext } from '@pyreon/core'

// ─── <NoOptimize> — subtree-scoped image-optimization opt-out ───────────────
//
// The third tier of the image opt-out grammar:
//
//   1. Per-call:    `<Image src={hero} optimize={false} />`  (already shipped — PR #1353)
//   2. Subtree:     `<NoOptimize><Image .../><Image .../></NoOptimize>`  (this PR)
//   3. Global:      `zero({ image: false })`                  (already shipped — PR #1356)
//
// `<NoOptimize>` wraps a subtree and drops every `<Image>` inside to a
// bare `<img>` (no IntersectionObserver wrapper, no aspect-ratio
// container, no lazy-loading layer). Useful when:
//
//   - A whole route renders only icon-sized images (sub-grid layouts
//     where the optimization wrapper would distort).
//   - A subtree is server-rendered + cached statically (HTML emails,
//     PDF documents, share cards) — optimization overhead is wasted.
//   - You're hand-crafting `<picture>` markup and don't want Pyreon's
//     auto-`<picture>` to compete.
//
// Setting `<NoOptimize disabled />` re-enables optimization (lets you
// scope an outer opt-out OFF for a specific inner subtree — same shape
// as React's <Provider value={...}> override pattern).

/**
 * Context value carried by `<NoOptimize>`. `true` means "drop to bare
 * `<img>` for every `<Image>` in this subtree". `false` (or no provider)
 * means "honor each `<Image>`'s own `optimize` prop".
 */
export const NoOptimizeContext = createContext<boolean>(false)

/**
 * Read whether the current render scope is in a NoOptimize boundary.
 * Used by `<Image>` to decide whether to bypass optimization.
 *
 * Returns `false` when no provider is mounted — preserves the
 * non-router-aware contract of `<Image>` (it can be used outside any
 * boundary).
 *
 * @internal exported for testing — public API is `<NoOptimize>`.
 */
export function useNoOptimize(): boolean {
  return useContext(NoOptimizeContext) ?? false
}

/**
 * Subtree boundary that disables `<Image>` optimization for every
 * descendant unless overridden by an inner `<NoOptimize disabled />`
 * or a per-call `optimize={true}` (the explicit re-enable form).
 *
 * @example
 * // Route-level: all <Image>s render bare.
 * export default function IconLibraryRoute() {
 *   return (
 *     <NoOptimize>
 *       <Image src={icon1} alt="Heart" width={24} height={24} />
 *       <Image src={icon2} alt="Star"  width={24} height={24} />
 *     </NoOptimize>
 *   )
 * }
 *
 * @example
 * // Mixed: outer disables, inner re-enables for one subtree.
 * <NoOptimize>
 *   <Icons />
 *   <NoOptimize disabled>
 *     <Image src={hero} alt="Hero" /> // still optimized
 *   </NoOptimize>
 * </NoOptimize>
 */
export function NoOptimize(props: {
  /** When `true`, this boundary OPTS OUT of an outer NoOptimize (re-enables). */
  disabled?: boolean
  children?: VNodeChild
}): VNodeChild {
  // `disabled: true` means "bypass NoOptimize behavior in this subtree" →
  // provide `false` to children (= no NoOptimize). Otherwise provide `true`
  // (= bypass optimization in this subtree). Pyreon uses explicit
  // `provide()` rather than a JSX <Provider> shim.
  provide(NoOptimizeContext, !props.disabled)
  return props.children ?? null
}

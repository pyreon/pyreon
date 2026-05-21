/**
 * Detect whether a function value is a framework component (created via
 * `rocketstyle()` or one of `@pyreon/elements`' component factories), as
 * opposed to a plain reactive-accessor function.
 *
 * Used by `Element` / `Content` `resolveSlot` to discriminate between
 *   `beforeContent={Header}` — component-reference shorthand, MUST mount
 *     as `h(Component, null)` so the framework HOC's
 *     `removeUndefinedProps(props)` / `splitProps(props)` get the
 *     default-filled props object, not bare `undefined`.
 *   `beforeContent={() => <Header />}` — reactive accessor, MUST be called
 *     so its body's signal reads land inside the enclosing
 *     `mountReactive` effect.
 *
 * Both are `typeof === 'function'`. The discriminator is the marker
 * attached by each factory:
 *   - `IS_ROCKETSTYLE` — set by `@pyreon/rocketstyle` (`rocketstyle.ts:527`,
 *     `542`) on every `rocketstyle(...).config(...)` chain end-point.
 *   - `PYREON__COMPONENT` — set by every `@pyreon/elements` component
 *     factory (Element, Text, List, Portal, Overlay, Util, Content,
 *     Wrapper, …).
 *   - `pkgName` — same components also carry this; checked as a fallback
 *     in case a third-party package mirrors the elements convention.
 *
 * Plain bare-function components without any marker (e.g.
 * `const MyComp = () => <div />`) intentionally take the accessor path
 * — they don't access props, so calling them with no args is safe AND
 * returns the VNode the renderer expects. The marker check ONLY rescues
 * components whose HOC pipelines REQUIRE props to be defined.
 *
 * Reference: regression report on 0.24.3 / PR #839 — `resolveSlot` called
 * any function-valued slot bare, crashing real consumers (bokisch.com
 * SSG build: `Prerendered 0 page(s) + 404.html`) that used the
 * `beforeContent={Component}` shorthand documented since the original
 * Element API.
 */
export function isPyreonComponent(value: unknown): boolean {
  if (typeof value !== 'function') return false
  // `Object.hasOwn` (not `in`) so a marker on a parent prototype doesn't
  // count — the marker is always an own-property in the factories.
  return (
    Object.hasOwn(value, 'IS_ROCKETSTYLE') ||
    Object.hasOwn(value, 'PYREON__COMPONENT') ||
    Object.hasOwn(value, 'pkgName')
  )
}

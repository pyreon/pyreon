/**
 * Detect whether a function value is a component (framework-marked OR
 * user-authored bare function), as opposed to a plain reactive-accessor
 * function.
 *
 * Used by `Element` / `Content` `resolveSlot` to discriminate between
 *   `beforeContent={Header}` — component-reference shorthand, MUST mount
 *     as `h(Component, null)` so the framework's runWithHooks setup
 *     window is established (and any framework HOC's
 *     `removeUndefinedProps(props)` / `splitProps(props)` get the
 *     default-filled props object, not bare `undefined`).
 *   `beforeContent={() => <Header />}` — anonymous reactive accessor,
 *     called bare so its body's signal reads land inside the enclosing
 *     `mountReactive` effect.
 *
 * Both shapes are `typeof === 'function'`. The discriminator combines two
 * checks (most-specific-first):
 *
 *   **Tier 1 — framework markers** (load-bearing for HOC pipelines):
 *     - `IS_ROCKETSTYLE` — set by `@pyreon/rocketstyle`
 *       (`rocketstyle.ts:527`, `542`) on every `rocketstyle(...).config(...)`
 *       chain end-point.
 *     - `PYREON__COMPONENT` — set by every `@pyreon/elements` component
 *       factory (Element, Text, List, Portal, Overlay, Util, Content,
 *       Wrapper, …).
 *     - `pkgName` — same components also carry this; checked as a fallback
 *       in case a third-party package mirrors the elements convention.
 *
 *   **Tier 2 — naming convention** (catches user-authored bare components
 *   without markers):
 *     - `displayName` is set → component. Authors set displayName
 *       deliberately for devtools / debug output; it's an explicit
 *       declaration of component intent.
 *     - `.name` starts with an uppercase letter → component. JSX already
 *       requires PascalCase for components (`<MyComp/>` is treated as a
 *       component; `<mycomp/>` is treated as a host tag); the discriminator
 *       mirrors that convention for slot-shorthand usage. Anonymous
 *       arrows (`name: ""`), default-export functions (`name: "default"`),
 *       and camelCase helpers fall through to the accessor path.
 *
 * Why Tier 2 matters — the bug class it closes: a bare-function component
 * that internally uses lifecycle hooks (`useWindowResize`, `onMount`,
 * `provide`, etc.) needs a `runWithHooks` setup window so the hook calls
 * find `_current` non-null. Without Tier 2, `resolveSlot` would call the
 * function bare → `_current === null` → `[Pyreon] onMount() called outside
 * component setup` warning fires in dev-mode SSR. Routing the same
 * function through `h(value, null)` mounts it as a proper component via
 * the standard `runWithHooks`-based path; the hooks register correctly
 * AND the warning never fires.
 *
 * Why the convention split is safe: a PascalCase function paired with
 * the `beforeContent={Fn}` shorthand is canonically a component reference
 * (matches every framework example in the docs). An anonymous arrow
 * `() => signal() ? <A/> : <B/>` is canonically a reactive accessor
 * (intent: re-evaluate on signal change). The naming convention is the
 * same one JSX itself uses to differentiate component vs host element.
 *
 * Reference: regression reports on 0.24.3 / PR #839 — `resolveSlot` called
 * any function-valued slot bare, crashing real consumers (bokisch.com
 * SSG build: `Prerendered 0 page(s) + 404.html`) that used the
 * `beforeContent={Component}` shorthand documented since the original
 * Element API. The marker check rescued framework-factory components but
 * missed user-authored bare components; this Tier-2 convention check
 * closes the residual gap for hook-using bare components.
 */
export function isPyreonComponent(value: unknown): boolean {
  if (typeof value !== 'function') return false
  // ── Tier 1 — framework markers ──────────────────────────────────────
  // `Object.hasOwn` (not `in`) so a marker on a parent prototype doesn't
  // count — the marker is always an own-property in the factories.
  if (
    Object.hasOwn(value, 'IS_ROCKETSTYLE') ||
    Object.hasOwn(value, 'PYREON__COMPONENT') ||
    Object.hasOwn(value, 'pkgName')
  ) {
    return true
  }
  // ── Tier 2 — naming convention ──────────────────────────────────────
  const fn = value as { displayName?: unknown; name?: unknown }
  // displayName: explicit author intent. Any non-empty string counts.
  if (typeof fn.displayName === 'string' && fn.displayName.length > 0) {
    return true
  }
  // .name: inferred function name (`const Header = () => …` → "Header";
  // `function Header()` → "Header"; anonymous arrow → ""). PascalCase
  // first letter matches JSX's own component-vs-host discriminator.
  const name = fn.name
  if (typeof name === 'string' && name.length > 0) {
    const first = name.charCodeAt(0)
    // Uppercase A-Z range (65-90). Avoids unicode-letter false-positives
    // and skips `name === "default"` from `export default () => …`.
    if (first >= 65 && first <= 90) return true
  }
  return false
}

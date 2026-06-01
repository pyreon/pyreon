import { h } from '@pyreon/core'
import type { ComponentFn, VNodeChildAtom } from '@pyreon/core'
import { isPyreonComponent } from './isPyreonComponent'
import render from './render'

/**
 * Resolve a slot value INSIDE a reactive accessor. If the consumer passed
 * a function-returning-VNode (e.g. `content={() => <Icon name={signal()} />}`),
 * unwrap it by calling — its body's signal reads are then tracked by the
 * enclosing mountReactive effect, and the slot re-renders on signal change.
 * Static VNodes / strings / null pass through unchanged to `render()`.
 *
 * **Component vs accessor discriminator** —
 * `beforeContent={Header}` (component-reference shorthand) and
 * `content={() => <X />}` (reactive accessor) are BOTH `typeof === 'function'`.
 * Calling both bare crashes component shorthands the moment a
 * rocketstyle / attrs HOC runs `removeUndefinedProps(undefined)` on the
 * un-supplied props (`TypeError: Cannot convert undefined or null to object`).
 *
 * Discriminator: framework components carry one of two markers attached by
 * their factory:
 *   - `IS_ROCKETSTYLE` — anything `rocketstyle()` produces
 *   - `PYREON__COMPONENT` / `pkgName` — `@pyreon/elements` components
 *     (Element, Text, List, Portal, Overlay, Util)
 * Marked function → mount as `h(Component, null)` (no props, defaults
 * fill in via the HOC pipeline). Unmarked function → reactive accessor,
 * called bare so its return value (a VNode) renders. Bare-function
 * components without HOC wrapping (e.g. `const MyComp = () => <div />`)
 * also work via the accessor path — they're called with no args and
 * their VNode return goes through `render()` correctly. The marker
 * check ONLY rescues components that REQUIRE props to be defined.
 * Tier 2 of `isPyreonComponent` (PascalCase `.name` / explicit
 * `displayName`) additionally catches user-authored bare components
 * that use lifecycle hooks — see `isPyreonComponent` JSDoc.
 *
 * Return type is the RESOLVED atom (VNodeChildAtom | VNodeChildAtom[]) —
 * never a nested accessor — so the enclosing `() => resolveSlot(...)` IS
 * a valid VNodeChildAccessor in the JSX child position.
 */
export const resolveSlot = (value: unknown): VNodeChildAtom | VNodeChildAtom[] => {
  if (typeof value === 'function') {
    if (isPyreonComponent(value)) {
      return h(value as ComponentFn, null) as VNodeChildAtom
    }
    return (value as () => VNodeChildAtom | VNodeChildAtom[])()
  }
  return render(value as Parameters<typeof render>[0]) as VNodeChildAtom | VNodeChildAtom[]
}

export default resolveSlot

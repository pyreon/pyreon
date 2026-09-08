/**
 * Normalize a `show` prop to an accessor — reading it from its HOLDER, per
 * call, never once at setup.
 *
 * Two separate things are going on here, and both are why this is a shared
 * helper rather than an inline `typeof` at each surface.
 *
 * **What `show` can be.** Every kinetic surface reads visibility by CALLING
 * `show()`, so anything that is not a function died with `show is not a
 * function` — an error naming a prop the author may never have written. Two
 * non-function shapes arrive, both reached for naturally:
 *
 * - **absent** — `<FadeIn>content</FadeIn>`, a preset used for a plain
 *   entrance, which is what presets exist for. An element with no `show` is not
 *   conditional, so it is shown; whether it ANIMATES on mount is `appear`'s job.
 * - **a plain boolean** — `show={isOpen}` where `isOpen` is a signal. The
 *   compiler auto-calls a known signal in attribute position, so the accessor
 *   the author wrote can arrive already resolved to `true`/`false`.
 *
 * Same rule `<Show when>` / `<Match when>` follow: an API that takes an
 * accessor must take the value too, because the compiler can hand it either
 * and the component cannot tell which the author typed.
 *
 * **WHERE that normalization happens.** It has to be inside the returned
 * accessor, against a live holder — not `normalize(props.show)` at component
 * setup. In a member position the compiler emits `show={isOpen}` as an `_rp`
 * thunk that `makeReactiveProps` installs as a GETTER on `props`; reading
 * `props.show` once at setup fires that getter outside any tracking scope and
 * yields a frozen boolean, so the "accessor" built from it closes over a
 * snapshot forever. The element mounts in its hidden state and never leaves —
 * silently, since the children stay mounted (the SSR contract) and nothing
 * throws. `@pyreon/core`'s `<Show>` avoids this the same way, by calling
 * `callWhen(props.when)` INSIDE its accessor.
 *
 * Tracking is preserved by construction: the read happens when the caller
 * calls, so it lands in whatever `watch`/`effect`/render scope is active then.
 *
 * SCOPE, stated because it is not obvious: `show` is the only prop routed
 * through this, and every SIBLING prop read at setup off the same
 * getter-bearing holder (`transition`, `timeout`, `interval`, the callbacks —
 * see the destructures in `createKineticComponent` and the `props.x ?? default`
 * reads in `Transition`/`Collapse`) carries the identical freeze. Nothing about
 * the compiler's emission is specific to `show`: `transition={sig()}` lowers to
 * `_rp` exactly the same way. `show` is singled out because its freeze is the
 * one that is INVISIBLE — the element renders, the children mount, nothing
 * throws, and it simply never becomes visible; a frozen `timeout` or
 * `transition` is a configuration value that is almost never driven by a signal
 * and degrades to "the first value wins" rather than to a blank screen.
 * Widening this to a holder-wide read is a follow-up, not an oversight.
 */
export const showAccessorFrom = (holder: { show?: unknown }): (() => boolean) => {
  return () => {
    const show = holder.show
    return typeof show === 'function'
      ? (show as () => boolean)()
      : ((show as boolean | undefined) ?? true)
  }
}

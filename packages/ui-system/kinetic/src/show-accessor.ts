/**
 * Normalize a `show` prop to an accessor.
 *
 * Every kinetic surface reads visibility by CALLING `show()`, so anything that
 * is not a function died with `show is not a function` — an error naming a prop
 * the author may never have written. Two shapes arrive here that are not
 * functions, and both are ones a consumer reaches for naturally:
 *
 * - **absent** — `<FadeIn>content</FadeIn>`, a preset used for a plain
 *   entrance, which is what presets exist for. An element with no `show` is not
 *   conditional, so it is shown; whether it ANIMATES on mount is `appear`'s job.
 * - **a plain boolean** — `show={isOpen}` where `isOpen` is a signal. The
 *   compiler auto-calls a known signal in attribute position, so the accessor
 *   the author wrote arrives here already resolved to `true`/`false`.
 *
 * This is the same rule `<Show when>` / `<Match when>` follow: an API that takes
 * an accessor must take the value too, because the compiler can hand it either
 * and the component cannot tell which the author typed.
 */
export const toShowAccessor = (show: unknown): (() => boolean) =>
  typeof show === 'function' ? (show as () => boolean) : () => (show as boolean | undefined) ?? true

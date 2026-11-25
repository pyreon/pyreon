/**
 * `@pyreon/core/compat` — plumbing for the compat layers
 * (`@pyreon/{react,preact,vue,solid,svelte}-compat`). NOT public API: it moves
 * in lockstep with those packages and carries no semver promise. See "What
 * counts as public API" on the stability page.
 *
 * `nativeCompat()` — the marker a Pyreon-style component applies to itself so
 * compat layers leave it unwrapped — is user API and stays on `@pyreon/core`.
 */
export { isNativeCompat, NATIVE_COMPAT_MARKER } from './compat-marker'
export { mapCompatDomProps, shallowEqualProps } from './compat-shared'
export { _compatProps } from './props'

/**
 * Type-level test for typed routes.
 *
 * `tsc --noEmit` (the package `typecheck`) checks this file — `src` is in the
 * tsconfig `include`. It is NOT executed at runtime: `*.test-d.tsx` is outside
 * vitest's `*.test.{ts,tsx}` glob, so no test runner loads it.
 *
 * Contract: once `RegisteredRoutes` is augmented, `<RouterLink to>`
 *   - accepts every registered route path,
 *   - accepts any dynamic `string` (no cast),
 *   - accepts external URLs / mailto / protocol-relative / `#hash`,
 *   - REJECTS a literal that looks internal but isn't registered.
 *
 * Bisect signal: if `CheckHref` ever stops narrowing, the typo line below has
 * no error and the `@ts-expect-error` becomes "unused" → tsc fails (TS2578).
 */
import { RouterLink } from '../index'

// Register two routes for THIS compilation. Interface merging narrows
// `RoutePath` to `'/' | '/resume'` package-wide, but the only JSX
// `<RouterLink to="literal">` call sites are in this file — `h()`-based call
// sites elsewhere resolve `to` to `string` and are unaffected.
declare module '../typed-routes' {
  interface RegisteredRoutes {
    '/': Record<string, never>
    '/resume': Record<string, never>
    '/user/:id': { id: string }
  }
}

declare const dynamic: string

// Collected into an exported array so each element is a "used" expression
// (no `no-unused-expressions` / `no-unused-vars` lint noise).
export const _accepted = [
  // registered routes — OK
  <RouterLink to="/">home</RouterLink>,
  <RouterLink to="/resume">résumé</RouterLink>,
  // concrete path matching a `:param` pattern — OK (InterpolateRoute)
  <RouterLink to="/user/42">user</RouterLink>,
  // dynamic string — OK, no cast
  <RouterLink to={dynamic}>dyn</RouterLink>,
  // external / handler / protocol-relative / hash — OK (never typo-checked)
  <RouterLink to="https://example.com/docs">ext</RouterLink>,
  <RouterLink to="mailto:hi@example.com">mail</RouterLink>,
  <RouterLink to="//cdn.example.com/x">rel</RouterLink>,
  <RouterLink to="#section-2">hash</RouterLink>,
]

export const _rejected = [
  // A typo that looks internal but isn't registered — MUST error.
  // @ts-expect-error — '/rezume' is not a registered route (did you mean '/resume'?)
  <RouterLink to="/rezume">typo</RouterLink>,
  // Wrong param-route prefix — MUST error (not `/user/:id`).
  // @ts-expect-error — '/users/42' is not a registered route (did you mean '/user/:id'?)
  <RouterLink to="/users/42">bad-param</RouterLink>,
]

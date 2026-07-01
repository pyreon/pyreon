/**
 * Type-level contract for zero's typed `<Link>`.
 *
 * NOTE: `@pyreon/zero`'s tsconfig EXCLUDES `src/tests`, so this file is not part
 * of the package `typecheck` gate. It documents + manually verifies the
 * contract; the underlying `CheckHref`-through-JSX mechanism IS CI-gated in
 * `@pyreon/router` (`typed-link.test-d.tsx`). Verify locally with:
 *
 *   bunx tsc --noEmit --jsx preserve --jsxImportSource @pyreon/core \\
 *     --moduleResolution bundler --module esnext --target esnext \\
 *     packages/zero/zero/src/tests/link-typed.test-d.tsx
 *
 * Contract: once zero's `RegisteredRoutes` is augmented (the typed-routes
 * codegen writes `src/pyreon-routes.d.ts`), `<Link href>`
 *   - accepts every registered route,
 *   - accepts any dynamic `string` (no cast),
 *   - accepts external URLs / mailto / protocol-relative / `#hash`,
 *   - REJECTS a literal that looks internal but isn't registered.
 */
import { Link } from '../link'

declare module '../route-types' {
  interface RegisteredRoutes {
    '/': Record<string, never>
    '/resume': Record<string, never>
    '/posts/:id': { id: string }
  }
}

declare const dynamic: string

export const _accepted = [
  <Link href="/">home</Link>,
  <Link href="/resume">résumé</Link>,
  // concrete path matching a `:param` pattern — OK (InterpolateRoute)
  <Link href="/posts/42">post</Link>,
  <Link href={dynamic}>dyn</Link>,
  <Link href="https://example.com/docs">ext</Link>,
  <Link href="mailto:hi@example.com">mail</Link>,
  <Link href="//cdn.example.com/x">rel</Link>,
  <Link href="#section-2">hash</Link>,
]

export const _rejected = [
  // @ts-expect-error — '/rezume' is not a registered route (did you mean '/resume'?)
  <Link href="/rezume">typo</Link>,
  // @ts-expect-error — '/postz/42' is not a registered route (did you mean '/posts/:id'?)
  <Link href="/postz/42">bad</Link>,
]

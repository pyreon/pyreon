/**
 * Type-safe route paths + external-link classification for `<RouterLink>`.
 *
 * ── Type safety ────────────────────────────────────────────────────────────
 * `RegisteredRoutes` is an EMPTY, augmentable interface. By default it has no
 * keys, so `RoutePath` widens to `string` — the router package is fully usable
 * with no codegen and no typed routes (backward-compatible). When a build step
 * (e.g. `@pyreon/zero`'s `typedRoutes: true`) emits a `.d.ts` that AUGMENTS
 * `RegisteredRoutes` with one key per real route, `RoutePath` narrows to that
 * union and `<RouterLink to>` gains:
 *   - autocomplete of every route path
 *   - a REAL type error on a typo (`to="/rezume"` → TS2820 "did you mean …")
 *   - dynamic `string` values still accepted with NO cast
 *   - external URLs (`https://…`, `mailto:`, `#hash`, …) still accepted
 * all at once — via the generic `RouterLink<const T>` + {@link CheckHref}. This
 * is a strict superset of a plain `to: string`; nothing that compiled before
 * stops compiling.
 *
 * ── External links ─────────────────────────────────────────────────────────
 * `<RouterLink>` inspects `to` at runtime ({@link classifyHref}) and, for
 * external URLs, renders a plain `<a target="_blank" rel="noopener noreferrer">`
 * (full browser navigation, not client-side routing) — the security-safe
 * default. Same-origin absolute URLs are treated as internal by default
 * (client-nav), configurable per-router ({@link LinkConfig}) and overridable
 * per-link (`external` / `target` / `rel` props).
 */

/**
 * Augmentable registry of known route paths. Empty by default (→ `RoutePath`
 * is `string`). A codegen step augments it:
 *
 * @example
 * declare module '@pyreon/router' {
 *   interface RegisteredRoutes {
 *     '/': Record<string, never>
 *     '/resume': Record<string, never>
 *   }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RegisteredRoutes {}

/**
 * The union of registered route paths, or `string` when none are registered
 * (no typed routes → the historical untyped behaviour, unchanged).
 */
export type RoutePath = keyof RegisteredRoutes extends never
  ? string
  : keyof RegisteredRoutes & string

/**
 * String shapes that are UNAMBIGUOUSLY external (or non-route) and must NOT be
 * typo-checked against {@link RoutePath}: any URL with a scheme, a
 * protocol-relative URL, a `mailto:`/`tel:`/`sms:` handler, or a bare `#hash`
 * anchor. A literal matching one of these is accepted as-is by {@link CheckHref}.
 */
export type ExternalHref =
  | `${string}://${string}` // http(s)://, ftp://, custom scheme with authority
  | `mailto:${string}`
  | `tel:${string}`
  | `sms:${string}`
  | `//${string}` // protocol-relative
  | `#${string}` // same-page hash anchor

/**
 * The `to` validator for the generic `<RouterLink>`:
 *   - a dynamic `string` variable → accepted as-is (no cast needed)
 *   - a literal that IS a registered route → accepted
 *   - a literal that is an external URL / mailto / hash → accepted
 *   - a literal that LOOKS like an internal path but isn't registered →
 *     collapses to `RoutePath`, producing a "not assignable, did you mean …"
 *     error at the call site.
 *
 * When no routes are registered `RoutePath` is `string`, so every branch
 * returns `T` and this is transparently permissive.
 */
export type CheckHref<T extends string> = string extends T
  ? T
  : T extends RoutePath
    ? T
    : T extends ExternalHref
      ? T
      : RoutePath

/** Per-router configuration for `<RouterLink>` external-link handling. */
export interface LinkConfig {
  /**
   * How to treat a SAME-ORIGIN absolute URL (`https://this-site.com/about`):
   *   - `'internal'` (default) — strip to its path and client-navigate.
   *   - `'external'` — treat as external (full navigation, new-tab eligible).
   */
  sameOriginAbsolute?: 'internal' | 'external'
  /** External links open in a new tab (`target="_blank"`). Default `true`. */
  externalNewTab?: boolean
  /**
   * `rel` applied to external new-tab links. Default `'noopener noreferrer'`
   * (prevents `window.opener` hijacking + strips the referrer).
   */
  externalRel?: string
}

/**
 * How a `to` value should navigate:
 *   - `internal`  — client-side router navigation.
 *   - `external`  — full browser navigation, new-tab eligible (http(s) to
 *                   another origin, or protocol-relative).
 *   - `hash`      — same-page anchor (`#section`) → browser scroll.
 *   - `protocol`  — `mailto:` / `tel:` / `sms:` / other scheme → plain `<a>`.
 */
export type LinkKind = 'internal' | 'external' | 'hash' | 'protocol'

const ABS_HTTP_RE = /^https?:\/\//i
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const HANDLER_RE = /^(mailto|tel|sms):/i

function currentOrigin(): string {
  return typeof location !== 'undefined' && location.origin ? location.origin : ''
}

/**
 * Classify a `to` value into a {@link LinkKind}. Pure + SSR-safe (falls back to
 * treating same-origin-undecidable absolutes as external when there's no
 * `location`). The `sameOriginAbsolute` policy only affects absolute http(s)
 * URLs whose origin matches the current page.
 */
export function classifyHref(to: string, config?: LinkConfig): LinkKind {
  if (!to) return 'internal'
  if (to[0] === '#') return 'hash'
  if (to.startsWith('//')) return 'external' // protocol-relative
  if (HANDLER_RE.test(to)) return 'protocol'
  if (ABS_HTTP_RE.test(to)) {
    const origin = currentOrigin()
    if (origin) {
      const lower = to.toLowerCase()
      const o = origin.toLowerCase()
      const sameOrigin = lower === o || lower.startsWith(`${o}/`)
      if (sameOrigin) return (config?.sameOriginAbsolute ?? 'internal') === 'internal' ? 'internal' : 'external'
    }
    return 'external'
  }
  if (SCHEME_RE.test(to)) return 'protocol' // some other scheme (ftp:, custom:)
  return 'internal'
}

/**
 * For an internal-classified value that is nonetheless an absolute same-origin
 * URL, strip it to a router path (`/about?x#y`). Non-absolute values pass
 * through unchanged.
 */
export function toRouterPath(to: string): string {
  if (ABS_HTTP_RE.test(to)) {
    try {
      const u = new URL(to)
      return u.pathname + u.search + u.hash
    } catch {
      return to
    }
  }
  return to
}

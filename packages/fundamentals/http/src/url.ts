/**
 * URL construction — base joining, `:param` substitution, query encoding.
 *
 * Pure + dependency-free so it is trivially unit-testable; the three bugs
 * it exists to prevent are all visible in the hand-rolled call sites this
 * package replaces:
 *   1. `${BASE}${path}` double- or missing-slash joins.
 *   2. Un-encoded interpolation (`/users/${id}` with an id containing `/`).
 *   3. `undefined` serialized into a query string as the literal
 *      `"undefined"` by a naive `URLSearchParams` build.
 */

import type { PathParams, QueryParams } from './types'

const ABSOLUTE_RE = /^[a-z][a-z\d+\-.]*:\/\//i

/** True for a fully-qualified URL (`https://…`), which ignores `baseUrl`. */
export function isAbsoluteUrl(url: string): boolean {
  return ABSOLUTE_RE.test(url)
}

/**
 * Join a base and a path with exactly one slash between them.
 * An absolute `path` wins outright; an empty `base` returns `path` as-is.
 *
 * `baseUrl` is a pure PREFIX (the axios model), NOT a `new URL(path, base)`
 * resolution. So `'https://api.com/v1' + '/users'` is `…/v1/users`, never
 * `…/users`. The WHATWG rule — where a leading slash discards the base's
 * path — is a well-known axios/ky footgun: it makes the SAME path behave
 * differently under a relative base (`'/api'`) and an absolute one, which
 * is exactly the kind of environment-dependent surprise SSR then surfaces
 * in production only.
 */
export function joinUrl(base: string | undefined, path: string): string {
  if (!base || isAbsoluteUrl(path)) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

/**
 * Substitute `:name` placeholders. Values are `encodeURIComponent`-encoded,
 * so an id containing `/` or `?` can never break out of its segment.
 *
 * Throws on a missing param rather than leaving a literal `:id` in the URL
 * — a silently-malformed request is far harder to diagnose than a throw.
 */
export function applyPathParams(path: string, params: PathParams | undefined): string {
  if (!path.includes(':')) return path
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => {
    const value = params?.[name]
    if (value === undefined || value === null) {
      throw new Error(
        `[Pyreon] http: path "${path}" needs the parameter "${name}" but it was not supplied. ` +
          `Pass it as \`{ params: { ${name}: … } }\`.`,
      )
    }
    return encodeURIComponent(String(value))
  })
}

/**
 * Serialize query parameters.
 *
 * `undefined` and `null` entries are DROPPED — the single most common
 * hand-rolled bug is `String(undefined)` landing in the URL as the text
 * `"undefined"`. Arrays repeat the key (`?tag=a&tag=b`).
 */
export function buildQuery(query: QueryParams | undefined): string {
  if (!query) return ''
  const search = new URLSearchParams()
  for (const key of Object.keys(query)) {
    const value = query[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue
        search.append(key, String(item))
      }
      continue
    }
    search.append(key, String(value as string | number | boolean))
  }
  const out = search.toString()
  return out ? `?${out}` : ''
}

/** Full resolution: base + path + params + query. */
export function buildUrl(
  baseUrl: string | undefined,
  path: string,
  params: PathParams | undefined,
  query: QueryParams | undefined,
): string {
  const withParams = applyPathParams(path, params)
  const joined = joinUrl(baseUrl, withParams)
  const qs = buildQuery(query)
  if (!qs) return joined
  return joined.includes('?') ? `${joined}&${qs.slice(1)}` : `${joined}${qs}`
}

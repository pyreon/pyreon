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

import type { PathParams, QueryObject, QueryParams, QueryStyle, QueryValue } from './types'

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
 * `:name` placeholders, plus the `\\:` escape for a LITERAL colon.
 *
 * A fresh RegExp per call: a `g`-flagged instance carries `lastIndex`.
 */
const pathToken = (): RegExp => /\\:|:([A-Za-z_][A-Za-z0-9_]*)/g

/**
 * Substitute `:name` placeholders. Values are `encodeURIComponent`-encoded,
 * so an id containing `/` or `?` can never break out of its segment.
 *
 * `\\:` writes a LITERAL colon — the escape for paths such as Google's custom
 * verbs, `/v1/:name\\:cancel`, where an unescaped `:cancel` would read as a
 * second parameter. The type-level `PathParamNames` honours the same
 * escape, so the two can never disagree about what the caller must supply.
 *
 * Throws on a missing param rather than leaving a literal `:id` in the URL
 * — a silently-malformed request is far harder to diagnose than a throw.
 */
export function applyPathParams(path: string, params: PathParams | undefined): string {
  if (!path.includes(':')) return path
  return path.replace(pathToken(), (_match, name: string | undefined) => {
    if (name === undefined) return ':'
    const value = params?.[name]
    if (value === undefined || value === null) {
      throw new Error(
        `[Pyreon] http: path "${path}" needs the parameter "${name}" but it was not supplied. ` +
          `Pass it as \`{ params: { ${name}: … } }\`, or write \`\\\\:\` for a literal colon.`,
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
 * `"undefined"`. Arrays repeat the key (`?tag=a&tag=b`); a plain object
 * serializes with bracket keys (`?filter[status]=open`), the convention
 * `qs`, Rails, PHP and Laravel all parse.
 *
 * `styles` overrides that per key with OpenAPI's serialization vocabulary —
 * see {@link QueryStyle}. An endpoint declares it once
 * (`api.endpoint(spec, { queryStyle })`), so call sites never think about it.
 */
export function buildQuery(
  query: QueryParams | undefined,
  styles?: Readonly<Record<string, QueryStyle>>,
): string {
  if (!query) return ''
  const search = new URLSearchParams()
  for (const key of Object.keys(query)) {
    const value = query[key]
    if (value === undefined || value === null) continue
    appendStyled(search, key, value, styles?.[key])
  }
  const out = search.toString()
  return out ? `?${out}` : ''
}

type Scalar = string | number | boolean

function scalars(values: readonly (Scalar | null | undefined)[]): string[] {
  const out: string[] = []
  for (const v of values) if (v !== undefined && v !== null) out.push(String(v))
  return out
}

const DELIMITER = { form: ',', spaceDelimited: ' ', pipeDelimited: '|' } as const

function appendStyled(
  search: URLSearchParams,
  key: string,
  value: Exclude<QueryValue, null | undefined>,
  style: QueryStyle | undefined,
): void {
  if (Array.isArray(value)) {
    const items = scalars(value as readonly Scalar[])
    const kind = style?.style
    // `explode: false` (or a delimited style that is not exploded) joins the
    // values into ONE entry; everything else repeats the key.
    if (kind !== undefined && kind !== 'deepObject' && style?.explode === false) {
      if (items.length > 0) search.append(key, items.join(DELIMITER[kind]))
      return
    }
    for (const item of items) search.append(key, item)
    return
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value).flatMap((prop) => {
      const v = (value as QueryObject)[prop]
      if (v === undefined || v === null) return []
      return Array.isArray(v) ? scalars(v).map((item) => [prop, item] as const) : [[prop, String(v)] as const]
    })
    const kind = style?.style ?? 'deepObject'
    if (kind === 'deepObject') {
      for (const [prop, v] of entries) search.append(`${key}[${prop}]`, v)
    } else if (style?.explode === false) {
      // `form` + `explode: false`: `key=p1,v1,p2,v2`.
      if (entries.length > 0) search.append(key, entries.flat().join(DELIMITER[kind]))
    } else {
      // `form` + `explode: true` (OpenAPI's DEFAULT for a query object): each
      // property becomes its own parameter and the object's name disappears.
      for (const [prop, v] of entries) search.append(prop, v)
    }
    return
  }
  search.append(key, String(value))
}

/** Full resolution: base + path + params + query. */
export function buildUrl(
  baseUrl: string | undefined,
  path: string,
  params: PathParams | undefined,
  query: QueryParams | undefined,
  styles?: Readonly<Record<string, QueryStyle>>,
): string {
  const withParams = applyPathParams(path, params)
  const joined = joinUrl(baseUrl, withParams)
  const qs = buildQuery(query, styles)
  if (!qs) return joined
  return joined.includes('?') ? `${joined}&${qs.slice(1)}` : `${joined}${qs}`
}

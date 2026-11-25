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
  return joinPrefix(base, path) + path
}

/**
 * What {@link joinUrl} puts IN FRONT of `path`: `''` for an absolute path or an
 * empty base, else the base without a trailing slash, plus the `/` a
 * slash-less path needs. Split out so a caller that assembles the path from
 * pieces (the native lowering, whose path may hold runtime values) prefixes
 * EXACTLY what the web does — only the path's FIRST character and whether it
 * is absolute decide the prefix.
 */
export function joinPrefix(base: string | undefined, path: string): string {
  if (!base || isAbsoluteUrl(path)) return ''
  const b = base.endsWith('/') ? base.slice(0, -1) : base

  return path.startsWith('/') ? b : `${b}/`
}

/**
 * `:name` placeholders, plus the `\\:` escape for a LITERAL colon.
 *
 * ONE shared instance. A `g`-flagged RegExp carries `lastIndex`, but
 * `String.prototype.replace` resets it to 0 before matching and collects every
 * match BEFORE calling the replacer — so neither a throwing replacer nor a
 * re-entrant `applyPathParams` (a param whose `toString` builds another path)
 * can observe or disturb a stale `lastIndex`. Locked by `url.test.ts`.
 */
const PATH_TOKEN = /\\:|:([A-Za-z_][A-Za-z0-9_]*)/g

/**
 * Encode ONE path-parameter value — `encodeURIComponent`, plus the one value
 * class it leaves able to leave its segment: a value that is exactly `.` or
 * `..`.
 *
 * `encodeURIComponent` leaves `.` alone, and the WHATWG URL parser (so
 * `fetch`, and OkHttp on Android) resolves a `.` / `..` segment as a dot
 * segment — `/orgs/acme/members/:user/sessions` with `user: '..'` reaches
 * `/orgs/acme/sessions`, with the request's credentials. Single-encoding does
 * NOT help: the parser treats `%2E` / `%2e%2E` as dot segments too. So the dots
 * are encoded TWICE (`%252E`): the server decodes that to the literal text
 * `%2E`, an identifier that addresses no resource, and the request can never
 * reach a different endpoint. Every other value is byte-identical to
 * `encodeURIComponent` (and to the native runtimes' `PyreonURL.encodePathParam`,
 * which apply the same rule — one source file must produce one URL).
 */
export function encodePathParam(value: string): string {
  if (value === '.') return '%252E'
  if (value === '..') return '%252E%252E'
  return encodeURIComponent(value)
}

/**
 * Where a URL's PATH part ends: the index of the first `?` (query) or `#`
 * (fragment), or the length when it has neither. `:name` placeholders are read
 * ONLY before this point, so a colon in a hand-written query string or
 * fragment (`/search?at=10:30`, `/search?tag=a:b`, `/doc#x:y`) is passed
 * through as written instead of being read as a parameter the caller never
 * declared. The type-level `PathParamNames` and the native lowering (the
 * `@pyreon/http/native-plugin` resolver) cut at the same point — one source
 * file must produce one URL on every target.
 */
export function pathPartEnd(url: string): number {
  // The authority (`scheme://host`) cannot hold `?` or `#` — either ends it —
  // so the first one is always where the path part ends.
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  if (q === -1) return h === -1 ? url.length : h

  return h === -1 || q < h ? q : h
}

/**
 * Where a URL's PATH part STARTS: after `scheme://authority` for an absolute
 * URL (`https://u:pw@[2001:db8::1]:8080/x` → the `/x`), after `//authority` for
 * a network-path reference, else 0. The authority's colons (a port, IPv6
 * literal, `user:password`) are never placeholders; it ends at the first `/`,
 * `?` or `#`. The same cut as {@link pathPartEnd}, on the other side.
 */
export function pathPartStart(url: string): number {
  let i: number
  if (url.startsWith('//')) i = 2
  else {
    const m = ABSOLUTE_RE.exec(url)
    if (m === null) return 0
    i = m[0].length
  }
  for (; i < url.length; i++) {
    const c = url.charCodeAt(i)
    if (c === 47 /* / */ || c === 63 /* ? */ || c === 35 /* # */) return i
  }

  return url.length
}

/** The `\\:` escape — the only token the authority / query / fragment still read. */
const ESCAPED_COLON = /\\:/g

/** Template text OUTSIDE the path part, as sent: as written, `\\:` read as `:`. */
export function literalTemplateText(text: string): string {
  return text.includes('\\') ? text.replace(ESCAPED_COLON, ':') : text
}

/**
 * The query/fragment tail of a path template (from `end`, see
 * {@link pathPartEnd}) as it is SENT: written as-is, except that the `\\:`
 * escape still reads as a colon — so a template built with every colon escaped
 * (the workaround callers used before placeholders stopped at the path) keeps
 * producing the same URL. Shared with the native lowering.
 */
export function pathTemplateTail(template: string, end: number): string {
  return end >= template.length ? '' : literalTemplateText(template.slice(end))
}

/**
 * Substitute `:name` placeholders. Values go through {@link encodePathParam}
 * (`encodeURIComponent`, with `.` / `..` made inert), so an id containing
 * `/` or `?` — or an id that IS a dot segment — can never break out of its
 * segment.
 *
 * `\\:` writes a LITERAL colon — the escape for paths such as Google's custom
 * verbs, `/v1/:name\\:cancel`, where an unescaped `:cancel` would read as a
 * second parameter. The type-level `PathParamNames` honours the same
 * escape, so the two can never disagree about what the caller must supply.
 *
 * Only the PATH part is read (see {@link pathPartStart} / {@link pathPartEnd}):
 * a `:` in the authority (`http://[::1]:8080`, `https://u:pw@h`), the query
 * string or the fragment is never a placeholder, so `/search?tag=a:b` is sent
 * as written. Structured query values belong in the `query` option.
 *
 * Throws on a missing param rather than leaving a literal `:id` in the URL
 * — a silently-malformed request is far harder to diagnose than a throw.
 */
export function applyPathParams(path: string, params: PathParams | undefined): string {
  if (!path.includes(':')) return path
  const start = pathPartStart(path)
  const end = pathPartEnd(path)
  const tail = pathTemplateTail(path, end)
  if (process.env.NODE_ENV !== 'production' && params) warnUnreadPlaceholders(path, end, params)

  return literalTemplateText(path.slice(0, start)) + path.slice(start, end).replace(PATH_TOKEN, (_match, name: string | undefined) => {
    if (name === undefined) return ':'
    const value = params?.[name]
    if (value === undefined || value === null) {
      throw new Error(
        `[Pyreon] http: path "${path}" needs the parameter "${name}" but it was not supplied. ` +
          `Pass it as \`{ params: { ${name}: … } }\`, or write \`\\\\:\` for a literal colon.`,
      )
    }
    return encodePathParam(String(value))
  }) + tail
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

type Scalar = string | number | bigint | boolean

function scalars(values: readonly (Scalar | null | undefined)[]): string[] {
  const out: string[] = []
  for (const v of values) if (v !== undefined && v !== null) out.push(String(v))
  return out
}

const DELIMITER = { form: ',', spaceDelimited: ' ', pipeDelimited: '|', tabDelimited: '\t' } as const

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
  // path + query + FRAGMENT: the query goes before a `#fragment` written in the
  // template — appended after it, it became part of the fragment, which is
  // never sent, so the server saw no query at all (`/doc#x?a=1`). A path
  // param VALUE can never contribute a `#` (`encodePathParam` encodes it).
  const hash = joined.indexOf('#')
  const head = hash === -1 ? joined : joined.slice(0, hash)
  const fragment = hash === -1 ? '' : joined.slice(hash)

  return (head.includes('?') ? `${head}&${qs.slice(1)}` : `${head}${qs}`) + fragment
}

/**
 * A key scope with every `bigint` replaced by its decimal digits.
 *
 * A query key is HASHED — `@pyreon/query` (TanStack) runs it through
 * `JSON.stringify`, which THROWS on a `bigint` — and serialized for SSR
 * hydration, so an int64 path/query parameter would otherwise make the whole
 * query fail before it fetched. The digits are exactly what the URL carries,
 * so `{ id: 5n }` and `{ id: '5' }` share a cache entry: they are the same
 * request. Allocates only when a bigint is present; params are one level deep
 * and a query value at most an array or a flat object (`QueryValue`).
 */
export function keySafeScope(record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  let out: Record<string, unknown> | undefined
  for (const k of Object.keys(record)) {
    const v = record[k]
    const safe = keySafeValue(v)
    if (safe !== v) (out ??= { ...record })[k] = safe
  }
  return out ?? record
}

function keySafeValue(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) {
    return v.some((x) => typeof x === 'bigint') ? v.map((x) => (typeof x === 'bigint' ? x.toString() : x)) : v
  }
  if (v !== null && typeof v === 'object') return keySafeScope(v as Record<string, unknown>)
  return v
}

/**
 * Dev-only: a `:name` AFTER the path part is sent as written — but when the
 * caller ALSO passed `params.name`, they almost certainly meant a placeholder
 * (`/items?tenant=:tenant`), and the value would silently go nowhere.
 */
function warnUnreadPlaceholders(path: string, end: number, params: PathParams): void {
  if (end >= path.length) return
  const tail = path.slice(end)
  for (const m of tail.matchAll(/(?<!\\):([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1] as string
    if (params[name] !== undefined && process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon] http: "${path}" passes \`params.${name}\`, but \`:${name}\` sits in the query string or fragment, ` +
          `where placeholders are not read (only the path part is) — it is sent as written. ` +
          `Pass the value through \`query: { … }\` instead.`,
      )
    }
  }
}

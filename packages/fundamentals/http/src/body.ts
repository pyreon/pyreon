/**
 * Request-body encodings beyond JSON: `form` (application/x-www-form-urlencoded),
 * `multipart` (multipart/form-data) and `cookies`.
 *
 * These exist because a large share of real APIs do not take JSON. Stripe and
 * Twilio accept ONLY form-encoded mutation bodies, and file uploads are
 * multipart everywhere. A client that can only say `json:` makes every such
 * call wrong on the wire -- the request goes out, the server rejects or
 * ignores the body.
 *
 * The form rules follow OpenAPI's Encoding Object, which is what a spec
 * declares and what a generator reading that spec can carry through: per-field
 * `style` (`form`, `deepObject`, `spaceDelimited`, `pipeDelimited`) and
 * `explode`, defaulting to `form` + `explode: true` -- OpenAPI's default for
 * `application/x-www-form-urlencoded`.
 */

/** A scalar a form field or cookie can carry. `null`/`undefined` are omitted. */
export type FormScalar = string | number | boolean | null | undefined

/** A form value: a scalar, or an array / object of form values (nested). */
export type FormValue = FormScalar | Date | readonly FormValue[] | { readonly [key: string]: FormValue }

/** Fields of an `application/x-www-form-urlencoded` body. */
export type FormFields = Readonly<Record<string, FormValue>>

/** A multipart part value: a form value, or a file. */
export type MultipartValue = FormValue | Blob | readonly (FormScalar | Blob)[]

/** Fields of a `multipart/form-data` body. */
export type MultipartFields = Readonly<Record<string, MultipartValue>>

/**
 * How one form field is serialized -- OpenAPI's Encoding Object.
 *
 * - `form` + `explode` (the default): arrays repeat the key (`t=a&t=b`), an
 *   object spreads its properties (`a=1&b=2`).
 * - `form` without `explode`: comma-joined (`t=a,b`, `o=a,1,b,2`).
 * - `deepObject`: brackets (`o[a]=1`, nested `o[a][b]=1`, arrays indexed
 *   `o[0]=x`) -- the style Stripe declares for every nested field.
 * - `spaceDelimited` / `pipeDelimited`: arrays joined with ` ` / `|`.
 */
export interface FormFieldEncoding {
  style?: 'form' | 'deepObject' | 'spaceDelimited' | 'pipeDelimited' | undefined
  explode?: boolean | undefined
}

function scalar(v: FormScalar | Date): string | undefined {
  if (v === null || v === undefined) return undefined
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function isPlainObject(v: unknown): v is Record<string, FormValue> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Blob)
}

/** Bracket notation, recursively: `o[a][b]=1`, arrays indexed `o[a][0]=x`. */
function appendDeep(out: URLSearchParams, key: string, value: FormValue): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => appendDeep(out, `${key}[${i}]`, item as FormValue))
    return
  }
  if (isPlainObject(value)) {
    for (const k of Object.keys(value)) appendDeep(out, `${key}[${k}]`, value[k] as FormValue)
    return
  }
  const s = scalar(value as FormScalar | Date)
  if (s !== undefined) out.append(key, s)
}

/**
 * Encode fields as `application/x-www-form-urlencoded`.
 *
 * `null` / `undefined` entries are DROPPED, never sent as the text `"null"` --
 * the same rule the query-string builder follows. A nested value under the
 * default `form` style has no OpenAPI spelling, so it falls back to brackets
 * rather than being flattened into `[object Object]`.
 *
 * @example
 * ```ts
 * encodeForm({ amount: 2000, metadata: { order: 'A1' }, expand: ['customer'] }, {
 *   metadata: { style: 'deepObject', explode: true },
 *   expand: { style: 'deepObject', explode: true },
 * })
 * // "amount=2000&metadata%5Border%5D=A1&expand%5B0%5D=customer"
 * ```
 */
export function encodeForm(
  fields: FormFields,
  encoding: Readonly<Record<string, FormFieldEncoding>> = {},
): URLSearchParams {
  const out = new URLSearchParams()
  for (const key of Object.keys(fields)) {
    const value = fields[key] as FormValue
    if (value === null || value === undefined) continue
    const enc = encoding[key] ?? {}
    const style = enc.style ?? 'form'
    const explode = enc.explode ?? style === 'form'
    if (style === 'deepObject') {
      appendDeep(out, key, value)
      continue
    }
    if (Array.isArray(value)) {
      const items = (value as readonly FormValue[]).filter((v) => v !== null && v !== undefined)
      if (items.some((v) => Array.isArray(v) || isPlainObject(v))) {
        appendDeep(out, key, value)
        continue
      }
      const strings = items.map((v) => scalar(v as FormScalar | Date) as string)
      if (style === 'spaceDelimited') out.append(key, strings.join(' '))
      else if (style === 'pipeDelimited') out.append(key, strings.join('|'))
      else if (explode) for (const s of strings) out.append(key, s)
      else out.append(key, strings.join(','))
      continue
    }
    if (isPlainObject(value)) {
      const entries = Object.keys(value).filter((k) => value[k] !== null && value[k] !== undefined)
      if (explode) {
        for (const k of entries) {
          const inner = value[k] as FormValue
          if (Array.isArray(inner) || isPlainObject(inner)) appendDeep(out, k, inner)
          else out.append(k, scalar(inner as FormScalar | Date) as string)
        }
      } else {
        out.append(key, entries.flatMap((k) => [k, scalar(value[k] as FormScalar | Date) as string]).join(','))
      }
      continue
    }
    // Nullish values were skipped at the top of the loop.
    out.append(key, scalar(value as FormScalar | Date) as string)
  }
  return out
}

/**
 * Encode fields as `multipart/form-data`.
 *
 * A `Blob` / `File` becomes a file part; an array repeats the field; an object
 * becomes a JSON text part (OpenAPI's default content type for an object
 * property in a multipart body). `null` / `undefined` are omitted. The
 * `Content-Type` header is left to the platform, which alone knows the
 * boundary it generated.
 *
 * @example
 * ```ts
 * encodeMultipart({ file: new File(['x'], 'a.txt'), purpose: 'assistants' })
 * ```
 */
export function encodeMultipart(fields: MultipartFields): FormData {
  const out = new FormData()
  const put = (key: string, value: unknown): void => {
    if (value === null || value === undefined) return
    if (value instanceof Blob) out.append(key, value)
    else if (value instanceof Date) out.append(key, value.toISOString())
    else if (typeof value === 'object') out.append(key, JSON.stringify(value))
    else out.append(key, String(value))
  }
  for (const key of Object.keys(fields)) {
    const value = fields[key]
    if (Array.isArray(value)) for (const item of value) put(key, item)
    else put(key, value)
  }
  return out
}

/**
 * Serialize cookies into a `Cookie` header value. Nullish entries are omitted;
 * values are percent-encoded.
 *
 * Note a BROWSER will not send it: `Cookie` is a forbidden request header, and
 * `fetch` drops it silently. Cookies from a page travel via
 * `credentials: 'include'`; this is for server-side and native callers.
 *
 * @example
 * ```ts
 * encodeCookies({ session: 'abc', theme: 'dark' }) // "session=abc; theme=dark"
 * ```
 */
export function encodeCookies(cookies: Readonly<Record<string, FormScalar>>): string {
  const parts: string[] = []
  for (const key of Object.keys(cookies)) {
    const v = scalar(cookies[key])
    if (v !== undefined) parts.push(`${key}=${encodeURIComponent(v)}`)
  }
  return parts.join('; ')
}

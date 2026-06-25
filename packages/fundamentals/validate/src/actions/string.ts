/**
 * Tree-shakeable string check ACTIONS for `@pyreon/validate/mini`.
 *
 * Each is the standalone, function-composition twin of a `StringSchema` method
 * — `pipe(string(), email())` / `string().check(email())` instead of
 * `s.string().email()` — and pushes the byte-identical op (parity-locked).
 * Importing `email` pulls only the email regex (the shared `validateEmail`),
 * never the other 16 string formats.
 */
import type { CheckOpts } from '../core/ops'
import type { Action } from '../core/schema'
import { resolveFormat } from '../core/registry'
import { type EmailPrecision, URL_RE, UUID_RE, validateEmail } from '../primitives/string'
import { defineCheck, defineTransform } from './_core'

export type { EmailPrecision }

// ─── Length ────────────────────────────────────────────────────────────────

/** Minimum length (inclusive). */
export const minLength = (n: number, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:min', n, opts },
    (v) => typeof v !== 'string' || v.length >= n,
    (v) => ({
      code: 'too_small',
      message: `Must be at least ${n} characters`,
      key: 'validate.string.too-short',
      params: { min: n, actual: v.length },
    }),
  )

/** Maximum length (inclusive). */
export const maxLength = (n: number, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:max', n, opts },
    (v) => typeof v !== 'string' || v.length <= n,
    (v) => ({
      code: 'too_big',
      message: `Must be at most ${n} characters`,
      key: 'validate.string.too-long',
      params: { max: n, actual: v.length },
    }),
  )

/** Exact length. */
export const length = (n: number, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:length', n, opts },
    (v) => typeof v !== 'string' || v.length === n,
    (v) => ({
      code: 'wrong_size',
      message: `Must be exactly ${n} characters`,
      key: 'validate.string.wrong-length',
      params: { length: n, actual: v.length },
    }),
  )

/** At least one character — `minLength(1)`. */
export const nonEmpty = (opts?: CheckOpts): Action<string> => minLength(1, opts)

// ─── Format ──────────────────────────────────────────────────────────────────

/** Match a regular expression. */
export const regex = (re: RegExp, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:regex', re, opts },
    (v) => typeof v !== 'string' || re.test(v),
    {
      code: 'invalid_format',
      message: 'Invalid format',
      key: 'validate.string.regex-mismatch',
      params: { pattern: re.source },
    },
  )

/**
 * Email. Defaults to `'standard'` precision; pass `{ precision: 'html5' }` or
 * `'rfc5322'`. Honours the `@pyreon/validate/server` format upgrade transparently.
 */
export const email = (opts?: CheckOpts & { precision?: EmailPrecision }): Action<string> => {
  const precision = opts?.precision ?? 'standard'
  const light = (v: string): boolean => validateEmail(v, precision)
  return defineCheck<string>(
    { kind: 'check:string:email', opts },
    (v) => typeof v !== 'string' || resolveFormat('email', light)(v),
    { code: 'invalid_format', message: 'Invalid email', key: 'validate.string.email' },
  )
}

/** HTTP(S) URL. */
export const url = (opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:url', opts },
    (v) => typeof v !== 'string' || resolveFormat('url', (s: string) => URL_RE.test(s))(v),
    { code: 'invalid_format', message: 'Invalid URL', key: 'validate.string.url' },
  )

/** UUID (v1–v5). */
export const uuid = (opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:uuid', opts },
    (v) => typeof v !== 'string' || resolveFormat('uuid', (s: string) => UUID_RE.test(s))(v),
    { code: 'invalid_format', message: 'Invalid UUID', key: 'validate.string.uuid' },
  )

// ─── Position ────────────────────────────────────────────────────────────────

/** Must start with `prefix`. */
export const startsWith = (prefix: string, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:starts-with', s: prefix, opts },
    (v) => typeof v !== 'string' || v.startsWith(prefix),
    {
      code: 'invalid_format',
      message: `Must start with "${prefix}"`,
      key: 'validate.string.starts-with',
      params: { prefix },
    },
  )

/** Must end with `suffix`. */
export const endsWith = (suffix: string, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:ends-with', s: suffix, opts },
    (v) => typeof v !== 'string' || v.endsWith(suffix),
    {
      code: 'invalid_format',
      message: `Must end with "${suffix}"`,
      key: 'validate.string.ends-with',
      params: { suffix },
    },
  )

/** Must contain `substring`. */
export const includes = (substring: string, opts?: CheckOpts): Action<string> =>
  defineCheck<string>(
    { kind: 'check:string:includes', s: substring, opts },
    (v) => typeof v !== 'string' || v.includes(substring),
    {
      code: 'invalid_format',
      message: `Must contain "${substring}"`,
      key: 'validate.string.includes',
      params: { substring },
    },
  )

// ─── Transforms ──────────────────────────────────────────────────────────────

/** Trim leading + trailing whitespace. */
export const trim = (): Action<string> =>
  defineTransform<string>((v) => (typeof v === 'string' ? v.trim() : v))

/** Lowercase. */
export const toLowerCase = (): Action<string> =>
  defineTransform<string>((v) => (typeof v === 'string' ? v.toLowerCase() : v))

/** Uppercase. */
export const toUpperCase = (): Action<string> =>
  defineTransform<string>((v) => (typeof v === 'string' ? v.toUpperCase() : v))

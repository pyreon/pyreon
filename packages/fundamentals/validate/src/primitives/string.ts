/**
 * `StringSchema` — chainable string validator.
 *
 * Built-in checks: `min`, `max`, `length`, `regex`, `email`, `url`,
 * `uuid`, `iso.date`, `iso.dateTime`, `iso.time`, `startsWith`,
 * `endsWith`, `includes`, `toLowerCase`, `toUpperCase`, `trim`,
 * `nonEmpty`.
 *
 * Each method appends an Op to `_ops` and returns `this` for chaining.
 * The compiler in `core/schema.ts` runs every check in order.
 */

import { typeIssue } from '../core/issue'
import type { CheckOpts, ParseCtx } from '../core/ops'
import { resolveFormat } from '../core/registry'
import { Schema as SchemaBase, attachCheck, makeCheckIssue, type Schema } from '../core/schema'

// ─── Email precision tiers (server/client split) ──────────────────────
// `.email()` defaults to the 'standard' tier — the modern consensus regex
// (matches Zod 4 / Valibot): requires a 2+ char TLD, rejects leading and
// consecutive dots. Three tiers trade permissiveness for strictness so a
// server can validate more strictly than the client. The heavier tier is
// still just a regex + a length check (a few hundred bytes), so it never
// bloats a client bundle the way a DNS-MX / disposable-domain check would;
// for *those* heavier server-only checks, compose `.refine()` server-side
// (a `@pyreon/validate/server` async validator is the documented next step).
//   - 'html5'    — exactly what the browser's <input type=email> accepts
//                  (lenient: allows a single-char TLD like a@b.c).
//   - 'standard' — DEFAULT. Zod-4-grade: 2+ char alpha TLD, no leading /
//                  consecutive dots.
//   - 'rfc5322'  — 'standard' + RFC 5321 length limits (local <=64,
//                  domain <=255, total <=254). For server-authoritative checks.
export type EmailPrecision = 'html5' | 'standard' | 'rfc5322'

/** HTML5 `<input type=email>` WHATWG pattern — lenient (allows 1-char TLD). */
export const EMAIL_HTML5_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

// Email RFC 5322 isn't fully parseable by regex; the 'standard' default
// below is the modern consensus (Zod 4 / Valibot) — requires a 2+ char
// alpha TLD, forbids leading / consecutive dots. Replaces the pre-2026-06
// loose `^[^\s@]+@[^\s@]+\.[^\s@]+$`, which wrongly accepted `a@b.c` (and
// most garbage) — looser than every other major validator.
export const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/

/**
 * Validate an email string at the given precision. Pure + allocation-free
 * on the hot path. Exported so the server tier / custom checks can reuse it.
 */
export function validateEmail(value: string, precision: EmailPrecision = 'standard'): boolean {
  if (precision === 'html5') return EMAIL_HTML5_RE.test(value)
  if (!EMAIL_RE.test(value)) return false
  if (precision === 'rfc5322') {
    if (value.length > 254) return false // RFC 5321 total length
    const at = value.lastIndexOf('@')
    if (at > 64) return false // local part > 64 chars
    if (value.length - at - 1 > 255) return false // domain > 255 chars
  }
  return true
}

export const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
export const ISO_TIME_RE = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/

// ─── Lightweight (client) format validators ────────────────────────────
// Small + fast + in-bundle. The server upgrades phone (and email) to
// superior validators via `@pyreon/validate/server` — these are the
// client defaults the registry falls back to.

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV6_RE = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/
const PHONE_SEP_RE = /[\s().-]/g
const PHONE_E164_RE = /^\+?[1-9]\d{6,14}$/

/** Lightweight phone check — normalize common separators, then E.164 shape. */
export function validatePhone(value: string): boolean {
  return PHONE_E164_RE.test(value.replace(PHONE_SEP_RE, ''))
}

/** IPv4 or IPv6 (regex; sufficient on both client and server). */
export function validateIp(value: string): boolean {
  return IPV4_RE.test(value) || IPV6_RE.test(value)
}

/** Credit-card: 12–19 digits (separators stripped) + Luhn checksum. */
export function validateCreditCard(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '')
  if (!/^\d{12,19}$/.test(digits)) return false
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0
}

export class StringSchema extends SchemaBase<string> {
  readonly _kind = 'string' as const

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'string') {
      ctx.issues.push(typeIssue('string', input, ctx.path))
      return input
    }
    return input
  }

  // ─── Length checks ─────────────────────────────────────────────────

  min(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:min', n, opts }, (value, ctx) => {
        if (typeof value !== 'string' || value.length >= n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_small',
            `Must be at least ${n} characters`,
            'validate.string.too-short',
            { min: n, actual: value.length },
            `Must be at least ${n} characters`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  max(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:max', n, opts }, (value, ctx) => {
        if (typeof value !== 'string' || value.length <= n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            `Must be at most ${n} characters`,
            'validate.string.too-long',
            { max: n, actual: value.length },
            `Must be at most ${n} characters`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  length(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:length', n, opts }, (value, ctx) => {
        if (typeof value !== 'string' || value.length === n) return
        ctx.issues.push(
          makeCheckIssue(
            'wrong_size',
            `Must be exactly ${n} characters`,
            'validate.string.wrong-length',
            { length: n, actual: value.length },
            `Must be exactly ${n} characters`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  nonEmpty(opts?: CheckOpts): this {
    return this.min(1, opts)
  }

  // ─── Format checks ─────────────────────────────────────────────────

  regex(re: RegExp, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:regex', re, opts }, (value, ctx) => {
        if (typeof value !== 'string' || re.test(value)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            'Invalid format',
            'validate.string.regex-mismatch',
            { pattern: re.source },
            'Invalid format',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /**
   * Validate an email address. Defaults to the `'standard'` precision
   * (Zod-4-grade — 2+ char TLD, no leading/consecutive dots). Pass
   * `{ precision: 'html5' }` for browser-lenient matching, or
   * `{ precision: 'rfc5322' }` for server-authoritative strictness
   * (adds RFC 5321 length limits). The client typically uses the default
   * for fast UX; the server can opt into `'rfc5322'` (and add `.refine()`
   * for DNS / disposable-domain checks) since bundle size doesn't matter
   * server-side.
   */
  /**
   * Validate an email. Lightweight by default (the `precision` regex —
   * what ships to the client). If `@pyreon/validate/server` has been
   * imported, the SAME check automatically uses the superior server
   * validator (strict RFC + disposable-domain list) instead — the
   * client/server split, transparent to the schema. See `EmailPrecision`.
   */
  email(opts?: CheckOpts & { precision?: EmailPrecision }): this {
    const precision = opts?.precision ?? 'standard'
    const light = (v: string): boolean => validateEmail(v, precision)
    this._ops.push(
      attachCheck({ kind: 'check:string:email', opts }, (value, ctx) => {
        if (typeof value !== 'string') return
        if (resolveFormat('email', light)(value)) return
        ctx.issues.push(
          makeCheckIssue('invalid_format', 'Invalid email', 'validate.string.email', {}, 'Invalid email', ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /**
   * Validate a phone number. Lightweight by default — a normalized E.164
   * shape check (`+?` then 7–15 digits; common separators stripped). This
   * is what ships to the client. The server (`@pyreon/validate/server`)
   * upgrades the SAME check to superior region-aware / `libphonenumber`-
   * grade validation, which never enters the client bundle. The textbook
   * client/server-split format: full phone validation is far too heavy to
   * ship to the browser.
   */
  phone(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:phone', opts }, (value, ctx) => {
        if (typeof value !== 'string') return
        if (resolveFormat('phone', validatePhone)(value)) return
        ctx.issues.push(
          makeCheckIssue('invalid_format', 'Invalid phone number', 'validate.string.phone', {}, 'Invalid phone number', ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Validate an IPv4 or IPv6 address. Regex-based (sufficient client + server). */
  ip(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:ip', opts }, (value, ctx) => {
        if (typeof value !== 'string') return
        if (resolveFormat('ip', validateIp)(value)) return
        ctx.issues.push(
          makeCheckIssue('invalid_format', 'Invalid IP address', 'validate.string.ip', {}, 'Invalid IP address', ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Validate a credit-card number (Luhn checksum + 12–19 digits, separators stripped). */
  creditCard(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:creditcard', opts }, (value, ctx) => {
        if (typeof value !== 'string') return
        if (resolveFormat('creditcard', validateCreditCard)(value)) return
        ctx.issues.push(
          makeCheckIssue('invalid_format', 'Invalid card number', 'validate.string.creditcard', {}, 'Invalid card number', ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  url(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:url', opts }, (value, ctx) => {
        if (typeof value !== 'string' || URL_RE.test(value)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            'Invalid URL',
            'validate.string.url',
            {},
            'Invalid URL',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  uuid(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:uuid', opts }, (value, ctx) => {
        if (typeof value !== 'string' || UUID_RE.test(value)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            'Invalid UUID',
            'validate.string.uuid',
            {},
            'Invalid UUID',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /**
   * ISO date helpers grouped under a sub-namespace for ergonomic API.
   * `s.string().iso.date()` reads naturally; ditto `.iso.dateTime()` /
   * `.iso.time()`.
   */
  readonly iso = {
    date: (opts?: CheckOpts): this => {
      this._ops.push(
        attachCheck({ kind: 'check:string:iso:date', opts }, (value, ctx) => {
          if (typeof value !== 'string' || ISO_DATE_RE.test(value)) return
          ctx.issues.push(
            makeCheckIssue(
              'invalid_format',
              'Invalid ISO date (YYYY-MM-DD)',
              'validate.string.iso-date',
              {},
              'Invalid ISO date (YYYY-MM-DD)',
              ctx,
              opts,
            ),
          )
        }),
      )
      this._invalidateCompile()
      return this
    },
    dateTime: (opts?: CheckOpts): this => {
      this._ops.push(
        attachCheck({ kind: 'check:string:iso:datetime', opts }, (value, ctx) => {
          if (typeof value !== 'string' || ISO_DATETIME_RE.test(value)) return
          ctx.issues.push(
            makeCheckIssue(
              'invalid_format',
              'Invalid ISO datetime',
              'validate.string.iso-datetime',
              {},
              'Invalid ISO datetime',
              ctx,
              opts,
            ),
          )
        }),
      )
      this._invalidateCompile()
      return this
    },
    time: (opts?: CheckOpts): this => {
      this._ops.push(
        attachCheck({ kind: 'check:string:iso:time', opts }, (value, ctx) => {
          if (typeof value !== 'string' || ISO_TIME_RE.test(value)) return
          ctx.issues.push(
            makeCheckIssue(
              'invalid_format',
              'Invalid ISO time (HH:MM:SS)',
              'validate.string.iso-time',
              {},
              'Invalid ISO time (HH:MM:SS)',
              ctx,
              opts,
            ),
          )
        }),
      )
      this._invalidateCompile()
      return this
    },
  }

  // ─── Substring checks ──────────────────────────────────────────────

  startsWith(s: string, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:starts-with', s, opts }, (value, ctx) => {
        if (typeof value !== 'string' || value.startsWith(s)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            `Must start with "${s}"`,
            'validate.string.starts-with',
            { prefix: s },
            `Must start with "${s}"`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  endsWith(s: string, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:ends-with', s, opts }, (value, ctx) => {
        if (typeof value !== 'string' || value.endsWith(s)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            `Must end with "${s}"`,
            'validate.string.ends-with',
            { suffix: s },
            `Must end with "${s}"`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  includes(s: string, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:includes', s, opts }, (value, ctx) => {
        if (typeof value !== 'string' || value.includes(s)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            `Must contain "${s}"`,
            'validate.string.includes',
            { substring: s },
            `Must contain "${s}"`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  // ─── String transforms ─────────────────────────────────────────────
  // These differ from `.transform(fn)` in that they're declarative — the
  // op carries no closure, so the compiler can recognise + reorder them
  // (e.g. push `trim` before `min` so `'  hi  '.length >= 2` works the
  // way users expect). For v1 we just apply them as inline transforms.

  /** Lowercase the input. Runs after type-check, before further checks. */
  toLowerCase(): this {
    // The non-string ternary arm is defensive — transforms run after the
    // type-check, so `v` is always a string here.
    /* v8 ignore next */
    this._ops.push({ kind: 'transform', fn: (v) => (typeof v === 'string' ? v.toLowerCase() : v) })
    this._invalidateCompile()
    return this
  }

  /** Uppercase the input. */
  toUpperCase(): this {
    // The non-string ternary arm is defensive — transforms run after the
    // type-check, so `v` is always a string here.
    /* v8 ignore next */
    this._ops.push({ kind: 'transform', fn: (v) => (typeof v === 'string' ? v.toUpperCase() : v) })
    this._invalidateCompile()
    return this
  }

  /** Trim whitespace from both ends. */
  trim(): this {
    // The non-string ternary arm is defensive — transforms run after the
    // type-check, so `v` is always a string here.
    /* v8 ignore next */
    this._ops.push({ kind: 'transform', fn: (v) => (typeof v === 'string' ? v.trim() : v) })
    this._invalidateCompile()
    return this
  }
}

/**
 * Function-comp form of `s.string()` — for use with `pipe()` and as a
 * standalone shorthand.
 *
 * @example
 * ```ts
 * import { string, email } from '@pyreon/validate'
 * const schema = string().email()  // identical to s.string().email()
 * ```
 */
export function string(): StringSchema {
  return new StringSchema()
}

// Re-export the base type so consumers can reference `Schema<string>` if needed.
export type { Schema }

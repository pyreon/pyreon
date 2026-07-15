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
import type { CheckOpts, Op, ParseCtx } from '../core/ops'
import { makeFormatResolver, type FormatValidator } from '../core/registry'
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

// ─── Table-driven email scanner (the hot 'standard' path) ─────────────────
// Byte-identical verdict to EMAIL_RE (locked by the exhaustive + fuzz
// differential in `email-scan-equivalence.test.ts`), ~1.6× faster: the regex
// pays the `(?!.*\.\.)` whole-string lookahead + a capturing-group pass; the
// scanner is one linear charcode walk over a 128-slot bitflag table. The
// email check is THE hot format in real payloads (it sits inside the bench's
// object rows too), so it gets the hand-tuned path; every other format stays
// a regex. Bitflags: 1 = local char `[A-Za-z0-9_'+-]`, 2 = local END char
// (local minus `'`), 4 = alpha (TLD), 8 = alnum (label start), 16 = label
// char (alnum + `-`).
const EMAIL_CT = new Uint8Array(128)
for (let c = 48; c <= 57; c++) EMAIL_CT[c] = 1 | 2 | 8 | 16 // 0-9
for (let c = 65; c <= 90; c++) EMAIL_CT[c] = 1 | 2 | 4 | 8 | 16 // A-Z
for (let c = 97; c <= 122; c++) EMAIL_CT[c] = 1 | 2 | 4 | 8 | 16 // a-z
EMAIL_CT[95] = 1 | 2 // _
EMAIL_CT[43] = 1 | 2 // +
EMAIL_CT[45] = 1 | 2 | 16 // -
EMAIL_CT[39] = 1 // '

/**
 * Linear-scan equivalent of `EMAIL_RE.test(value)` — same grammar:
 * local part = `[A-Za-z0-9_'+-.]` runs with no leading/consecutive dots,
 * last char before `@` in `[A-Za-z0-9_+-]`; domain = 1+ labels
 * (`[A-Za-z0-9][A-Za-z0-9-]*` + `.`) then an alpha TLD of 2+ chars.
 * A charcode > 127 indexes past the table -> `undefined & flag` is falsy ->
 * reject (matches the regex: no non-ASCII anywhere).
 */
function isEmailStandard(v: string): boolean {
  const len = v.length
  let i = 0
  let prev = 0 // previous local charcode; 0 = at start (leading dot illegal)
  let c = 0
  for (; i < len; i++) {
    c = v.charCodeAt(i)
    if (c === 64 /* @ */) break
    if (c === 46 /* . */) {
      if (prev === 0 || prev === 46) return false // leading or consecutive dot
    } else if (!((EMAIL_CT[c]! & 1) as number)) return false
    prev = c
  }
  // Non-empty local, an `@` present, last local char in the END set.
  if (i === 0 || i >= len || !((EMAIL_CT[prev]! & 2) as number)) return false
  i++ // skip @
  let segStart = i
  let lastDot = -1
  for (; i < len; i++) {
    c = v.charCodeAt(i)
    if (c === 46 /* . */) {
      if (i === segStart) return false // empty label
      if (!((EMAIL_CT[v.charCodeAt(segStart)]! & 8) as number)) return false // label starts alnum
      lastDot = i
      segStart = i + 1
    } else if (!((EMAIL_CT[c]! & 16) as number)) return false // label char: alnum | -
  }
  if (lastDot === -1) return false // at least one dot in the domain
  if (len - segStart < 2) return false // TLD >= 2 chars
  for (let k = segStart; k < len; k++) {
    if (!((EMAIL_CT[v.charCodeAt(k)]! & 4) as number)) return false // TLD alpha-only
  }
  return true
}

/**
 * Validate an email string at the given precision. Pure + allocation-free
 * on the hot path. Exported so the server tier / custom checks can reuse it.
 */
export function validateEmail(value: string, precision: EmailPrecision = 'standard'): boolean {
  if (precision === 'html5') return EMAIL_HTML5_RE.test(value)
  if (!isEmailStandard(value)) return false
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
// Modern ID / encoding formats (match Zod 4 / Valibot leniency).
// cuid2: lowercase alphanumeric, must start with a letter (the cuid2 spec).
export const CUID2_RE = /^[a-z][0-9a-z]+$/
// ulid: Crockford base32, exactly 26 chars (case-insensitive).
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i
// nanoid: URL-safe alphabet (A-Za-z0-9_-), any length (matches Zod 4).
export const NANOID_RE = /^[A-Za-z0-9_-]+$/
// emoji: one-or-more emoji code points (Unicode property escapes).
export const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component})+$/u
// base64: standard alphabet with optional `=` padding, length a multiple of 4.
export const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
// jwt: three base64url segments separated by dots (header.payload.signature).
export const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
// cuid (v1, distinct from cuid2): starts with `c`, then 8+ non-space/non-dash.
export const CUID_RE = /^c[^\s-]{8,}$/i
// base64url: URL-safe alphabet (`A-Za-z0-9_-`) with optional `=` padding.
export const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/
// ISO 8601 duration (`P…`). Forbids bare `P` / trailing `T`; linear (no
// catastrophic backtracking — every group is `\d+` + a fixed unit letter).
export const DURATION_RE =
  /^P(?!$)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?!$)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/
// E.164 phone: `+` then 1–15 digits, first non-zero.
export const E164_RE = /^\+[1-9]\d{1,14}$/
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

/**
 * CIDR — split on the LAST `/`, validate the address half against the vetted
 * `IPV4_RE`/`IPV6_RE` and the prefix half as an in-range integer (0–32 for v4,
 * 0–128 for v6). Split-and-reuse avoids a new variable-quantifier IPv6 regex
 * (the ReDoS-prone shape CodeQL flags).
 */
export function isCidr(value: string): boolean {
  const slash = value.lastIndexOf('/')
  if (slash < 0) return false
  const addr = value.slice(0, slash)
  const prefixStr = value.slice(slash + 1)
  if (!/^\d{1,3}$/.test(prefixStr)) return false
  const prefix = Number(prefixStr)
  if (IPV4_RE.test(addr)) return prefix <= 32
  if (IPV6_RE.test(addr)) return prefix <= 128
  return false
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

  /**
   * Attach a registry-routed format check (email/url/uuid/…). Builds ONE
   * memoized resolver ({@link makeFormatResolver}) shared by both paths:
   *   - `_checkFn` (interpreter) — pushes the issue with the live `ctx.path`.
   *   - `_pred` (JIT) — the pure `(value) => boolean` predicate the compiled
   *     validator calls on the VALID path (no `ctx`, no path push); the JIT
   *     invokes `_checkFn` only when `_pred` fails, so the valid path never
   *     touches the path array or the issue machinery. `_pred`'s verdict is
   *     the resolver applied to a value the JIT has already type-checked as a
   *     string — byte-identical to `_checkFn`'s "valid" condition.
   * Centralizes the identical `typeof + resolveFormat + makeCheckIssue`
   * shape every format check used to repeat inline.
   */
  private _format(
    kind: Extract<Op, { kind: `check:string:${string}`; opts?: CheckOpts | undefined }>['kind'],
    name: string,
    light: FormatValidator,
    code: string,
    message: string,
    key: string,
    fallback: string,
    opts?: CheckOpts,
    params: Readonly<Record<string, unknown>> = {},
  ): this {
    const resolve = makeFormatResolver(name, light)
    const op = attachCheck({ kind, opts } as Op, (value, ctx) => {
      if (typeof value !== 'string') return
      if (resolve(value)) return
      ctx.issues.push(makeCheckIssue(code, message, key, params, fallback, ctx, opts))
    })
    ;(op as { _pred?: FormatValidator })._pred = resolve
    this._ops.push(op)
    this._invalidateCompile()
    return this
  }

  regex(re: RegExp, opts?: CheckOpts): this {
    const op = attachCheck({ kind: 'check:string:regex', re, opts }, (value, ctx) => {
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
    })
    // JIT predicate: the value is already type-checked as a string at the
    // call site, so the pure `re.test` is the valid-condition (closure runs
    // only on failure → no valid-path issue machinery).
    ;(op as { _pred?: FormatValidator })._pred = (value: string): boolean => re.test(value)
    this._ops.push(op)
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
    return this._format(
      'check:string:email',
      'email',
      (v: string): boolean => validateEmail(v, precision),
      'invalid_format',
      'Invalid email',
      'validate.string.email',
      'Invalid email',
      opts,
    )
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
    return this._format(
      'check:string:phone',
      'phone',
      validatePhone,
      'invalid_format',
      'Invalid phone number',
      'validate.string.phone',
      'Invalid phone number',
      opts,
    )
  }

  /** Validate an IPv4 or IPv6 address. Regex-based (sufficient client + server). */
  ip(opts?: CheckOpts): this {
    return this._format(
      'check:string:ip',
      'ip',
      validateIp,
      'invalid_format',
      'Invalid IP address',
      'validate.string.ip',
      'Invalid IP address',
      opts,
    )
  }

  /** Validate a credit-card number (Luhn checksum + 12–19 digits, separators stripped). */
  creditCard(opts?: CheckOpts): this {
    return this._format(
      'check:string:creditcard',
      'creditcard',
      validateCreditCard,
      'invalid_format',
      'Invalid card number',
      'validate.string.creditcard',
      'Invalid card number',
      opts,
    )
  }

  url(opts?: CheckOpts): this {
    return this._format(
      'check:string:url',
      'url',
      (v: string): boolean => URL_RE.test(v),
      'invalid_format',
      'Invalid URL',
      'validate.string.url',
      'Invalid URL',
      opts,
    )
  }

  uuid(opts?: CheckOpts): this {
    return this._format(
      'check:string:uuid',
      'uuid',
      (v: string): boolean => UUID_RE.test(v),
      'invalid_format',
      'Invalid UUID',
      'validate.string.uuid',
      'Invalid UUID',
      opts,
    )
  }

  /** Validate a CUID2 (lowercase alphanumeric, starts with a letter). */
  cuid2(opts?: CheckOpts): this {
    return this._format(
      'check:string:cuid2',
      'cuid2',
      (v: string): boolean => CUID2_RE.test(v),
      'invalid_format',
      'Invalid CUID2',
      'validate.string.cuid2',
      'Invalid CUID2',
      opts,
    )
  }

  /** Validate a ULID (Crockford base32, 26 chars). */
  ulid(opts?: CheckOpts): this {
    return this._format(
      'check:string:ulid',
      'ulid',
      (v: string): boolean => ULID_RE.test(v),
      'invalid_format',
      'Invalid ULID',
      'validate.string.ulid',
      'Invalid ULID',
      opts,
    )
  }

  /** Validate a Nano ID (URL-safe alphabet `A-Za-z0-9_-`). */
  nanoid(opts?: CheckOpts): this {
    return this._format(
      'check:string:nanoid',
      'nanoid',
      (v: string): boolean => NANOID_RE.test(v),
      'invalid_format',
      'Invalid Nano ID',
      'validate.string.nanoid',
      'Invalid Nano ID',
      opts,
    )
  }

  /** Validate an emoji string (one or more emoji code points). */
  emoji(opts?: CheckOpts): this {
    return this._format(
      'check:string:emoji',
      'emoji',
      (v: string): boolean => EMOJI_RE.test(v),
      'invalid_format',
      'Invalid emoji',
      'validate.string.emoji',
      'Invalid emoji',
      opts,
    )
  }

  /** Validate standard base64 (alphabet `A-Za-z0-9+/`, optional `=` padding). */
  base64(opts?: CheckOpts): this {
    return this._format(
      'check:string:base64',
      'base64',
      (v: string): boolean => BASE64_RE.test(v),
      'invalid_format',
      'Invalid base64',
      'validate.string.base64',
      'Invalid base64',
      opts,
    )
  }

  /** Validate a JWT shape (three base64url segments: header.payload.signature). */
  jwt(opts?: CheckOpts): this {
    return this._format(
      'check:string:jwt',
      'jwt',
      (v: string): boolean => JWT_RE.test(v),
      'invalid_format',
      'Invalid JWT',
      'validate.string.jwt',
      'Invalid JWT',
      opts,
    )
  }

  /** Validate a cuid (v1) — starts with `c`, then 8+ non-space/non-dash chars. */
  cuid(opts?: CheckOpts): this {
    return this._format(
      'check:string:cuid',
      'cuid',
      (v: string): boolean => CUID_RE.test(v),
      'invalid_format',
      'Invalid cuid',
      'validate.string.cuid',
      'Invalid cuid',
      opts,
    )
  }

  /** Validate URL-safe base64 (alphabet `A-Za-z0-9_-`, optional `=` padding). */
  base64url(opts?: CheckOpts): this {
    return this._format(
      'check:string:base64url',
      'base64url',
      (v: string): boolean => BASE64URL_RE.test(v),
      'invalid_format',
      'Invalid base64url',
      'validate.string.base64url',
      'Invalid base64url',
      opts,
    )
  }

  /** Validate CIDR notation — IPv4 (`x.x.x.x/0-32`) or IPv6 (`…/0-128`). */
  cidr(opts?: CheckOpts): this {
    return this._format(
      'check:string:cidr',
      'cidr',
      isCidr,
      'invalid_format',
      'Invalid CIDR',
      'validate.string.cidr',
      'Invalid CIDR',
      opts,
    )
  }

  /** Validate an ISO 8601 duration (`P3Y6M4DT12H30M5S`, `PT1H`, `P1W`, …). */
  duration(opts?: CheckOpts): this {
    return this._format(
      'check:string:duration',
      'duration',
      (v: string): boolean => DURATION_RE.test(v),
      'invalid_format',
      'Invalid ISO 8601 duration',
      'validate.string.duration',
      'Invalid ISO 8601 duration',
      opts,
    )
  }

  /** Validate an E.164 phone number (`+` then 1–15 digits, first non-zero). */
  e164(opts?: CheckOpts): this {
    return this._format(
      'check:string:e164',
      'e164',
      (v: string): boolean => E164_RE.test(v),
      'invalid_format',
      'Invalid E.164 phone number',
      'validate.string.e164',
      'Invalid E.164 phone number',
      opts,
    )
  }

  /**
   * ISO date helpers grouped under a sub-namespace for ergonomic API.
   * `s.string().iso.date()` reads naturally; ditto `.iso.dateTime()` /
   * `.iso.time()`.
   */
  readonly iso = {
    date: (opts?: CheckOpts): this =>
      this._format(
        'check:string:iso:date',
        'iso-date',
        (v: string): boolean => ISO_DATE_RE.test(v),
        'invalid_format',
        'Invalid ISO date (YYYY-MM-DD)',
        'validate.string.iso-date',
        'Invalid ISO date (YYYY-MM-DD)',
        opts,
      ),
    dateTime: (opts?: CheckOpts): this =>
      this._format(
        'check:string:iso:datetime',
        'iso-datetime',
        (v: string): boolean => ISO_DATETIME_RE.test(v),
        'invalid_format',
        'Invalid ISO datetime',
        'validate.string.iso-datetime',
        'Invalid ISO datetime',
        opts,
      ),
    time: (opts?: CheckOpts): this =>
      this._format(
        'check:string:iso:time',
        'iso-time',
        (v: string): boolean => ISO_TIME_RE.test(v),
        'invalid_format',
        'Invalid ISO time (HH:MM:SS)',
        'validate.string.iso-time',
        'Invalid ISO time (HH:MM:SS)',
        opts,
      ),
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

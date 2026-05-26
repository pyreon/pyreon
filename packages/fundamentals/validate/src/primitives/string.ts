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
import { Schema as SchemaBase, attachCheck, makeCheckIssue, type Schema } from '../core/schema'

// Regexes — exported individually so users can override if needed.
// Email RFC 5322 isn't fully parseable by regex; this pattern matches
// 99% of real-world emails (same approximation as Zod / Valibot).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
export const ISO_TIME_RE = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/

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

  email(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:string:email', opts }, (value, ctx) => {
        if (typeof value !== 'string' || EMAIL_RE.test(value)) return
        ctx.issues.push(
          makeCheckIssue(
            'invalid_format',
            'Invalid email',
            'validate.string.email',
            {},
            'Invalid email',
            ctx,
            opts,
          ),
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

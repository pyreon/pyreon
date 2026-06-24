/**
 * Action builders — the small, shared kernel behind every tree-shakeable check
 * action in `@pyreon/validate/mini`. An ACTION is a `(schema) => schema` that
 * pushes ONE op onto the schema in place; it is byte-equivalent to the op the
 * corresponding chainable method pushes (parity-locked by
 * `tests/actions-parity.test.ts`). Because actions live in their own modules and
 * reference only the validators they need, importing `email` pulls the email
 * regex and nothing else — unlike `StringSchema`, whose prototype carries every
 * format method (so calling `string()` pulls them all).
 */
import type { CheckOpts, Op, ParseCtx } from '../core/ops'
import { type Action, attachCheck, makeCheckIssue, type Schema } from '../core/schema'

export type { Action }

/** The issue a failing check emits — mirrors the args of {@link makeCheckIssue}. */
export interface CheckIssueSpec {
  /** Stable issue `code` (`too_small`, `invalid_format`, …). */
  code: string
  /** Human-readable fallback message. */
  message: string
  /** i18n key (`validate.string.too-short`, …). */
  key: string
  /** Structured params surfaced on the issue (`{ min, actual }`, …). */
  params?: Record<string, unknown>
}

/**
 * Build a standalone CHECK action.
 *
 * @param op     The op descriptor — its `kind`/params match the chainable
 *               method exactly so `formatErrors` / i18n / the compiler treat
 *               the two identically.
 * @param isValid Returns `true` when the value passes — OR is the wrong type
 *               (the upstream type-check owns the type error, exactly like the
 *               method bodies' `typeof value !== 'T' || …` guard).
 * @param issue  The issue to emit when invalid — static, or a function of the
 *               value for dynamic params (`actual: value.length`).
 */
export function defineCheck<T>(
  op: Op,
  isValid: (value: T) => boolean,
  issue: CheckIssueSpec | ((value: T) => CheckIssueSpec),
): Action<T> {
  const opts = (op as { opts?: CheckOpts }).opts
  const validate = (value: unknown, ctx: ParseCtx): void => {
    if (isValid(value as T)) return
    const spec = typeof issue === 'function' ? issue(value as T) : issue
    ctx.issues.push(
      makeCheckIssue(spec.code, spec.message, spec.key, spec.params ?? {}, spec.message, ctx, opts),
    )
  }
  return <S extends Schema<T>>(schema: S): S => {
    // Fresh op per application (each chainable method call likewise pushes a
    // new op object); the shared `validate` closure is safe to reuse.
    schema._ops.push(attachCheck({ ...(op as object) } as Op, validate))
    schema._invalidateCompile()
    return schema
  }
}

/**
 * Build a standalone TRANSFORM action (`trim` / `toLowerCase` / …) — a
 * declarative op with no closure over the value, applied after the type-check.
 */
export function defineTransform<T>(fn: (value: T) => T): Action<T> {
  return <S extends Schema<T>>(schema: S): S => {
    schema._ops.push({ kind: 'transform', fn: fn as (v: unknown) => unknown })
    schema._invalidateCompile()
    return schema
  }
}

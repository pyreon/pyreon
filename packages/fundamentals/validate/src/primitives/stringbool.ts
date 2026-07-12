/**
 * `s.stringbool()` — coerce a boolean-ish STRING to a real boolean (Zod 4's
 * `z.stringbool`). Type-checks the input is a string, then maps known truthy /
 * falsy tokens (case-insensitive, trimmed) to `true` / `false`; anything else
 * is an error. Distinct from `s.coerce.boolean()` (which uses JS truthiness on
 * ANY input) — this accepts ONLY strings and ONLY the configured tokens.
 */

import { makeIssue, typeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase } from '../core/schema'

const DEFAULT_TRUTHY = ['true', '1', 'yes', 'on', 'y', 'enabled'] as const
const DEFAULT_FALSY = ['false', '0', 'no', 'off', 'n', 'disabled'] as const

export interface StringBoolOptions {
  /** Strings that map to `true` (compared case-insensitively, trimmed). */
  truthy?: ReadonlyArray<string>
  /** Strings that map to `false` (compared case-insensitively, trimmed). */
  falsy?: ReadonlyArray<string>
  /** Override the error message for an unrecognized string. */
  message?: string
}

export class StringBoolSchema extends SchemaBase<boolean> {
  readonly _kind = 'stringbool' as const
  /** Exposed for structural walkers (`toJsonSchema`). */
  readonly truthy: ReadonlySet<string>
  readonly falsy: ReadonlySet<string>
  private readonly message: string

  constructor(opts?: StringBoolOptions) {
    super()
    this.truthy = new Set((opts?.truthy ?? DEFAULT_TRUTHY).map((s) => s.toLowerCase()))
    this.falsy = new Set((opts?.falsy ?? DEFAULT_FALSY).map((s) => s.toLowerCase()))
    this.message = opts?.message ?? 'Invalid boolean string'
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'string') {
      ctx.issues.push(typeIssue('string', input, ctx.path))
      return input
    }
    const norm = input.trim().toLowerCase()
    if (this.truthy.has(norm)) return true
    if (this.falsy.has(norm)) return false
    ctx.issues.push(
      makeIssue({
        code: 'invalid_format',
        message: this.message,
        key: 'validate.stringbool.invalid',
        fallback: this.message,
        path: ctx.path,
      }),
    )
    return input
  }
}

export function stringbool(opts?: StringBoolOptions): StringBoolSchema {
  return new StringBoolSchema(opts)
}

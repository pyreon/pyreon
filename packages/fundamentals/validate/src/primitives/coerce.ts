/**
 * `s.coerce.*` — coercing primitives. Each coerces the input via the JS
 * constructor BEFORE the type-check, then runs the normal primitive
 * validation + checks on the coerced value (so `s.coerce.number().int().min(0)`
 * accepts `"42"` → `42`). Mirrors Zod's `z.coerce.*`. The coerced subclass
 * inherits every chainable check from its base primitive.
 */

import type { ParseCtx } from '../core/ops'
import { BigIntSchema } from './bigint'
import { BooleanSchema } from './boolean'
import { DateSchema } from './date'
import { NumberSchema } from './number'
import { StringSchema } from './string'

export class CoerceStringSchema extends StringSchema {
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    return super._compileType(typeof input === 'string' ? input : String(input), ctx)
  }
}

export class CoerceNumberSchema extends NumberSchema {
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    return super._compileType(typeof input === 'number' ? input : Number(input), ctx)
  }
}

export class CoerceBooleanSchema extends BooleanSchema {
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    return super._compileType(typeof input === 'boolean' ? input : Boolean(input), ctx)
  }
}

export class CoerceDateSchema extends DateSchema {
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    const coerced =
      input instanceof Date ? input : new Date(input as string | number)
    return super._compileType(coerced, ctx)
  }
}

export class CoerceBigIntSchema extends BigIntSchema {
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    let coerced = input
    if (typeof input !== 'bigint') {
      try {
        coerced = BigInt(input as string | number | boolean)
      } catch {
        // leave as-is — the bigint type-check will emit the issue.
      }
    }
    return super._compileType(coerced, ctx)
  }
}

/**
 * The `s.coerce.*` namespace. `s.coerce.number()` coerces with `Number(x)`,
 * `.string()` with `String(x)`, `.boolean()` with `Boolean(x)`, `.date()`
 * with `new Date(x)`, `.bigint()` with `BigInt(x)` — each then validated
 * by the corresponding primitive.
 */
export const coerce = {
  string: (): CoerceStringSchema => new CoerceStringSchema(),
  number: (): CoerceNumberSchema => new CoerceNumberSchema(),
  boolean: (): CoerceBooleanSchema => new CoerceBooleanSchema(),
  date: (): CoerceDateSchema => new CoerceDateSchema(),
  bigint: (): CoerceBigIntSchema => new CoerceBigIntSchema(),
} as const

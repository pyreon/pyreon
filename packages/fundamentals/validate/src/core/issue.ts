/**
 * Issue shape — Pyreon's i18n-flavoured extension of the Standard Schema
 * `Issue` interface. Native StdSchema consumers see the spec shape
 * (`message`, `path`); Pyreon-aware consumers additionally see `code` /
 * `key` / `params` / `fallback` and can route through `formatErrors(t)`.
 *
 * Every built-in check emits issues with all four Pyreon fields populated.
 * User-defined `.refine()` calls accept the same shape.
 */

import type { PyreonIssue, StandardSchemaIssue } from '../types'

export type { PyreonIssue, StandardSchemaIssue }

/**
 * Path segment — accepts both bare PropertyKey AND StdSchema's
 * `{ key }` wrapper. Different libs emit different shapes.
 */
export type PathSegment = PropertyKey | { readonly key: PropertyKey }

/**
 * Build a Pyreon-flavoured issue with all four metadata fields. Used by
 * primitive type checks and built-in constraint checks. Caller is
 * responsible for passing the current path.
 */
export function makeIssue(opts: {
  message: string
  code: string
  path: ReadonlyArray<PathSegment>
  key?: string
  params?: Readonly<Record<string, unknown>>
  fallback?: string
}): PyreonIssue {
  const out: PyreonIssue = {
    message: opts.message,
    // SNAPSHOT the path — `ctx.path` is a single array mutated (push/pop)
    // throughout the parse, so an issue must capture a copy, not a live
    // reference (otherwise it reads back as `[]` after the parse unwinds).
    path: opts.path.slice(),
  }
  if (opts.code !== undefined) (out as { code?: string }).code = opts.code
  if (opts.key !== undefined) (out as { key?: string }).key = opts.key
  if (opts.params !== undefined) (out as { params?: Readonly<Record<string, unknown>> }).params = opts.params
  if (opts.fallback !== undefined) (out as { fallback?: string }).fallback = opts.fallback
  return out
}

/**
 * Type-mismatch issue. Built-in for every primitive type-check.
 */
export function typeIssue(
  expected: string,
  actual: unknown,
  path: ReadonlyArray<PathSegment>,
): PyreonIssue {
  const actualType = describeType(actual)
  return makeIssue({
    code: 'wrong_type',
    key: `validate.${expected}.required`,
    params: { expected, actual: actualType },
    fallback: `Expected ${expected}, received ${actualType}`,
    message: `Expected ${expected}, received ${actualType}`,
    path,
  })
}

function describeType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'object') return 'object'
  return t
}

/**
 * Thrown by `schema.parseOrThrow()`. Aggregates all issues from a parse
 * failure into a single Error subclass so callers can `instanceof` check.
 */
export class ValidationError extends Error {
  readonly issues: ReadonlyArray<PyreonIssue>

  constructor(issues: ReadonlyArray<PyreonIssue>) {
    const first = issues[0]
    const head = first
      ? `${first.path && first.path.length > 0 ? formatPath(first.path) + ': ' : ''}${first.message}`
      : 'validation failed'
    const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''
    super(`[Pyreon] ${head}${more}`)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

function formatPath(path: ReadonlyArray<PathSegment | { readonly key: PropertyKey }>): string {
  return path
    .map((seg) => {
      if (typeof seg === 'object' && seg !== null && 'key' in seg) return String(seg.key)
      return String(seg)
    })
    .join('.')
}

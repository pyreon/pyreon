/**
 * `@pyreon/http/schema` — Tier-2 (Standard Schema) support.
 *
 * ## Why this is a SEPARATE entry
 *
 * The core never imports a validation library. Schema support is injected
 * as a {@link SchemaResolver}, so the code below is reachable only if you
 * actually import it — which is what makes "optional validation" a real
 * byte-level guarantee rather than a documentation claim. A runtime
 * `if (isSchema(x))` branch inside the core would keep this module alive
 * in every consumer bundle even when unused, because tree-shaking works on
 * reachability, not on runtime branches.
 *
 * ## Why it delegates to `@pyreon/validation`
 *
 * Detecting a Standard Schema looks like ten lines, and it has two
 * documented traps that were each fixed once, upstream, in
 * `@pyreon/validation` — re-implementing them here would re-introduce both:
 *
 * 1. The guard must accept CALLABLE values. ArkType schemas are functions
 *    that carry `~standard`; an `typeof === 'object'` guard silently
 *    rejects them, and every consumer then SKIPS validation while
 *    reporting success.
 * 2. The result discriminant is `issues`, never `'value' in result`.
 *    Valibot's FAILURE result carries both keys (`{ typed: false, value:
 *    <raw input>, issues: [...] }`), so a `'value' in r` success check
 *    accepts every raw-valibot failure as a pass.
 *
 * So `isStandardSchema` is imported; the INVOKE half is implemented here
 * only because validation's `wrapStandardSchema` is constrained to
 * `Record<string, unknown>` and an HTTP response is very often a top-level
 * array or scalar.
 */

import { isPyreonAdapter, isStandardSchema } from '@pyreon/validation'
import type { ParseFn, SchemaResolver, StandardSchemaShape } from './types'

interface StandardIssue {
  readonly message?: string | undefined
  readonly path?: readonly unknown[] | undefined
}

function issuePath(issue: StandardIssue): string {
  if (!issue.path || issue.path.length === 0) return '(root)'
  return issue.path
    .map((seg) =>
      typeof seg === 'object' && seg !== null && 'key' in seg
        ? String((seg as { key: unknown }).key)
        : String(seg),
    )
    .join('.')
}

/** Render up to 5 issues into one message, matching validation's style. */
function formatIssues(issues: readonly StandardIssue[]): string {
  const shown = issues
    .slice(0, 5)
    .map((i) => `${issuePath(i)}: ${i.message ?? 'invalid'}`)
    .join('; ')
  const rest = issues.length > 5 ? ` … and ${issues.length - 5} more` : ''
  return `${shown}${rest}`
}

/**
 * The Tier-2 resolver. Pass it to `createHttp({ schema: standardSchema })`
 * to make `.json(someZodSchema)` and `endpoint({ response: schema })` work.
 *
 * Returns `null` for anything that is not a Standard Schema, so the client
 * can fall through to its own diagnostics.
 */
export const standardSchema: SchemaResolver = (schema): ParseFn<unknown> | null => {
  // Tier A.1 — a `@pyreon/validation` TYPED ADAPTER (`zodSchema(...)`,
  // `valibotSchema(...)`, `arktypeSchema(...)`).
  //
  // These carry `_infer` + `parse` and NO `~standard`, so a
  // Standard-Schema-only resolver rejects them and `.json(zodSchema(X))`
  // dies with "no schema resolver is configured" — against the framework's
  // OWN documented adapter convention. `parse` returns a `ParseResult`
  // rather than throwing, so the verdict has to be converted here.
  if (isPyreonAdapter(schema)) {
    // Call it ON the adapter — do NOT detach `parse` into a local. The
    // valibot and arktype adapters close over helpers through `this`, so a
    // detached reference dies with `runParse is not a function`. (zod's
    // adapter happens to survive detaching, which is exactly why only the
    // full adapter matrix caught this.)
    const owner = schema as { parse?: (value: unknown) => unknown }
    if (typeof owner.parse !== 'function') {
      // `TypedSchemaAdapter.parse` is optional — an adapter built without
      // it exposes only `validator`, which returns an error RECORD (and may
      // be async), so it cannot produce a validated VALUE synchronously.
      // Fail loudly rather than silently skipping validation.
      throw new Error(
        '[Pyreon] http: this @pyreon/validation adapter has no sync `parse`, so it cannot ' +
          'validate a response body. Pass the RAW schema instead (`.json(mySchema)`), or ' +
          'build the adapter with its sync parser (e.g. `valibotSchema(schema, v.safeParse)`).',
      )
    }
    return (raw: unknown): unknown => {
      const result = owner.parse!(raw) as
        | { ok: true; value: unknown }
        | { ok: false; issues: readonly StandardIssue[] }
      if (!result.ok) throw new Error(formatIssues(result.issues))
      return result.value
    }
  }

  // Tier A.2 — a raw Standard Schema instance.
  if (!isStandardSchema(schema)) return null
  const validate = (schema as StandardSchemaShape)['~standard'].validate

  return (raw: unknown): unknown => {
    const result = validate(raw) as
      | { issues?: readonly StandardIssue[]; value?: unknown }
      | Promise<unknown>

    if (result instanceof Promise) {
      // A response parser must be synchronous — `.json()` already awaits
      // the body, and making validation async here would silently change
      // the ordering guarantees of every middleware downstream.
      throw new Error(
        '[Pyreon] http: async schemas are not supported for response validation. ' +
          'Use a synchronous schema, or validate manually after awaiting the response.',
      )
    }

    // Discriminate on `issues` — NEVER on `'value' in result`. Valibot's
    // failure result carries BOTH keys.
    const issues = result.issues
    if (issues && issues.length > 0) {
      throw new Error(formatIssues(issues))
    }
    return result.value
  }
}

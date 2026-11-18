// ─── Standard Schema runtime guard (internal) ──────────────────────────────
// https://standardschema.dev — the `~standard` contract zod, valibot, arktype
// and `@pyreon/validate`'s `s` implement. The TYPE is the official, types-only
// `@standard-schema/spec` package, so zero depends on no validation library.
// Shared by `defineAction(schema, handler)` and `validateEnv`.

import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Whether `value` is a Standard Schema: it carries a `~standard.validate`
 * function. ArkType schemas are FUNCTIONS carrying `~standard`, so a callable
 * is accepted; a plain function without the marker is not. `version` /
 * `vendor` are not inspected — nothing in zero reads them.
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  const std = (value as { '~standard'?: unknown })['~standard']
  return (
    typeof std === 'object' &&
    std !== null &&
    typeof (std as { validate?: unknown }).validate === 'function'
  )
}

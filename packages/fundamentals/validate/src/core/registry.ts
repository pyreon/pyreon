/**
 * Environment validator registry — the mechanism behind shared
 * client/server validation.
 *
 * A format check (`email`, `phone`, …) runs a LIGHTWEIGHT in-bundle
 * validator by default (fast, small — what ships to the client). The
 * SERVER imports `@pyreon/validate/server`, whose side effect installs
 * SUPERIOR validators (strict RFC email + disposable-domain lists, full
 * E.164 / region-aware phone, …) into this registry. The check consults
 * the registry at PARSE time, so:
 *
 *   - Client never imports `/server` → registry empty → light validator
 *     (and the heavy code tree-shakes out of the client bundle entirely).
 *   - Server imports `/server` → registry populated → the SAME schema
 *     (`s.string().email()`) now validates with the superior logic.
 *
 * One schema, one syntax, shared between client and server — the presence
 * of an installed heavy validator IS the client/server switch. No env
 * flag to thread, no schema duplication.
 *
 * Heavy validators are SYNC (regex / table / list lookups). Async
 * server-only checks (DNS MX, BIN lookup) compose via `.refine(asyncFn)`
 * + `parseAsync` — they don't go through this registry.
 */

/** A heavy/superior format validator: returns `true` if `value` is valid. */
export type FormatValidator = (value: string) => boolean

const installed = new Map<string, FormatValidator>()

/**
 * Install a superior validator for a named format (called by
 * `@pyreon/validate/server`). Overrides the lightweight default for every
 * schema using that format. Idempotent (last install wins).
 */
export function installFormatValidator(name: string, fn: FormatValidator): void {
  installed.set(name, fn)
}

/** The installed superior validator for `name`, or `undefined` (→ light default). */
export function getFormatValidator(name: string): FormatValidator | undefined {
  return installed.get(name)
}

/** Remove an installed validator (test isolation / opt-out). */
export function uninstallFormatValidator(name: string): void {
  installed.delete(name)
}

/**
 * Resolve the effective validator for a format check: the installed
 * superior one if present (server), else the supplied lightweight default
 * (client). Called from the check closure at parse time.
 */
export function resolveFormat(name: string, light: FormatValidator): FormatValidator {
  return installed.get(name) ?? light
}

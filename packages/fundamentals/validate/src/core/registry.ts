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
 * Bumped on every install/uninstall. A per-op memoized resolver
 * ({@link makeFormatResolver}) caches its resolved validator against this
 * version, so the common case (registry never touched after startup, or
 * touched once when `/server` loads) pays an int compare instead of a
 * `Map.get(name)` string-hash lookup on EVERY parse. The version is the
 * cache-invalidation trigger: a late `/server` install bumps it → the next
 * parse re-resolves and picks up the superior validator.
 */
let formatVersion = 0

/**
 * Install a superior validator for a named format (called by
 * `@pyreon/validate/server`). Overrides the lightweight default for every
 * schema using that format. Idempotent (last install wins).
 */
export function installFormatValidator(name: string, fn: FormatValidator): void {
  installed.set(name, fn)
  formatVersion++
}

/** The installed superior validator for `name`, or `undefined` (→ light default). */
export function getFormatValidator(name: string): FormatValidator | undefined {
  return installed.get(name)
}

/** Remove an installed validator (test isolation / opt-out). */
export function uninstallFormatValidator(name: string): void {
  installed.delete(name)
  formatVersion++
}

/**
 * Resolve the effective validator for a format check: the installed
 * superior one if present (server), else the supplied lightweight default
 * (client). Called from the check closure at parse time.
 */
export function resolveFormat(name: string, light: FormatValidator): FormatValidator {
  return installed.get(name) ?? light
}

/**
 * Build a MEMOIZED resolver for a format check — the hot-path form of
 * {@link resolveFormat}. Created ONCE per format-check op (at schema
 * construction); returns a `(value) => boolean` predicate that caches the
 * resolved validator against {@link formatVersion} so the steady state is a
 * single int compare + the validator call — no per-parse `Map.get` string
 * hash. Byte-identical verdict to `resolveFormat(name, light)(value)`; a
 * `/server` install bumps the version so a schema built on the client and
 * parsed after `/server` loads still swaps to the superior validator.
 */
export function makeFormatResolver(name: string, light: FormatValidator): FormatValidator {
  let cachedVersion = -1
  let cached: FormatValidator = light
  return (value: string): boolean => {
    if (cachedVersion !== formatVersion) {
      cached = installed.get(name) ?? light
      cachedVersion = formatVersion
    }
    return cached(value)
  }
}

// ─── Server-only check registry (`.serverCheck`) ────────────────────────────
//
// Unlike the format registry (sync boolean, swaps a default), a server check
// has NO client default: it is the heavy/async/privileged half of the split
// (uniqueness, breach-check, MX, DB cross-field). The shared schema carries
// only the KEY; the validator is installed behind `@pyreon/validate/server`,
// so the implementation never reaches the client bundle. On the client the
// key is absent → the check no-ops and records a `pending` entry. On the
// server the registered fn runs with the parse context (DB handle, request).

/**
 * A server-only check: returns `true` if valid. May be async (DB / network)
 * and receives the opaque parse `context` threaded by `parseAsync`.
 */
export type ServerCheckFn = (value: unknown, context?: unknown) => boolean | Promise<boolean>

const serverChecks = new Map<string, ServerCheckFn>()

/**
 * Install a server-only check under `key` (called from
 * `@pyreon/validate/server` via `registerServerCheck`). Idempotent.
 */
export function installServerCheck(key: string, fn: ServerCheckFn): void {
  serverChecks.set(key, fn)
}

/** The installed server check for `key`, or `undefined` (→ client no-op + pending). */
export function getServerCheck(key: string): ServerCheckFn | undefined {
  return serverChecks.get(key)
}

/** Remove an installed server check (test isolation / opt-out). */
export function uninstallServerCheck(key: string): void {
  serverChecks.delete(key)
}

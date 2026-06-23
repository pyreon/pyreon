/**
 * `@pyreon/validate/server` — superior, heavier validators for the SERVER.
 *
 * Importing this module installs strict validators into the format
 * registry, so the SAME shared schema (`s.string().email()` /
 * `.phone()`) automatically validates more strictly server-side — without
 * any of this code reaching the client bundle (the client never imports
 * `/server`, and these validators are unreachable from the main entry, so
 * they tree-shake out entirely).
 *
 * This is the heavy half of the client/server split:
 *   - client: lightweight in-bundle regex (fast, small)
 *   - server: strict RFC email + disposable-domain blocklist, full E.164
 *     phone (require `+`, country-code-aware length) — and the seam for
 *     async DNS-MX / `libphonenumber`-grade checks (compose via
 *     `.refine(asyncFn)` + `parseAsync`).
 *
 * @example
 * ```ts
 * // server entry only:
 * import '@pyreon/validate/server' // side-effect: installs strict validators
 * // …now every s.string().email()/.phone() validates strictly here.
 * ```
 */

import {
  installFormatValidator,
  installServerCheck,
  type ServerCheckFn,
  uninstallServerCheck,
} from './core/registry'
import { validateEmail } from './primitives/string'

/**
 * Register the heavy/async/privileged half of a `.serverCheck(key)` — the
 * implementation that must NEVER reach the client bundle (DB lookups,
 * breach-checks, MX, cross-field). Call from a server-only module; the
 * matching `s.…serverCheck(key)` in the shared schema then validates here.
 *
 * @example
 * registerServerCheck('email-unique', async (value, ctx) => {
 *   const db = (ctx as { db: Db }).db
 *   return !(await db.user.existsByEmail(value as string))
 * })
 */
export function registerServerCheck(key: string, fn: ServerCheckFn): void {
  installServerCheck(key, fn)
}

export { uninstallServerCheck, type ServerCheckFn }

/**
 * A small representative disposable / throwaway-email domain blocklist.
 * Real deployments extend this via `addDisposableDomains()` (or swap in a
 * maintained list) — kept tiny here so it's illustrative, not exhaustive.
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'maildrop.cc',
])

/** Extend the disposable-domain blocklist (lower-cased). */
export function addDisposableDomains(domains: Iterable<string>): void {
  for (const d of domains) DISPOSABLE_DOMAINS.add(d.toLowerCase())
}

/** Whether `email`'s domain is a known disposable provider. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  return DISPOSABLE_DOMAINS.has(email.slice(at + 1).toLowerCase())
}

/**
 * Strict server email: the rfc5322 tier (standard regex + RFC 5321 length
 * limits) AND not a disposable-domain address. Stricter than the client's
 * lightweight default. (For async DNS-MX existence checks, compose
 * `.refine(async (e) => mxExists(e), …)` + `parseAsync` — async checks
 * don't go through the sync registry.)
 */
export function strictEmail(value: string): boolean {
  return validateEmail(value, 'rfc5322') && !isDisposableEmail(value)
}

// Full E.164: require a leading `+`, country code 1-3 digits, 4-14 national
// digits, 7-15 total. Stricter than the lightweight default (which allows
// a missing `+`). A real deployment swaps in `libphonenumber-js` here for
// region + line-type validation — far too heavy for the client, ideal
// server-side. This is the strict-but-dependency-free server default.
const E164_STRICT_RE = /^\+[1-9]\d{6,14}$/

/** Strict server phone: full E.164 (requires `+`, 7–15 digits). */
export function strictPhone(value: string): boolean {
  return E164_STRICT_RE.test(value.replace(/[\s().-]/g, ''))
}

/**
 * Install the strict server validators into the format registry. Called
 * automatically on import (side effect below); exported for explicit /
 * test-controlled installation.
 */
export function installServerValidators(): void {
  installFormatValidator('email', strictEmail)
  installFormatValidator('phone', strictPhone)
}

// Side effect: importing `@pyreon/validate/server` upgrades validation.
installServerValidators()

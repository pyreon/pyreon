// ─── i18n routing state (client-safe, non-entry) ───────────────────────────
//
// Module state behind `useLocale()` / `setLocale()` in `i18n-routing.ts`,
// split out so the `_`-prefixed setters are not exports of the public
// `@pyreon/zero` / `@pyreon/zero/i18n-routing` entries. They are reachable
// only through `@pyreon/zero/internal`.

import { signal } from '@pyreon/reactivity'
import type { I18nRoutingConfig } from './i18n-routing'

// PR-S7: per-request locale store. Pattern A (module-global state in server
// context) — pre-fix the dev middleware set a module-level `localeSignal`
// per request, which races between concurrent SSR requests (the last writer
// wins; both requests' renders read the second locale). The fix tracks the
// locale per-request via `AsyncLocalStorage` — but the ALS instance lives
// in `i18n-routing-als.ts` (server-only) because importing
// `node:async_hooks` at module scope would pull the Node-only module into
// the CLIENT bundle (this file is client-safe — `i18n-routing.ts`, exported
// from `@pyreon/zero`'s main entry via `useLocale` / `setLocale`, imports it). The bug
// surfaced in PR #1125 first cut: ssr-showcase e2e specs broke because
// browsers can't load `node:async_hooks`.
//
// The setter-pattern bridge: the server-only `i18n-routing-als.ts` module
// (imported only by the `i18nRouting()` Vite plugin in `server.ts`)
// registers an ALS-backed `LocaleStore | undefined` reader via
// `_setLocaleStoreReader`. On the server, the reader returns the per-
// request ALS store; on the client (no ALS module loaded), the reader
// stays as the no-op default → `useLocale()` falls back to the module
// signal. Same shape `match.ts` uses for `_setDefaultChromeLayout`
// (cross-module setter to avoid an import cycle / pull a Node-only dep
// into the browser bundle).
export interface LocaleStore {
  get(): string
  set(value: string): void
}
type LocaleStoreReader = () => LocaleStore | undefined
let _readLocaleStore: LocaleStoreReader = () => undefined

/**
 * @internal — server-only bridge. The Vite plugin (`i18nRouting()`)
 * imports the server-only ALS module on plugin load, which calls this
 * to register a reader that returns the per-request ALS store. The
 * client never imports the ALS module → the reader stays at the
 * no-op default → `useLocale()` reads the module signal (the CSR
 * contract, fully reactive).
 *
 * Not part of the public API: reachable as `@pyreon/zero/internal`, and
 * imported directly by the server-only `i18n-routing-als.ts` module.
 */
export function _setLocaleStoreReader(reader: LocaleStoreReader): void {
  _readLocaleStore = reader
}

export function currentLocaleStore(): LocaleStore | undefined {
  return _readLocaleStore()
}

/**
 * Current locale signal — set by client-side detection / `setLocale()`.
 *
 * **Server-side note (PR-S7).** Under concurrency, this module-level signal
 * is NOT the source of truth — the i18n middleware writes a per-request
 * `LocaleStore` into `AsyncLocalStorage` and `useLocale()` prefers that
 * store. The module signal is updated as a best-effort fallback for code
 * paths that don't flow through the ALS context (rare), but reading it
 * directly from a server context is racy and discouraged. Use `useLocale()`
 * everywhere — it does the right thing in both environments.
 *
 * Client-side (single-threaded), the module signal is fully authoritative
 * and reactive: components reading it inside an effect / computed / JSX
 * accessor subscribe to it normally.
 */
export const localeSignal = signal('en')

let _i18nConfig: I18nRoutingConfig | undefined

/**
 * @internal — called by the generated `virtual:zero/routes` module when
 * `zero({ i18n })` is set, so `useLocale()` can derive the locale from the URL
 * in every environment (production SSR, SSG, client), not only under the dev
 * middleware. Emitted code imports it from `@pyreon/zero/internal`.
 */
export function _registerI18nConfig(config: I18nRoutingConfig | undefined): void {
  _i18nConfig = config
  if (config) localeSignal.set(config.defaultLocale)
}

/** The config `_registerI18nConfig` recorded, or `undefined` when i18n is off. */
export function registeredI18nConfig(): I18nRoutingConfig | undefined {
  return _i18nConfig
}

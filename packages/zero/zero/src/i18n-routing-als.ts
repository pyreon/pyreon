/**
 * @pyreon/zero — i18n routing ALS (server-only).
 *
 * Per-request locale store backed by `AsyncLocalStorage`. Split from
 * `i18n-routing.ts` because that file is CLIENT-SAFE — it's exported
 * from `@pyreon/zero`'s main entry (`useLocale` / `setLocale`), so any
 * `import { AsyncLocalStorage } from 'node:async_hooks'` at the top
 * would pull the Node-only module into the BROWSER bundle. The bug
 * surfaced in PR #1125 first cut — ssr-showcase e2e specs broke
 * because Vite tried to bundle `node:async_hooks` for the client and
 * left hydration in a broken state (counter clicks did nothing, theme
 * toggle silent).
 *
 * This module is imported ONLY from `i18nRouting()`'s `configureServer`
 * hook (which runs in Node, never in the browser). The setter
 * `_setLocaleStoreReader` in the client-safe file is wired here so
 * `useLocale()` reads from this ALS in server contexts, falling back
 * to the module signal on the client.
 *
 * Same architectural shape match.ts uses for `_setDefaultChromeLayout`
 * (cross-module setter to avoid a cycle / pull a server-only dep into
 * the browser bundle).
 *
 * **DO NOT import this from `i18n-routing.ts` at module scope.** The
 * import must be lazy (inside the `configureServer` hook) so client
 * code never reaches `node:async_hooks`.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { _setLocaleStoreReader, type LocaleStore } from './i18n-routing'

const _localeAls = new AsyncLocalStorage<LocaleStore>()

// Wire the reader bridge at module load. The first import from
// `i18nRouting()`'s `configureServer` triggers this side effect; subsequent
// imports are no-ops (`import` caches the module).
_setLocaleStoreReader(() => _localeAls.getStore())

/**
 * Wrap `fn` in a per-request locale store. The Vite middleware uses
 * this to scope `next()` so every downstream async frame (middleware
 * chain, ssrLoadModule, Pyreon handler, render) reads the right
 * locale via `useLocale()`.
 *
 * @internal
 */
export function _runWithLocale<T>(
  initial: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  let value = initial
  const store: LocaleStore = {
    get: () => value,
    set: (v) => {
      value = v
    },
  }
  return _localeAls.run(store, fn)
}

/** @internal — direct ALS access for the middleware's `next()` wrap. */
export function _runInLocaleStore(
  store: LocaleStore,
  fn: () => void,
): void {
  _localeAls.run(store, fn)
}

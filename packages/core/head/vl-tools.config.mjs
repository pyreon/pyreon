/**
 * Externalize `@pyreon/head/context` from EVERY sub-entry bundle so
 * `createContext(null)` is called exactly once at runtime (in `lib/context.js`)
 * and `HeadContext` is one Symbol across `lib/index.js`, `lib/ssr.js`,
 * `lib/use-head.js`, `lib/provider.js`.
 *
 * Without this, the shared `@vitus-labs/tools-rolldown` invokes rolldown
 * once per sub-entry (no cross-entry shared chunks), so every bundle
 * inlines `context.ts` independently — each call to `createContext(null)`
 * mints a fresh Symbol id, so a `useContext(HeadContext)` lookup in one
 * bundle misses a `provide(HeadContext)` from another. SSG-rendered HTML
 * was missing every `useHead()`-registered tag for that exact reason
 * (renderWithHead from `lib/ssr.js` saw an empty context; the app's
 * useHead calls from `lib/index.js` wrote to a different one).
 *
 * The fix: source uses self-package imports (`@pyreon/head/context`)
 * for the runtime VALUE — this entry's `external` rule makes the
 * bundler emit them verbatim instead of inlining. At runtime, every
 * importer resolves to the same `lib/context.js` (the new `./context`
 * sub-export in package.json). Type-only imports keep relative paths
 * (`./context`) — they erase at build, no externalization needed.
 *
 * See `tests/context-identity.test.ts` for the bundle-level regression
 * gate that asserts the contract.
 */
export default {
  build: {
    external: ['@pyreon/head/context'],
  },
}

/**
 * `@pyreon/http/middleware` — the opt-in layers.
 *
 * NOTE this barrel lives at `src/middleware.ts`, NOT `src/middleware/index.ts`,
 * even though the implementations sit in `src/middleware/`. The shared build
 * tool derives every entry from the package.json exports KEY by convention
 * (`"./X"` → `src/X.ts`) and does NO directory/index resolution — an
 * `index.ts` here fails the release's clean build with `UNRESOLVED_ENTRY`,
 * which is exactly what `scripts/check-export-entries.ts` exists to catch.
 *
 * Nothing here is enabled by default. The core ships exactly one built-in
 * behaviour (a request timeout, because `fetch` has none and a hung request
 * otherwise hangs forever); everything else — retry, de-duplication, auth,
 * logging — is something you add explicitly, so the composed behaviour of a
 * client is readable from its `use: [...]` array.
 */

export { bearer, refresh, type RefreshOptions } from './middleware/auth'
export { dedupe, type DedupeOptions } from './middleware/dedupe'
export { forwardHeaders, type ForwardHeadersOptions } from './middleware/forward'
export { logger, type LoggerOptions } from './middleware/logger'
export { retry, type RetryOptions } from './middleware/retry'

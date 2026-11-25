/**
 * `@pyreon/runtime-server/internal` — NOT public API.
 *
 * Test-only knobs for the server renderer. Nothing here carries a semver
 * promise. See "What counts as public API" on the stability page.
 *
 * The `_ssr*` / `_esc*` helpers that compiled SSR code imports are the
 * compiler ABI and stay on the main `@pyreon/runtime-server` entry.
 */
export { _setStreamFlushBytes } from './stream-flush'

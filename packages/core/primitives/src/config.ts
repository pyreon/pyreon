// Runtime configuration for `@pyreon/primitives` — the one-time app-boot
// hook (mirrors the `init()` pattern in `@pyreon/rocketstyle` /
// `@pyreon/ui-core`).
//
// ## Why this exists
//
// The package is deliberately router-AGNOSTIC: it must not depend on
// `@pyreon/router` (or any router), so a consumer using only `<Stack>` /
// `<Text>` never pulls a router into their graph. But `<Link>` needs to
// perform client-side navigation. The app supplies that capability once,
// here, instead of the primitives package importing a router.
//
// ## Usage
//
//   import { init } from '@pyreon/primitives'
//   import { createRouter } from '@pyreon/router'
//   const router = createRouter({ routes })
//   init({ navigate: (to) => router.push(to) })
//
// With `navigate` configured, an internal `<Link>` intercepts plain
// left-clicks and routes via `navigate` (SPA — no full reload). Without
// it, `<Link>` is a plain `<a href>` that does a normal full-page
// navigation — so links always WORK, the config only upgrades them to
// SPA behavior. Works with any router (or none).
//
// ## SSR note
//
// The config is a module-level singleton. That's safe for SSR because
// `<Link>` renders a static `<a href>` on the server and the `navigate`
// handler is only ever read inside a client click handler — the server
// never reads it, so there is no cross-request contamination.

export interface PrimitivesInitOptions {
  /**
   * Client-side navigation handler for internal `<Link>`s. Typically
   * `(to) => router.push(to)`. When set, `<Link>` intercepts plain
   * left-clicks for SPA navigation; when unset, `<Link>` falls back to
   * a normal full-load `<a href>`.
   */
  navigate?: (to: string) => void
}

let _config: PrimitivesInitOptions = {}

/**
 * Configure `@pyreon/primitives` runtime behavior. Call once at app
 * boot. Merges with any previous config (later calls override the keys
 * they set; keys they omit are preserved).
 */
export function init(options: PrimitivesInitOptions): void {
  _config = { ..._config, ...options }
}

/** Internal: the configured navigation handler, or `undefined`. */
export function getNavigate(): ((to: string) => void) | undefined {
  return _config.navigate
}

/** Reset all config to defaults. Primarily for tests + teardown. */
export function resetPrimitivesConfig(): void {
  _config = {}
}

// Runtime configuration for `@pyreon/primitives` — the one-time app-boot hook
// (mirrors `init()` in `@pyreon/rocketstyle` / `@pyreon/ui-core`).
//
// The package is deliberately router-AGNOSTIC so a consumer using only `<Stack>`
// / `<Text>` never pulls a router into their graph — but `<Link>` still needs
// client-side navigation. The app supplies that capability once, here, rather
// than this package importing a router:
//
//   init({ navigate: (to) => router.push(to) })
//
// With `navigate` set, an internal `<Link>` intercepts plain left-clicks and
// routes through it. Without it, `<Link>` is a plain `<a href>` doing a normal
// full-page navigation — links always WORK, the config only upgrades them to
// SPA behaviour, with any router or none.
//
// The config is a module-level singleton, which is SSR-safe: `<Link>` renders a
// static `<a href>` on the server and `navigate` is read only inside a client
// click handler, so there is no cross-request contamination.

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

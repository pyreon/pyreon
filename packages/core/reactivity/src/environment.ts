/**
 * Runtime environment detection — is this code executing on the SERVER
 * (SSR / Node / Bun / Deno / edge / a Web Worker — no DOM) or on the CLIENT
 * (a browser main thread, DOM available)?
 *
 * The discriminator is `typeof document` — the most reliable "is there a DOM"
 * signal: a real browser main thread is the only environment with a global
 * `document`. (`typeof window` is weaker — Deno historically defined a `window`
 * global, and some Node setups polyfill it — so a `window`-based check
 * misreports those as the client.)
 *
 * These are plain runtime constants, evaluated once at module load. They are
 * CORRECT in every runtime with zero bundler configuration. A build-time /
 * export-condition-folded flag would tree-shake better but silently resolves to
 * the WRONG literal on any bundler that doesn't set the `browser` condition — a
 * correctness footgun we deliberately avoid. The trade-off: a `typeof` check is
 * opaque to dead-code elimination, so an `if (isServer)` branch is NOT stripped
 * from the other bundle. That is fine for the intended use — small environment
 * guards (module-level singletons, lazy globals, render output that differs
 * server vs client).
 *
 * **Reach for these only for the residual case.** For DOM access inside a
 * component, prefer `onMount` / `effect` — they never run during
 * `renderToString`, so no guard is needed. To keep a heavy SERVER-ONLY module
 * out of the client bundle, use a `/server` subpath export, not these flags
 * (a runtime flag cannot tree-shake the module away).
 *
 * @example
 * import { isServer, isClient } from '@pyreon/reactivity' // or '@pyreon/core'
 * if (isServer) return                 // skip browser-only setup during SSR
 * const root = isClient ? document.body : null
 */
export const isServer = typeof document === 'undefined'

/** Inverse of {@link isServer} — `true` on a browser main thread (DOM available). */
export const isClient = typeof document !== 'undefined'

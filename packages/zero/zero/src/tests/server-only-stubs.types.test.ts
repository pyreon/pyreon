/**
 * Compile-time regression for the server-only stubs re-exported from the
 * `@pyreon/zero` client MAIN entry.
 *
 * These stubs (`createServer`, `faviconPlugin`, `seoPlugin`, `defineConfig`,
 * `validateEnv`, `ogImagePlugin`, `aiPlugin`) exist so that accidentally
 * importing a server-only API from the client entry FAILS at the call site.
 * Historically each was typed `(..._: unknown[]) => never`, which typechecks
 * for ANY call — so `createServer(cfg)` passed `tsc` / `zero dev` / e2e and
 * only threw at RUNTIME in the built server. A 0.39→0.41 bump shipped a prod
 * deployable that crashed at boot with every check green.
 *
 * Each stub now takes a message-typed parameter (`ServerOnlyArg`), so a real
 * call argument is not assignable — the call is a COMPILE error surfacing the
 * "import from @pyreon/zero/<subpath>" fix in the tsc message. The runtime
 * throw stays as belt-and-suspenders for non-typechecked callers.
 *
 * This file is typechecked by `tsc --noEmit` (the package `typecheck` script).
 * The body below is a function that is NEVER invoked — the `@ts-expect-error`
 * directives are the assertion: each one FAILS `tsc` ("unused '@ts-expect-error'
 * directive") if the call ever compiles again, catching a regression of the
 * server-only type gate. It never runs, so the runtime `never`-throw is never
 * hit. Bisect-verified: reverting the stubs to `(..._: unknown[]) => never`
 * makes every call compile → every `@ts-expect-error` reports "unused" → tsc
 * fails.
 */

import { describe, expect, it } from 'vitest'
import {
  aiPlugin,
  createServer,
  defineConfig,
  faviconPlugin,
  ogImagePlugin,
  seoPlugin,
  validateEnv,
} from '../index'

// oxlint-disable-next-line no-unused-vars
function _serverOnlyStubsAreCompileErrors() {
  // @ts-expect-error — createServer is server-only; import from "@pyreon/zero/server"
  createServer({ routes: [] })
  // @ts-expect-error — faviconPlugin is server-only; import from "@pyreon/zero/favicon"
  faviconPlugin({})
  // @ts-expect-error — seoPlugin is server-only; import from "@pyreon/zero/seo"
  seoPlugin({})
  // @ts-expect-error — defineConfig is server-only; import from "@pyreon/zero/config"
  defineConfig({})
  // @ts-expect-error — validateEnv is server-only; import from "@pyreon/zero/env"
  validateEnv({})
  // @ts-expect-error — ogImagePlugin is server-only; import from "@pyreon/zero/og-image"
  ogImagePlugin({})
  // @ts-expect-error — aiPlugin is server-only; import from "@pyreon/zero/ai"
  aiPlugin({})

  // A zero-arg call is ALSO a type error — the message-typed parameter is
  // required, so even `createServer()` cannot compile from the client entry.
  // @ts-expect-error — createServer requires no valid argument; it is server-only
  createServer()
}

describe('server-only stubs — belt-and-suspenders runtime throw', () => {
  it('still throws a clear, subpath-pointing error for non-typechecked callers', () => {
    // The compile gate above stops typechecked callers. A plain-JS / `as any`
    // caller bypasses tsc, so the runtime throw must remain. The cast models a
    // caller that erased the message-typed parameter (exactly what `as any`
    // does), and asserts the runtime body still fires the actionable message.
    const loose = createServer as unknown as (...a: unknown[]) => never
    expect(() => loose({ routes: [] })).toThrow(
      /"createServer" is server-only and cannot be imported from "@pyreon\/zero"/,
    )
    expect(() => loose({ routes: [] })).toThrow(
      /import \{ createServer \} from "@pyreon\/zero\/server"/,
    )

    const looseFavicon = faviconPlugin as unknown as (...a: unknown[]) => never
    expect(() => looseFavicon({})).toThrow(/"faviconPlugin" is server-only/)
  })
})

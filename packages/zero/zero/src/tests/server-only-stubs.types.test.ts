/**
 * Compile-time regression: server-only APIs are NOT on the `@pyreon/zero`
 * client MAIN entry.
 *
 * `createServer` / `faviconPlugin` / `seoPlugin` / `defineConfig` /
 * `validateEnv` / `ogImagePlugin` / `aiPlugin` touch `node:*` and live ONLY on
 * their per-feature subpaths (`@pyreon/zero/server` · `/favicon` · `/seo` ·
 * `/config` · `/env` · `/og-image` · `/ai`). They were previously re-exported
 * from the client barrel as `(..._: unknown[]) => never` stubs that threw only
 * at RUNTIME — so `import { createServer } from '@pyreon/zero'; createServer(cfg)`
 * typechecked cleanly and only crashed the built server at boot (the
 * 0.39→0.41 prod-outage shape). The fundamentally-correct boundary is
 * structural: the symbols are simply ABSENT from the barrel, so importing one
 * from `@pyreon/zero` is a plain `TS2305: '@pyreon/zero' has no exported
 * member '<name>'`, and no server-stub code reaches the client bundle.
 *
 * This file is typechecked via `tsconfig.types-tests.json` (the main
 * `tsconfig.json` excludes `src/tests`), wired into the package `typecheck`
 * script so the existing CI `Typecheck` job enforces it. Each
 * `@ts-expect-error` below asserts the property is ABSENT from the barrel's
 * type — if someone re-adds a stub, `ZeroMain.<name>` resolves, the directive
 * goes UNUSED, and `tsc` fails with `TS2578`. Bisect-verified: re-adding a
 * single `export const createServer` to `src/index.ts` fails this file with
 * `TS2578 Unused '@ts-expect-error'` on the `createServer` line.
 */

import { describe, expect, it } from 'vitest'
import * as ZeroMain from '@pyreon/zero'

// oxlint-disable-next-line no-unused-vars
function _serverOnlyApisAbsentFromClientBarrel() {
  // @ts-expect-error — createServer is server-only; import from "@pyreon/zero/server"
  void ZeroMain.createServer
  // @ts-expect-error — faviconPlugin is server-only; import from "@pyreon/zero/favicon"
  void ZeroMain.faviconPlugin
  // @ts-expect-error — seoPlugin is server-only; import from "@pyreon/zero/seo"
  void ZeroMain.seoPlugin
  // @ts-expect-error — defineConfig is server-only; import from "@pyreon/zero/config"
  void ZeroMain.defineConfig
  // @ts-expect-error — validateEnv is server-only; import from "@pyreon/zero/env"
  void ZeroMain.validateEnv
  // @ts-expect-error — ogImagePlugin is server-only; import from "@pyreon/zero/og-image"
  void ZeroMain.ogImagePlugin
  // @ts-expect-error — aiPlugin is server-only; import from "@pyreon/zero/ai"
  void ZeroMain.aiPlugin
}

describe('server-only APIs are absent from the @pyreon/zero client barrel', () => {
  it('exposes none of the 7 server-only symbols on the runtime namespace', () => {
    // Runtime companion to the compile-time assertions above: the structural
    // boundary means the client bundle carries no stub at all, so each symbol
    // is genuinely `undefined` on the barrel namespace.
    const barrel = ZeroMain as Record<string, unknown>
    for (const name of [
      'createServer',
      'faviconPlugin',
      'seoPlugin',
      'defineConfig',
      'validateEnv',
      'ogImagePlugin',
      'aiPlugin',
    ]) {
      expect(barrel[name], `${name} must not be re-exported from @pyreon/zero`).toBeUndefined()
    }
  })
})

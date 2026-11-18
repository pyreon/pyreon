/**
 * Builds the islands-only fixture (#4371) with zero's SOURCE: the build-output
 * test (`islands-only-build.test.ts`) and the `zero-islands-only` e2e suite
 * both call it, so they assert on the same output.
 *
 *   bun packages/zero/zero/src/tests/integration/fixture-islands-only/build.ts <outDir> [ssr <port>]
 *
 * `ssr` builds the same app in `mode: 'ssr'` with the node adapter instead:
 * `node <outDir>/index.js` then serves every page per request (the e2e suite
 * reads the server-rendered HTML of both page kinds from it).
 */
import { resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import { build } from 'vite'
import type { ZeroConfig } from '../../../types'
import { zeroPlugin } from '../../../vite-plugin'

export const FIXTURE = import.meta.dirname

export async function buildIslandsOnlyFixture(
  outDir: string,
  server?: { mode: 'ssr'; port: number },
  /** `routeRules` for the build: `{ '/**': { hydrate: 'islands' } }` makes every page islands-only. */
  routeRules?: ZeroConfig['routeRules'],
): Promise<void> {
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: [
      pyreon(),
      ...zeroPlugin({
        ...(server ? { mode: server.mode, port: server.port } : { mode: 'ssg' as const }),
        ...(routeRules ? { routeRules } : {}),
      }),
    ],
    resolve: { conditions: ['bun'] },
    build: { outDir, emptyOutDir: true },
  })
}

if (import.meta.main) {
  const [outDir, mode, port] = process.argv.slice(2)
  await buildIslandsOnlyFixture(
    resolve(outDir ?? resolve(FIXTURE, 'dist')),
    mode === 'ssr' ? { mode: 'ssr', port: Number(port ?? 5214) } : undefined,
  )
}

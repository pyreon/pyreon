/**
 * Builds the islands-only fixture (#4371) with zero's SOURCE: the build-output
 * test (`islands-only-build.test.ts`) and the `zero-islands-only` e2e suite
 * both call it, so they assert on the same output.
 *
 *   bun packages/zero/zero/src/tests/integration/fixture-islands-only/build.ts <outDir>
 */
import { resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import { build } from 'vite'
import { zeroPlugin } from '../../../vite-plugin'

export const FIXTURE = import.meta.dirname

export async function buildIslandsOnlyFixture(outDir: string): Promise<void> {
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: [pyreon(), ...zeroPlugin({ mode: 'ssg' })],
    resolve: { conditions: ['bun'] },
    build: { outDir, emptyOutDir: true },
  })
}

if (import.meta.main) {
  await buildIslandsOnlyFixture(resolve(process.argv[2] ?? resolve(FIXTURE, 'dist')))
}

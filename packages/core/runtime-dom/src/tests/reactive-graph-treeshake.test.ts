/**
 * The reactive-graph binding instrumentation (#4470) costs nothing in
 * production: every call into the reactivity devtools helpers sits behind the
 * bare `process.env.NODE_ENV` gate, so a production bundle of each instrumented
 * runtime-dom module does not even IMPORT them.
 *
 * The import check is the sharp one. A dev-only helper FUNCTION (rather than an
 * inline dev block) was dropped from the bundle as dead code, but esbuild kept
 * the external import it referenced — so the shipped module still named the
 * devtools helpers. The dev bundle is checked too, so this cannot pass because
 * the instrumentation was removed.
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const HELPERS = /_rdLabelBinding|_rdNoteTarget|_rdOpenBindingFrame|_rdCloseBindingFrame|_rdDropBinding/

async function bundle(file: string, env: 'production' | 'development'): Promise<string> {
  const r = await build({
    entryPoints: [join(SRC, file)],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    logLevel: 'silent',
    external: ['@pyreon/*'],
    define: { 'process.env.NODE_ENV': JSON.stringify(env) },
  })
  return r.outputFiles[0]!.text
}

describe('reactive-graph binding instrumentation — production tree-shake', () => {
  for (const file of ['template.ts', 'props.ts', 'mount.ts', 'nodes.ts', 'hydration-plan.ts']) {
    it(`${file}: no devtools helper survives (not even as an import)`, async () => {
      expect(await bundle(file, 'production')).not.toMatch(HELPERS)
    })

    it(`${file}: the helpers ARE present in development (anti-false-pass)`, async () => {
      expect(await bundle(file, 'development')).toMatch(HELPERS)
    })
  }
})

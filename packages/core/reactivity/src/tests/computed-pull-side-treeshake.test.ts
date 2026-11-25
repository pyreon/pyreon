/**
 * Bundle lock: code that never creates a computed does not ship the pull side.
 *
 * The computed evaluation (`ComputedNode`, `updateComputed`, `checkDirty`,
 * `refreshComputed`, the direct-updater watcher) lives in computed.ts, and the
 * effect and flush code reach it through `_cx` (graph.ts) instead of an
 * import. While it sat in graph.ts, every page that mounted anything carried
 * it: pyreon.dev's shell grew ~690 B gz although the shell creates no
 * computed (the computed chunk it used to lazy-load shrank by the same code).
 *
 * The probe bundles from source with names kept and looks for the
 * declarations, then bundles a `computed` import and asserts they ARE there,
 * so the lock cannot pass because the names changed.
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const PULL_SIDE = ['checkDirty', 'updateComputed', 'refreshComputed', 'ComputedNode']

// Module paths, not the package entry: esbuild cannot take named imports from
// the entry's `package.json` import (it carries an import attribute).
const MODULES: Record<string, string> = {
  signal: './signal',
  computed: './computed',
  batch: './batch',
  runUntracked: './graph',
  effect: './effect',
  renderEffect: './effect',
  _bind: './effect',
  _renderBind: './effect',
  _effectOwned: './effect',
  onCleanup: './effect',
}

async function bundle(names: readonly string[]): Promise<string> {
  const imports = names.map((n) => `import { ${n} } from '${MODULES[n]}'`).join('\n')
  const r = await build({
    stdin: {
      contents: `${imports}\nglobalThis.__probe = [${names.join(', ')}]\n`,
      resolveDir: SRC,
      loader: 'ts',
    },
    bundle: true,
    minifySyntax: true,
    minifyWhitespace: false,
    minifyIdentifiers: false,
    write: false,
    format: 'esm',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  })

  return r.outputFiles[0]!.text
}

describe('the pull side ships only with computed()', () => {
  it('a bundle of signals, effects and render bindings does not contain it', async () => {
    const out = await bundle(['signal', 'effect', 'renderEffect', '_bind', '_renderBind', '_effectOwned', 'batch', 'onCleanup', 'runUntracked'])
    for (const marker of PULL_SIDE) expect(out).not.toContain(marker)
  })

  it('a bundle that imports computed does (anti-false-pass)', async () => {
    const out = await bundle(['signal', 'effect', 'computed'])
    for (const marker of PULL_SIDE) expect(out).toContain(marker)
  })
})

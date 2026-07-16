/**
 * nativeCompat PURE-form tree-shake lock (LIB-level).
 *
 * A bare module-level `nativeCompat(X)` STATEMENT is an unremovable side
 * effect once the built lib concatenates modules into a shared chunk:
 * `sideEffects: false` can only drop whole FILES, and the chunk file is
 * used (it carries `mount`'s internals) — so the statement runs and RETAINS
 * the component body in every consumer bundle that never imports it
 * (measured: ~1.2KB gz of dead Transition/TransitionGroup machinery in a
 * mount-only krausest bundle). The fix is the assignment form
 * `const _X = /* @__PURE__ * / nativeCompat(X); export { _X as X }` — the
 * PURE call is droppable exactly when the export is unused, and applies the
 * marker to the SAME fn when used (`native-markers.test.ts` locks that
 * side).
 *
 * This spec bundles the BUILT lib (requires `lib/` — CI's test cells run
 * after bootstrap; locally run `bun scripts/bootstrap.ts` first) with a
 * mount-only entry and asserts the transition machinery is ABSENT — plus a
 * positive control proving the marker string DOES appear when Transition* is
 * imported (so a minifier rename can't silently blind the assertion).
 *
 * BISECT (requires a lib rebuild per the dev-server-bisect recipe): revert
 * `transition-group.ts` to the bare `nativeCompat(TransitionGroup)`
 * statement → `bun run --filter='@pyreon/runtime-dom' build` → the
 * mount-only spec fails with `cancelTransition` found; restore + rebuild →
 * passes. Verified 2026-07-17.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB_ENTRY = resolve(HERE, '../../lib/index.js')

async function bundleWith(source: string): Promise<string> {
  const result = await build({
    stdin: {
      contents: source,
      resolveDir: resolve(HERE, '../..'),
      loader: 'ts',
    },
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  return result.outputFiles[0]!.text
}

describe('nativeCompat PURE form — mount-only consumers do not pay for Transition*', () => {
  it('lib/ is present in this environment (a skipped suite must never masquerade as coverage)', () => {
    expect(existsSync(LIB_ENTRY)).toBe(true)
  })

  it('mount-only bundle contains NO transition machinery', async () => {
    const out = await bundleWith(
      `import { mount } from ${JSON.stringify(LIB_ENTRY)}\nconsole.log(typeof mount)`,
    )
    // `cancelTransition` is a PROPERTY name — minification-stable, and unique
    // to Transition/TransitionGroup/KeepAlive internals.
    expect(out).not.toContain('cancelTransition')
  })

  it('positive control: importing TransitionGroup DOES pull the machinery (assertion is not blind)', async () => {
    const out = await bundleWith(
      `import { mount, TransitionGroup } from ${JSON.stringify(LIB_ENTRY)}\nconsole.log(typeof mount, typeof TransitionGroup)`,
    )
    expect(out).toContain('cancelTransition')
  })
})

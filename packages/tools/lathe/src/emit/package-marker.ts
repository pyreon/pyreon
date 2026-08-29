/**
 * The `package.json` marker emitted alongside the generated code.
 *
 * This is the single change that makes the generated client tree-shake, and
 * it is worth explaining because the obvious alternatives do not work.
 *
 * A bundler retains a module-level CALL unless it can prove the call has no
 * side effects. `api.endpoint('GET /books', …)` and `s.object({ … })` are both
 * module-level calls, so importing one hook through a barrel that names every
 * tag retains every endpoint in the spec, and a fixture table named by that
 * same barrel lands in the page bundle as DATA. Measured with Vite 8 on a
 * 30-tag / 120-operation spec, importing a single hook:
 *
 *   no marker      30,710 B (2,420 gz) — 120 endpoints, 120 fixtures
 *   with marker     5,748 B   (642 gz) — 4 endpoints, 0 fixtures
 *
 * `/* @__PURE__ *\/` on each declaration is the reflex and is nearly useless
 * here — measured 2,041 B -> 2,000 B, 2% — because the ARGUMENTS are
 * themselves calls (`s.string().uuid()`) that the bundler must still evaluate.
 * The `sideEffects` field answers the question at the level it is actually
 * asked: about the MODULE, not about one expression inside it.
 *
 * It also removes a dependency on the consumer's own configuration. Without
 * this file the behaviour is decided by whether the APP's `package.json`
 * happens to declare `sideEffects: false` — measured, an app that declares it
 * was never affected and an app that does not carried the whole fixture table.
 * A generator should not produce output whose bundle cost depends on a field
 * in a file it did not write.
 *
 * The declaration is an ARRAY, not `false`, because `false` would be a LIE:
 * `atlas.wrapper.tsx` calls `installMocks()` at module scope, which is the
 * whole point of a workbench wrapper. Listing it keeps the claim true, and a
 * true claim is the only kind a bundler can safely act on.
 */

import { jsonLiteral, type GeneratedFile } from './writer'

export const PACKAGE_MARKER_FILE = 'package.json'

/** Emitted files whose module scope really does something. */
const SIDE_EFFECTFUL = ['./atlas.wrapper.tsx']

/**
 * Emit the marker.
 *
 * `type: module` states what the files already are. It is stated rather than
 * left to inference because this file BECOMES the nearest `package.json` for
 * everything under the output directory, and under Node16-style resolution a
 * nearest-package.json without `type` means CommonJS — so omitting it would
 * silently reclassify the generated modules for anyone not on bundler
 * resolution.
 */
export function emitPackageMarker(plugins: readonly string[]): GeneratedFile {
  const effects = SIDE_EFFECTFUL.filter(() => plugins.includes('atlas'))
  return {
    path: PACKAGE_MARKER_FILE,
    contents: `${jsonLiteral(
      {
        // No `name`: this is a marker, not a package. Naming it would make it
        // resolvable as one and invite a bare specifier that never worked.
        type: 'module',
        sideEffects: effects.length > 0 ? effects : false,
      },
      2,
    )}\n`,
  }
}

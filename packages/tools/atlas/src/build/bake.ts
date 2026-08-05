/**
 * Bake the node-only RPC answers into a static payload.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Two of the workbench's panels are answered by NODE, over the `atlas dev` RPC
 * channel, because they cannot run in a page: `source` reads a file, and `lens`
 * pulls in the TypeScript compiler API + oxc. A static build has no server, so
 * on a deployed site both would fail — the Docs view's source block would sit
 * at "Show source" forever and the Reactivity Lens would report itself
 * unavailable.
 *
 * That failure mode is the dangerous kind: the site LOOKS complete. Every other
 * panel works, so nothing announces that the two most valuable views are dark.
 * So the build precomputes both, per component, and ships the answers as data.
 *
 * ── Why it calls the real methods ─────────────────────────────────────────
 *
 * The payload is produced by invoking THE SAME `builtinMethods` the dev server
 * serves, not by a second implementation that reads files and runs the analyzer
 * again. A parallel implementation is a divergence factory: the static site
 * would answer subtly differently from `atlas dev`, and the difference would
 * show up as "the deployed docs disagree with my editor" long after the cause.
 *
 * ── Failures are baked too ────────────────────────────────────────────────
 *
 * A component whose lens cannot be computed (no `@pyreon/compiler` installed, a
 * file that no longer parses) records the REASON. Without that the client falls
 * through to a fetch that cannot succeed, and the user reads a network error
 * about a request that was never going to work — instead of the actual reason,
 * which is actionable.
 */
import type { RpcMethod } from '../dev/plugin'

/**
 * `method → component name → result`.
 *
 * A method taking no component (the `components` probe) is stored under the
 * empty-string key, which is what `String(params.component ?? '')` produces on
 * the client — so one lookup shape covers both.
 */
export type BakedRpc = Record<string, Record<string, unknown>>

/** A baked failure. Distinguishable from a legitimate result by the brand. */
export interface BakedRpcError {
  __atlasRpcError: string
}

export function isBakedRpcError(value: unknown): value is BakedRpcError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BakedRpcError).__atlasRpcError === 'string'
  )
}

export interface BakeOptions {
  /** The dev server's methods — invoked verbatim, never reimplemented. */
  methods: Record<string, RpcMethod>
  /** Component names to bake per-component methods for. */
  components: readonly string[]
  /**
   * Which methods take a `{ component }` parameter. Everything else is called
   * once with no params.
   */
  perComponent?: readonly string[]
  /** Receives a one-line note for each baked failure (defaults to silence). */
  onWarn?: (message: string) => void
}

const DEFAULT_PER_COMPONENT = ['source', 'lens'] as const

/**
 * Invoke each method for each component and collect the answers.
 *
 * Sequential on purpose. `lens` runs the TypeScript compiler; a hundred of them
 * in parallel is a hundred concurrent programs, which on a real design system
 * is how a build turns into an OOM rather than a speedup. The whole pass is a
 * few seconds even on a large catalog, and it runs once per build.
 */
export async function bakeRpc(options: BakeOptions): Promise<BakedRpc> {
  const perComponent = options.perComponent ?? DEFAULT_PER_COMPONENT
  const baked: BakedRpc = {}

  for (const [method, fn] of Object.entries(options.methods)) {
    const slot: Record<string, unknown> = {}
    baked[method] = slot

    if (!perComponent.includes(method)) {
      // A no-parameter method (the `components` probe). A failure here is not
      // worth a warning — nothing in the UI depends on it.
      try {
        slot[''] = await fn({})
      } catch {
        /* not baked; the client reports it unavailable */
      }
      continue
    }

    for (const component of options.components) {
      try {
        slot[component] = await fn({ component })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        slot[component] = { __atlasRpcError: reason } satisfies BakedRpcError
        options.onWarn?.(`atlas build: ${method}(${component}) — ${reason}`)
      }
    }
  }

  return baked
}

/**
 * The `<script>` that installs the payload before the workbench boots.
 *
 * Emitted as a separate leading script rather than folded into the entry
 * module: the entry is an ES module and therefore deferred, so anything it
 * imports could already have read the global. Installing it first makes the
 * ordering explicit rather than incidental.
 *
 * Serialized with `JSON.stringify` and then escaped for the HTML parser: the
 * payload contains COMPONENT SOURCE, so a component whose source contains the
 * literal `</script>` would otherwise close this tag and inject the rest of the
 * file as markup. The parser sees the escape; `JSON.parse` does not care.
 */
export function bakedRpcScript(baked: BakedRpc): string {
  const json = JSON.stringify(baked)
    // `</script` in any casing ends the block in an HTML parser.
    .replaceAll('</', '<\\/')
    // A lone `<!--` opens a comment in the legacy script grammar.
    .replaceAll('<!--', '<\\!--')
    // U+2028 / U+2029 are legal raw in JSON but were illegal raw in a JS
    // string literal until ES2019 — still escaped, because this script is
    // parsed by whatever engine a visitor brings. Written via `fromCharCode`
    // so the characters are visible in review rather than invisible bytes.
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029')
  return `<script>globalThis.__ATLAS_STATIC_RPC__ = ${json}</script>`
}


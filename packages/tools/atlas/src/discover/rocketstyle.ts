/**
 * Discover rocketstyle components, and read their dimensions.
 *
 * The static scanner reads exported PascalCase FUNCTIONS with a typed props
 * parameter. A rocketstyle component is neither — it is a const holding a call
 * chain:
 *
 *     export const Button = el.attrs({ tag: 'button' }).theme(…).variants(…)
 *
 * so a design system built the way Pyreon's own `@pyreon/ui-components` is
 * built discovered ZERO components. That is the primary shape of a Pyreon UI
 * library, and it was invisible to the catalog.
 *
 * Detection is by RUNTIME TRUTH, not syntax. A static heuristic ("a const whose
 * initializer is a call chain ending in `.theme()`") is guesswork that both
 * misses real components and invents fake ones; `IS_ROCKETSTYLE` on the loaded
 * export is the same flag rocketstyle itself checks. This needs a module loader,
 * which is why it is separate from the scanner rather than folded into it.
 *
 * The dimensions come from `getStaticDimensions(theme)` — rocketstyle's own
 * introspection API, the one that answers what `state` / `size` / `variant`
 * actually accept. Deriving that from types is impossible: the values live in
 * `.variants((t) => ({ solid: …, soft: … }))` callbacks, which is data, not a
 * type. This is the only way to know them without running the chain.
 */
import { resolve } from 'node:path'
import type { ComponentIntelligence, ComponentRef, PropControl, VariantAxis } from '../core'
import { deriveContent } from '../core'
import type { ModuleLoader } from './load'

/** The shape rocketstyle attaches to a finished component. */
interface RocketstyleComponent {
  IS_ROCKETSTYLE?: boolean
  displayName?: string
  getStaticDimensions?: (theme: unknown) => {
    dimensions?: Record<string, Record<string, unknown>>
  }
  /** The `.attrs()` chain rocketstyle exposes — where `tag` lives. */
  __rs_attrs?: ReadonlyArray<unknown>
  /** The base the chain renders — a tag string, or a component. */
  __rs_component?: unknown
}

/**
 * The DOM tag a rocketstyle component renders as, read off its `.attrs()`
 * chain — `el.attrs({ tag: 'button' })` is how every `@pyreon/elements`-based
 * component says what it is. Each entry is applied like rocketstyle applies it
 * (a function of props, or a plain object); the last `tag` wins, the same as
 * at render. Undefined when nothing in the chain sets one, and never a throw:
 * an attrs callback that dereferences a prop we did not pass is the
 * component's business, not a reason to lose the whole entry.
 */
export function readTag(value: unknown): string | undefined {
  const component = value as RocketstyleComponent | undefined
  // `.config({ component: 'hr' })` renders the tag DIRECTLY — no attrs chain
  // ever names it. An attrs `tag` still wins when both are present.
  let tag: string | undefined = typeof component?.__rs_component === 'string' ? component.__rs_component : undefined
  const chain = component?.__rs_attrs
  if (!Array.isArray(chain)) return tag
  for (const entry of chain) {
    try {
      const attrs = typeof entry === 'function' ? entry({}) : entry
      const t = (attrs as { tag?: unknown } | null | undefined)?.tag
      if (typeof t === 'string') tag = t
    } catch {
      // see above
    }
  }
  return tag
}

/**
 * The COMPONENT a rocketstyle chain renders through, by display name —
 * `el.config({ component: ModalBase })` sets `__rs_component` to the base
 * function. Undefined when the chain renders a tag (a string base, or an
 * attrs `tag`), which is the case `readTag` answers instead.
 */
export function readBase(value: unknown): string | undefined {
  const base = (value as RocketstyleComponent | undefined)?.__rs_component
  if (typeof base !== 'function') return undefined
  const named = base as { displayName?: unknown; name?: unknown }
  const name = typeof named.displayName === 'string' ? named.displayName : named.name
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

export interface RocketstyleDiscoveryOptions {
  /** Loads a module — the same one the components will be mounted from. */
  loader: ModuleLoader
  /**
   * The theme to read dimensions against.
   *
   * Required in practice, not in the type. Dimension callbacks receive the
   * theme (`.variants((t) => ({ solid: { color: t.accent } }))`), so calling
   * with `{}` throws the moment one reads a token — the VALUE is irrelevant
   * here (only the KEYS are read), but it still has to exist. Without one, a
   * component reports no axes rather than crashing the scan.
   */
  theme?: unknown
  /**
   * Called once per file that could not be LOADED.
   *
   * A file that fails to load is not the same as a file with no rocketstyle in
   * it, and treating them alike is how this pass came to report zero for a
   * whole package while looking healthy. Measured on `@pyreon/ui-components`:
   * all ~67 rocketstyle components vanished because one broken `exports` map
   * upstream made every file throw, and the loop swallowed each throw as "has
   * nothing to introspect".
   *
   * Optional, so existing callers are unchanged — but the CLI passes one, and
   * the scan reports what it could not read instead of quietly under-counting.
   */
  onLoadError?: (file: string, message: string) => void
}

/** Dimension values → a select control, so the workbench can drive it. */
function toControl(name: string, values: readonly string[]): PropControl {
  return { name, kind: 'select', options: values, reactive: false, required: false }
}

/**
 * Read one loaded export's dimensions.
 *
 * Returns undefined for anything that is not a rocketstyle component. A THROW
 * from the chain is caught and treated as "no dimensions": the theme may be
 * absent or the wrong shape, and a scan that dies on one component's styling
 * callback would take the whole catalog with it.
 */
export function readDimensions(value: unknown, theme: unknown): VariantAxis[] | undefined {
  const component = value as RocketstyleComponent | undefined
  if (typeof value !== 'function' || component?.IS_ROCKETSTYLE !== true) return undefined
  if (typeof component.getStaticDimensions !== 'function') return []
  try {
    const { dimensions } = component.getStaticDimensions(theme ?? {})
    if (!dimensions) return []
    return Object.entries(dimensions)
      .map(([name, values]) => ({ name, values: Object.keys(values) }))
      .filter((axis) => axis.values.length > 0)
  } catch {
    return []
  }
}

/**
 * Load each file and emit intelligence for its rocketstyle exports.
 *
 * `skip` carries the names the static scanner already claimed. A rocketstyle
 * component wrapped in an exported function is found by BOTH, and emitting it
 * twice would put two entries with the same name in the sidebar and double
 * every scenario it generates.
 */
export async function discoverRocketstyle(
  files: readonly string[],
  options: RocketstyleDiscoveryOptions,
  skip: ReadonlySet<string> = new Set(),
): Promise<ComponentIntelligence[]> {
  const out: ComponentIntelligence[] = []
  const seen = new Set(skip)

  // Serial on purpose. Issuing the loads concurrently (bounded at 12, results
  // still consumed in file order so `seen` stays deterministic) was measured
  // and is SLOWER — median 4916ms against 4613ms on `@pyreon/ui-components`.
  // Vite's `ssrLoadModule` serializes on the shared module graph, so a fan-out
  // adds contention without adding parallelism, and the cost here is dominated
  // by building that graph once: the first two files take ~300ms and ~120ms,
  // every file after them ~0.8ms.
  //
  // ── There is deliberately NO per-file load cache here ────────────────────
  //
  // The obvious next optimisation is a `file → exported names` index so a
  // SCOPED run (`atlas verify Button`) loads one file instead of all of them.
  // It was built and measured (2026-08-11) and does not pay:
  //
  //   @pyreon/ui-components (82 files, has a barrel)  313-330ms → 336ms  SLOWER
  //   examples/atlas-workshop (9 files, no barrel)     26-28ms  →   7-8ms
  //
  // The plan itself worked — 1 load instead of 82 — and saved nothing, because
  // Vite's module graph already caches transitively. A design system's files
  // import shared bases and a barrel re-exports everything, so loading ANY
  // connected file pulls the rest in; the 81 "skipped" loads were already
  // near-free graph hits. Best case is ~20ms of a ~1950ms command (1%), and the
  // dominant costs are elsewhere and irreducible by a cache: ~800ms of process
  // start + module import, and ~291ms building the graph for the first file you
  // load — which a scoped run must load regardless.
  //
  // It also came with a correctness surface (staleness, and a full-load
  // fallback so a stale index could never answer "no such component" for a
  // component that exists). Do not rebuild it without first measuring a shape
  // where the per-file marginal cost is actually the bottleneck.
  for (const file of files) {
    let mod: Record<string, unknown>
    try {
      // Absolutized here because the walk records cwd-RELATIVE paths and the
      // loader contract is absolute. A relative id reaches Vite as a bare url
      // whose own relative imports cannot resolve — so any rocketstyle
      // component in a file with a `./sibling` import was silently dropped
      // (plus a Vite "Failed to load url" logged on every scan).
      mod = await options.loader.load(resolve(file))
    } catch (err) {
      // REPORTED, not swallowed. "Will not load" and "contains no rocketstyle"
      // produce the same zero here, and only one of them is a finding — so a
      // silent `continue` turns a broken import into a package that simply
      // looks like it has no components. That is the exact silent-drop this
      // tool exists to prevent, committed by the tool itself.
      options.onLoadError?.(file, err instanceof Error ? err.message : String(err))
      continue
    }
    for (const [name, value] of Object.entries(mod)) {
      if (seen.has(name) || !/^[A-Z]/.test(name)) continue
      const axes = readDimensions(value, options.theme)
      if (!axes) continue
      seen.add(name)
      // Dimensions say how the component can LOOK; they never say what it
      // renders WITH. Without this every derived scenario mounted an empty
      // `<button>` / `<h2>` / `<div>` — see `core/content.ts`.
      const base = readBase(value)
      const content = deriveContent({ name, tag: readTag(value), base })
      out.push({
        name,
        component: value as ComponentRef,
        controls: [...axes.map((axis) => toControl(axis.name, axis.values)), ...content.controls],
        axes,
        scenarios: [],
        tags: [],
        source: file,
        ...(Object.keys(content.args).length > 0 ? { content: content.args } : {}),
        ...(base ? { base } : {}),
      })
    }
  }
  return out
}

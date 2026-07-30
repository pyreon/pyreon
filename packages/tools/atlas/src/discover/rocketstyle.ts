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
import type { ModuleLoader } from './load'

/** The shape rocketstyle attaches to a finished component. */
interface RocketstyleComponent {
  IS_ROCKETSTYLE?: boolean
  displayName?: string
  getStaticDimensions?: (theme: unknown) => {
    dimensions?: Record<string, Record<string, unknown>>
  }
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

  for (const file of files) {
    let mod: Record<string, unknown>
    try {
      // Absolutized here because the walk records cwd-RELATIVE paths and the
      // loader contract is absolute. A relative id reaches Vite as a bare url
      // whose own relative imports cannot resolve — so any rocketstyle
      // component in a file with a `./sibling` import was silently dropped
      // (plus a Vite "Failed to load url" logged on every scan).
      mod = await options.loader.load(resolve(file))
    } catch {
      continue // a module that will not load has nothing to introspect
    }
    for (const [name, value] of Object.entries(mod)) {
      if (seen.has(name) || !/^[A-Z]/.test(name)) continue
      const axes = readDimensions(value, options.theme)
      if (!axes) continue
      seen.add(name)
      out.push({
        name,
        component: value as ComponentRef,
        controls: axes.map((axis) => toControl(axis.name, axis.values)),
        axes,
        scenarios: [],
        tags: [],
        source: file,
      })
    }
  }
  return out
}

/**
 * Colour-scope providers — how a LIBRARY observes the compile-time colour mode
 * without the compiler core knowing the library.
 *
 * `<PyreonUI mode>` and `<ColorModeProvider mode>` pin the framework-wide colour
 * mode and `<ChartThemeProvider>` layers a theme over it. None of them carries a
 * runtime context natively: each is a compile-time SCOPE, entered while the
 * element's children are emitted and left (saved and restored in `finally`) when
 * they are done, so providers nest and a sibling inherits nothing. The core owns
 * HOW a provider element is emitted (a transparent `Group` / `Box`, plus the
 * colour-scheme pin a literal `<ColorModeProvider mode>` adds) and the plumbing;
 * what the scope IS — the value a library's own elements read back through
 * `EmitContext.colorScope<T>()` — belongs to the plugin that declared it.
 *
 * A provider claims `tags` imported from `module`; a `(module, tag)` pair has one
 * owner (load-time error naming both). The value is opaque to the compiler.
 */

import type { ElementClaimGuard } from './element-lowering'
import type { JsxElementIR } from './types'

/** What a provider receives when its element is entered. */
export interface ScopeEnterContext {
  /** Report a limitation to the author. */
  warn(message: string): void
  /** The scope in force around the element, or `undefined` outside any. */
  readonly outer: object | undefined
}

export interface ScopeProvider {
  /** Package root the tags must be imported from, e.g. `@pyreon/core`. */
  readonly module: string
  /** Tag names this provider claims (the imported symbol, which must equal the local JSX tag). */
  readonly tags: readonly string[]
  /**
   * The scope the element's children are emitted under. Returning `undefined`
   * leaves the children with NO scope (an enclosing one is not inherited
   * implicitly — return `ctx.outer` to keep it).
   */
  enter(el: JsxElementIR, ctx: ScopeEnterContext): object | undefined
  /**
   * The element exists ONLY to provide the scope: the core emits its children
   * under it, in a transparent wrapper, and nothing else. Leave it off for an
   * element the core already emits itself (`<PyreonUI>`, `<ColorModeProvider>`),
   * which only needs the scope entered.
   */
  readonly transparent?: boolean | undefined
}

export interface RegisteredScopeProvider {
  readonly provider: ScopeProvider
  /** The plugin that declared it. */
  readonly owner: string
}

/** One compiler instance's scope providers. */
export interface ScopeRegistry {
  readonly entries: readonly RegisteredScopeProvider[]
  /** The provider that claims `tag` when `guard` accepts `(tag, module)`, or `undefined`. */
  find(tag: string, guard: ElementClaimGuard): ScopeProvider | undefined
  /** True when some provider claims `name` (the parser then records where it was imported from). */
  hasTag(name: string): boolean
}

/**
 * Build a registry from every plugin's `scopes`, in plugin order. Throws when a
 * `(module, tag)` pair is claimed twice — two providers would make the scope a
 * tag opens depend on plugin order — and names both owners.
 */
export function createScopeRegistry(
  plugins: readonly { readonly name: string; readonly scopes?: readonly ScopeProvider[] | undefined }[],
): ScopeRegistry {
  const entries: RegisteredScopeProvider[] = []
  const claimed = new Map<string, string>()
  const tags = new Set<string>()
  for (const plugin of plugins) {
    for (const provider of plugin.scopes ?? []) {
      for (const tag of provider.tags) {
        const key = `${provider.module}\0${tag}`
        const existing = claimed.get(key)
        if (existing !== undefined) {
          throw new Error(
            `[Pyreon] colour-scope provider for <${tag}> from ${provider.module} is claimed by both "${existing}" and "${plugin.name}". ` +
              `A (module, tag) pair has exactly one scope provider — remove one of the two plugins from this app.`,
          )
        }
        claimed.set(key, plugin.name)
        tags.add(tag)
      }
      entries.push({ provider, owner: plugin.name })
    }
  }
  return Object.freeze<ScopeRegistry>({
    entries,
    find(tag, guard) {
      for (const { provider } of entries) {
        if (provider.tags.includes(tag) && guard(tag, provider.module)) return provider
      }
      return undefined
    },
    hasTag: (name) => tags.has(name),
  })
}

import type { Extension } from '@codemirror/state'
import type { EditorLanguage } from './types'

/** A grammar loader — resolves to the CodeMirror extension for one language. */
export type LanguageLoader = () => Promise<Extension>

/**
 * Grammar REGISTRY.
 *
 * Why a registry rather than one static map of every grammar: a dynamic
 * `import()` is lazy at RUNTIME, but a bundler's dependency scanner still
 * follows the specifier at build / dev-server-start time. A single map naming
 * eighteen `@codemirror/lang-*` packages therefore pulls the whole language
 * ecosystem into every consumer's pre-bundle step, even one that only ever
 * shows TSX — measured taking a dev-server-backed command from ~27s to over
 * five minutes. The old map's "only the requested language is imported"
 * promise held for the shipped bundle and quietly failed for the dep graph.
 *
 * So the core registers only what a JS-framework editor needs by default —
 * the JavaScript family (one package covers js/ts/jsx/tsx) plus JSON — and
 * every other grammar moves behind `@pyreon/code/languages-all`, which
 * registers the full set in a single import. Consumers needing an
 * unregistered grammar import that entry or register their own loader, and
 * pay for exactly what they use.
 */
const registry = new Map<string, LanguageLoader>([
  ['plain', () => Promise.resolve([])],
  ['javascript', () => import('@codemirror/lang-javascript').then((m) => m.javascript())],
  [
    'typescript',
    () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  ],
  ['jsx', () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true }))],
  [
    'tsx',
    () =>
      import('@codemirror/lang-javascript').then((m) =>
        m.javascript({ typescript: true, jsx: true }),
      ),
  ],
  ['json', () => import('@codemirror/lang-json').then((m) => m.json())],
])

// Cache loaded language extensions
const loaded = new Map<string, Extension>()

/**
 * Register a grammar loader, replacing any existing one for that id.
 *
 * This is how `@pyreon/code/languages-all` installs the remaining built-in
 * grammars, and how a consumer adds one the package does not ship:
 *
 * @example
 * ```ts
 * import { registerLanguage } from '@pyreon/code'
 *
 * registerLanguage('svelte', () =>
 *   import('@replit/codemirror-lang-svelte').then((m) => m.svelte()),
 * )
 * ```
 */
export function registerLanguage(id: string, loader: LanguageLoader): void {
  registry.set(id, loader)
  // A re-registration must not keep serving the previously loaded grammar.
  loaded.delete(id)
}

/**
 * Load a language extension. Returns the cached extension if already loaded.
 *
 * An UNREGISTERED language resolves to an empty extension — the editor still
 * mounts and shows the text, it simply is not highlighted. That used to be
 * silent; it now warns in dev naming the fix, because "the editor renders but
 * nothing is coloured, and nothing anywhere says why" is close to
 * undiagnosable from the outside.
 *
 * @example
 * ```ts
 * const ext = await loadLanguage('typescript')
 * ```
 */
export async function loadLanguage(language: EditorLanguage | string): Promise<Extension> {
  const cached = loaded.get(language)
  if (cached) return cached

  const loader = registry.get(language)
  if (!loader) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Pyreon] @pyreon/code: no grammar registered for "${language}" — the editor will render unhighlighted. ` +
          `Add \`import '@pyreon/code/languages-all'\` for the full built-in set, or register just this one with ` +
          `\`registerLanguage('${language}', () => import('…').then((m) => m.…()))\`.`,
      )
    }
    return []
  }

  try {
    const ext = await loader()
    loaded.set(language, ext)
    return ext
  } catch (err) {
    // The grammar package is missing or failed to evaluate. Same reasoning as
    // above: degrade to unhighlighted text, but say so rather than swallow.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Pyreon] @pyreon/code: grammar for "${language}" failed to load:`, err)
    }
    return []
  }
}

/** Every language id with a registered grammar, in registration order. */
export function getAvailableLanguages(): EditorLanguage[] {
  return [...registry.keys()] as EditorLanguage[]
}

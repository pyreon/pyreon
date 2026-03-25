import type { Extension } from "@codemirror/state"
import type { EditorLanguage } from "./types"

/**
 * Language extension loaders — lazy-loaded on demand.
 * Only the requested language is imported, keeping the initial bundle small.
 */
const languageLoaders: Record<EditorLanguage, () => Promise<Extension>> = {
  javascript: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  typescript: () =>
    import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  tsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ typescript: true, jsx: true }),
    ),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  python: () => import("@codemirror/lang-python").then((m) => m.python()),
  rust: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  xml: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  yaml: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  php: () => import("@codemirror/lang-php").then((m) => m.php()),
  ruby: () => Promise.resolve([]),
  shell: () => Promise.resolve([]),
  plain: () => Promise.resolve([]),
}

// Cache loaded language extensions
const loaded = new Map<EditorLanguage, Extension>()

/**
 * Load a language extension. Returns cached if already loaded.
 * Language grammars are lazy-imported — zero cost until used.
 *
 * @example
 * ```ts
 * const ext = await loadLanguage('typescript')
 * ```
 */
export async function loadLanguage(language: EditorLanguage): Promise<Extension> {
  const cached = loaded.get(language)
  if (cached) return cached

  const loader = languageLoaders[language]
  if (!loader) return []

  try {
    const ext = await loader()
    loaded.set(language, ext)
    return ext
  } catch {
    // Language package not installed — return empty extension
    return []
  }
}

/**
 * Get available languages.
 */
export function getAvailableLanguages(): EditorLanguage[] {
  return Object.keys(languageLoaders) as EditorLanguage[]
}

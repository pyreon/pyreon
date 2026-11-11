import { createHighlighter, type BundledLanguage, type Highlighter } from 'shiki'
import type { Plugin } from 'vite'
import { pyreonSyntaxDark, pyreonSyntaxLight } from '../src/styles/pyreon-syntax'

/**
 * Highlights the code in the story, compare, migrate and project content at
 * BUILD time (the sibling of `product-content.ts`), so no highlighter ships to
 * the browser.
 *
 * Every `src/site/content/pages/<family>/<id>.json` import is rewritten before
 * Vite's JSON plugin sees it: any object holding a `code` string gets a
 * sibling `codeHtml` with Shiki's output for both themes (CSS variables, as
 * `CodeCard` expects). The language comes from the object's `lang`, else the
 * extension of its `file`, else a shell guess for command lines, else `tsx`.
 * The original strings stay, for copy buttons and tests. The input is the
 * content set's own JSON, so the output is trusted markup.
 */
const PAGE_JSON = /\/src\/site\/content\/pages\/(?:why|compare|migrate|project)\/[a-z0-9-]+\.json$/

const LANGS = ['tsx', 'typescript', 'javascript', 'bash', 'json', 'vue', 'svelte', 'swift', 'kotlin'] as const
type Lang = (typeof LANGS)[number] | 'text'

const ALIASES: Readonly<Record<string, Lang>> = {
  tsx: 'tsx',
  jsx: 'tsx',
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  javascript: 'javascript',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  json: 'json',
  vue: 'vue',
  svelte: 'svelte',
  swift: 'swift',
  kt: 'kotlin',
  kotlin: 'kotlin',
  text: 'text',
  txt: 'text',
}

const SHELL = /^(?:\$ )?(?:npm|npx|pnpm|bun|bunx|yarn|git|cd|curl|brew)\b/

/** The Shiki language for one code object. Exported for tests. */
export function langOf(obj: { lang?: unknown; file?: unknown; code: string }): Lang {
  if (typeof obj.lang === 'string') return ALIASES[obj.lang.toLowerCase()] ?? 'text'
  if (typeof obj.file === 'string' && obj.file.includes('.')) {
    const ext = obj.file.slice(obj.file.lastIndexOf('.') + 1).toLowerCase()
    return ALIASES[ext] ?? 'text'
  }
  return SHELL.test(obj.code.trimStart()) ? 'bash' : 'tsx'
}

let highlighter: Promise<Highlighter> | null = null
function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: [pyreonSyntaxLight as never, pyreonSyntaxDark as never],
    langs: [...LANGS],
  })
  return highlighter
}

async function highlight(code: string, lang: Lang): Promise<string> {
  const hl = await getHighlighter()
  return hl.codeToHtml(code, {
    lang: lang === 'text' ? 'text' : (lang as BundledLanguage),
    themes: { light: pyreonSyntaxLight.name, dark: pyreonSyntaxDark.name },
    defaultColor: false,
  })
}

type Json = Record<string, unknown>

/** Adds `codeHtml` beside every `code` string, depth first. Exported for tests. */
export async function highlightPage(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) {
    for (const item of node) await highlightPage(item)
  } else if (node && typeof node === 'object') {
    const obj = node as Json
    if (typeof obj.code === 'string') obj.codeHtml = await highlight(obj.code, langOf(obj as { code: string }))
    for (const [key, value] of Object.entries(obj)) if (key !== 'codeHtml') await highlightPage(value)
  }
  return node
}

export default function sitePagesContent(): Plugin {
  return {
    name: 'pyreon-docs-site-pages-content',
    enforce: 'pre',
    async transform(code, id) {
      const path = id.split('?')[0] ?? id
      if (!PAGE_JSON.test(path)) return null
      let data: unknown
      try {
        data = JSON.parse(code)
      } catch (err) {
        throw new Error(`[Pyreon] site page content ${path} is not valid JSON: ${(err as Error).message}`)
      }
      return { code: JSON.stringify(await highlightPage(data)), map: null }
    },
  }
}

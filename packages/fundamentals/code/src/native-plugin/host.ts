/**
 * The web-host PAGE for `<CodeWebView>` on native: `buildCodeHostHtml` around a CodeMirror bundled from the app's own
 * install. The entry assigns the `window.CM` contract the host bridge waits for.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebHostContext, WebHostFile } from '@pyreon/native-compiler/plugin-api'
import { buildCodeHostHtml } from '../webview'
import { CODE_HOST_FILENAME } from './lowering'

/** One grammar: the `EditorLanguage` ids it answers to and the expression that builds its extension. */
interface Grammar {
  readonly pkg: string
  readonly named: string
  readonly cases: readonly (readonly [string, string])[]
}

const GRAMMARS: readonly Grammar[] = [
  {
    pkg: '@codemirror/lang-javascript',
    named: 'javascript',
    cases: [
      ['javascript', 'javascript()'],
      ['typescript', 'javascript({ typescript: true })'],
      ['jsx', 'javascript({ jsx: true })'],
      ['tsx', 'javascript({ typescript: true, jsx: true })'],
    ],
  },
  { pkg: '@codemirror/lang-json', named: 'json', cases: [['json', 'json()']] },
  { pkg: '@codemirror/lang-html', named: 'html', cases: [['html', 'html()']] },
  { pkg: '@codemirror/lang-css', named: 'css', cases: [['css', 'css()']] },
  { pkg: '@codemirror/lang-markdown', named: 'markdown', cases: [['markdown', 'markdown()']] },
  { pkg: '@codemirror/lang-python', named: 'python', cases: [['python', 'python()']] },
  { pkg: '@codemirror/lang-rust', named: 'rust', cases: [['rust', 'rust()']] },
  { pkg: '@codemirror/lang-sql', named: 'sql', cases: [['sql', 'sql()']] },
  { pkg: '@codemirror/lang-xml', named: 'xml', cases: [['xml', 'xml()']] },
  { pkg: '@codemirror/lang-yaml', named: 'yaml', cases: [['yaml', 'yaml()']] },
  { pkg: '@codemirror/lang-cpp', named: 'cpp', cases: [['cpp', 'cpp()']] },
  { pkg: '@codemirror/lang-java', named: 'java', cases: [['java', 'java()']] },
  { pkg: '@codemirror/lang-go', named: 'go', cases: [['go', 'go()']] },
  { pkg: '@codemirror/lang-php', named: 'php', cases: [['php', 'php()']] },
]

/** This package's directory: where its own dependencies (the CodeMirror core) resolve from under an isolated install. */
function packageDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  // Unreachable: a package always has a package.json above its own source. The bound on the walk only exists so a
  // broken layout cannot loop forever, and falling back to this file's directory keeps that case deterministic.
  /* v8 ignore next */
  return dirname(fileURLToPath(import.meta.url))
}

function installed(pkg: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => {
    try {
      createRequire(join(dir, 'noop.js')).resolve(pkg)
      return true
    } catch {
      return false
    }
  })
}

/**
 * The `window.CM` entry for the grammars the app has installed. Every grammar is an optional peer, so the entry names
 * only those that resolve — importing one that does not would fail the whole bundle for a language the app never uses.
 */
export function codeHostEntry(dirs: readonly string[]): string {
  const have = GRAMMARS.filter((g) => installed(g.pkg, dirs))
  const imports = have.map((g) => `import { ${g.named} } from '${g.pkg}'`)
  const cases = have.flatMap((g) => g.cases.map(([id, expr]) => `    case '${id}': return ${expr}`))
  return `import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
${imports.join('\n')}
function languageFor(name) {
  switch (name) {
${cases.join('\n')}
    default: return []
  }
}
window.CM = { EditorView, EditorState, Compartment, basicSetup, languageFor }
`
}

/** `PluginWebHosts` for `@pyreon/code`: the one page every `<CodeWebView>` in the app loads. */
export async function buildCodeHosts({ appDir, bundleScript }: WebHostContext): Promise<WebHostFile[]> {
  const dirs = [packageDir(), appDir]
  const codemirrorScript = await bundleScript({ source: codeHostEntry(dirs), resolveDirs: dirs })
  return [{ filename: CODE_HOST_FILENAME, content: buildCodeHostHtml({ codemirrorScript }) }]
}

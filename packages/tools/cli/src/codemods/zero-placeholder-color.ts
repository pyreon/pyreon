import { loadTs } from './load-ts'
import type { Codemod } from './types'

/**
 * `@pyreon/zero` 0.54 removed the `'dominant-color'` image placeholder
 * strategy, which was an alias of `'color'` (the plugin mapped one to the
 * other). Rewriting the literal to `'color'` is therefore
 * semantics-preserving.
 *
 * Only a string literal `'dominant-color'` that is the value of a property
 * named `placeholder` is touched; the quote style is kept.
 */
export const zeroPlaceholderColor: Codemod = {
  id: 'zero-placeholder-color',
  package: '@pyreon/zero',
  introducedIn: '0.54.0',
  description: "Rewrite the removed image `placeholder: 'dominant-color'` to its identical `'color'`.",
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform(source, relPath) {
    if (!source.includes('dominant-color') || !/\bplaceholder\b/.test(source)) return null
    const ts = loadTs('zero-placeholder-color')
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)
    const edits: { start: number; end: number; text: string }[] = []
    const visit = (node: import('typescript').Node): void => {
      if (ts.isPropertyAssignment(node)) {
        const name = node.name
        const init = node.initializer
        const isPlaceholder = (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'placeholder'
        if (isPlaceholder && ts.isStringLiteral(init) && init.text === 'dominant-color') {
          const start = init.getStart(sf)
          const quote = source[start] as string
          edits.push({ start, end: init.getEnd(), text: `${quote}color${quote}` })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (edits.length === 0) return null
    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

    return out
  },
}

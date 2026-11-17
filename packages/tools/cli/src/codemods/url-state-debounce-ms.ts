import { createRequire } from 'node:module'
import type { Codemod } from './types'

type TS = typeof import('typescript')
type Node = import('typescript').Node

/** TypeScript, loaded only when the codemod actually has a candidate file. */
function loadTs(): TS {
  try {
    return createRequire(import.meta.url)('typescript') as TS
  } catch {
    throw new Error(
      '[Pyreon] codemod url-state-debounce-ms needs the `typescript` package. Install it (it is a peer dependency of @pyreon/cli) and re-run `pyreon upgrade`.',
    )
  }
}

/**
 * `@pyreon/url-state` 0.54 renamed the `debounce` option of `useUrlState` to
 * `debounceMs` (same value, in milliseconds). The old key is ignored at
 * runtime, so renaming it restores the behaviour the code was written for.
 *
 * Only the OPTIONS object literal of a call to `useUrlState` imported from
 * `@pyreon/url-state` (aliases included) is touched: the third argument in
 * single-param mode (`useUrlState('q', '', { … })`), the second in schema mode
 * (`useUrlState({ … }, { … })`). A two-argument call whose first argument is
 * not a literal is ambiguous (its second argument may be a default value), so
 * it is left alone, as is an options object that already sets `debounceMs`.
 */
export const urlStateDebounceMs: Codemod = {
  id: 'url-state-debounce-ms',
  package: '@pyreon/url-state',
  introducedIn: '0.54.0',
  description: 'Rename the removed `useUrlState` option `debounce` to `debounceMs` (same value).',
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform(source, relPath) {
    if (!source.includes('@pyreon/url-state') || !/\bdebounce\b/.test(source)) return null
    const ts = loadTs()
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)

    // Local names bound to `useUrlState` from '@pyreon/url-state'.
    const locals = new Set<string>()
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
      if (st.moduleSpecifier.text !== '@pyreon/url-state') continue
      const named = st.importClause?.namedBindings
      if (named === undefined || !ts.isNamedImports(named)) continue
      for (const el of named.elements) {
        if ((el.propertyName ?? el.name).text === 'useUrlState') locals.add(el.name.text)
      }
    }
    if (locals.size === 0) return null

    const optionsArg = (args: readonly import('typescript').Expression[]): Node | undefined => {
      const first = args[0]
      if (first === undefined) return undefined
      if (ts.isObjectLiteralExpression(first)) return args[1]
      if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first) || args.length >= 3) return args[2]
      return undefined
    }

    const keyName = (n: import('typescript').PropertyName): string | undefined =>
      ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : undefined

    const edits: { start: number; end: number; text: string }[] = []
    const visit = (node: Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && locals.has(node.expression.text)) {
        const opts = optionsArg(node.arguments)
        if (opts !== undefined && ts.isObjectLiteralExpression(opts)) {
          const props = opts.properties
          const hasNew = props.some((p) => p.name !== undefined && keyName(p.name as import('typescript').PropertyName) === 'debounceMs')
          if (!hasNew) {
            for (const p of props) {
              if (ts.isPropertyAssignment(p) && keyName(p.name) === 'debounce') {
                const start = p.name.getStart(sf)
                const text = ts.isStringLiteral(p.name) ? `${source[start]}debounceMs${source[start]}` : 'debounceMs'
                edits.push({ start, end: p.name.getEnd(), text })
              } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'debounce') {
                edits.push({ start: p.name.getStart(sf), end: p.name.getEnd(), text: 'debounceMs: debounce' })
              }
            }
          }
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

import { createRequire } from 'node:module'
import type { Codemod } from './types'

type TS = typeof import('typescript')
type Node = import('typescript').Node
type Expression = import('typescript').Expression
type SourceFile = import('typescript').SourceFile
type Edit = { start: number; end: number; text: string }

/** TypeScript, loaded only when the codemod actually has a candidate file. */
function loadTs(): TS {
  try {
    return createRequire(import.meta.url)('typescript') as TS
  } catch {
    throw new Error(
      '[Pyreon] codemod router-server-loader-functions needs the `typescript` package. Install it (it is a peer dependency of @pyreon/cli) and re-run `pyreon upgrade`.',
    )
  }
}

const SOURCES = ['@pyreon/router', '@pyreon/zero', '@pyreon/server', '@pyreon/testing']

/**
 * `@pyreon/router` 0.54 moved its server-only loader passes off the router
 * object, so client bundles stop carrying them:
 *
 * - `router.preload(path, request?)` (components AND loaders) →
 *   `preloadRoute(router, path, request?)`
 * - `router.preload(path, request?, { skipLoaders: true })` (components only) →
 *   `router.preloadComponents(path)`
 * - `router.runServerLoaders(path, request?)` → `runServerLoaders(router, path, request?)`
 *
 * `.preload` is a common method name (a `lazy()` component's `.preload()`
 * too), so only a call whose RECEIVER is a router by name — an identifier or
 * property ending in `router` (`router`, `app.router`, `this.router`) — in a
 * file that imports from a Pyreon package is rewritten. A third argument that
 * is not the literal `{ skipLoaders: true }` / `{ skipLoaders: false }` is
 * ambiguous and left alone; TypeScript reports every call left on the removed
 * method.
 */
function isRouterReceiver(ts: TS, e: Expression): boolean {
  if (ts.isIdentifier(e)) return /router$/i.test(e.text)
  if (ts.isPropertyAccessExpression(e)) return /router$/i.test(e.name.text)

  return false
}

/** `{ skipLoaders: true }` → true, `{ skipLoaders: false }` / `{}` → false, anything else → null. */
function skipLoadersLiteral(ts: TS, e: Expression): boolean | null {
  if (!ts.isObjectLiteralExpression(e)) return null
  if (e.properties.length === 0) return false
  const p = e.properties.length === 1 ? e.properties[0]! : undefined
  if (p === undefined || !ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || p.name.text !== 'skipLoaders') {
    return null
  }
  if (p.initializer.kind === ts.SyntaxKind.TrueKeyword) return true
  if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) return false

  return null
}

/** The replacement for one router-method call, or null to leave it. `needed` collects imports. */
function rewriteCall(ts: TS, sf: SourceFile, node: Node, needed: Set<string>): string | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null
  if (node.expression.questionDotToken || !isRouterReceiver(ts, node.expression.expression)) return null
  const text = (n: Node): string => sf.text.slice(n.getStart(sf), n.getEnd())
  const method = node.expression.name.text
  const recv = text(node.expression.expression)
  const args = node.arguments
  if (method === 'runServerLoaders' && args.length >= 1 && args.length <= 2) {
    needed.add('runServerLoaders')

    return `runServerLoaders(${[recv, ...args.map(text)].join(', ')})`
  }
  if (method !== 'preload' || args.length < 1 || args.length > 3) return null
  const skip = args.length === 3 ? skipLoadersLiteral(ts, args[2]!) : false
  if (skip === true) return `${recv}.preloadComponents(${text(args[0]!)})`
  if (skip === null) return null
  // Drop a trailing `undefined` request: `preloadRoute(r, p)` reads the same.
  const req = args[1]
  const parts = req === undefined || (ts.isIdentifier(req) && req.text === 'undefined') ? [args[0]!] : [args[0]!, req]
  needed.add('preloadRoute')

  return `preloadRoute(${[recv, ...parts.map(text)].join(', ')})`
}

/** Import `needed` from @pyreon/router: extend an existing value import, else add one after the last import. */
function addRouterImports(ts: TS, out: string, relPath: string, kind: number, needed: Set<string>): string {
  const sf = ts.createSourceFile(relPath, out, ts.ScriptTarget.ESNext, true, kind)
  const imported = new Set<string>()
  let target: import('typescript').NamedImports | undefined
  let lastImportEnd = 0
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue
    lastImportEnd = st.getEnd()
    const named = st.importClause?.namedBindings
    const fromRouter = ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text === '@pyreon/router'
    if (!fromRouter || named === undefined || !ts.isNamedImports(named)) continue
    for (const el of named.elements) if (!el.isTypeOnly) imported.add((el.propertyName ?? el.name).text)
    if (!st.importClause?.isTypeOnly && target === undefined) target = named
  }
  const missing = [...needed].filter((n) => !imported.has(n)).sort()
  if (missing.length === 0) return out
  if (target !== undefined) {
    const last = target.elements[target.elements.length - 1]
    const at = last !== undefined ? last.getEnd() : target.getStart(sf) + 1
    const insert = last !== undefined ? `, ${missing.join(', ')}` : ` ${missing.join(', ')} `

    return out.slice(0, at) + insert + out.slice(at)
  }
  const line = `import { ${missing.join(', ')} } from '@pyreon/router'`
  if (lastImportEnd === 0) return `${line}\n${out}`

  return `${out.slice(0, lastImportEnd)}\n${line}${out.slice(lastImportEnd)}`
}

export const routerServerLoaderFunctions: Codemod = {
  id: 'router-server-loader-functions',
  package: '@pyreon/router',
  introducedIn: '0.54.0',
  description:
    'Rewrite `router.preload(path, req)` to `preloadRoute(router, path, req)`, `router.preload(path, _, { skipLoaders: true })` to `router.preloadComponents(path)`, and `router.runServerLoaders(path, req)` to `runServerLoaders(router, path, req)`.',
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform(source, relPath) {
    if (!/\.(preload|runServerLoaders)\s*\(/.test(source)) return null
    if (!SOURCES.some((s) => source.includes(s))) return null
    const ts = loadTs()
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)
    const edits: Edit[] = []
    const needed = new Set<string>()
    const visit = (node: Node): void => {
      const next = rewriteCall(ts, sf, node, needed)
      // A rewritten call's arguments are copied verbatim, so its subtree is not
      // visited (an overlapping inner edit would corrupt the output).
      if (next !== null) edits.push({ start: node.getStart(sf), end: node.getEnd(), text: next })
      else ts.forEachChild(node, visit)
    }
    visit(sf)
    if (edits.length === 0) return null
    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

    return needed.size === 0 ? out : addRouterImports(ts, out, relPath, kind, needed)
  },
}

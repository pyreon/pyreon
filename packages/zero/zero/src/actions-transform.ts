/**
 * Build-time transform for server actions (`defineAction` from
 * `@pyreon/zero/actions`).
 *
 * Every action needs an id that the CLIENT bundle and the SERVER bundle
 * agree on — the client POSTs to `/_zero/actions/<id>` and the server looks
 * the handler up by that id. A per-evaluation `crypto.randomUUID()` gives
 * each bundle a different id, so every client call 404s. This transform
 * derives the id from the defining module's root-relative path plus the
 * binding the action is assigned to, which is the same string in both
 * builds, in dev, and across HMR re-runs.
 *
 * It also rewrites the two bundles differently:
 *   • server — `defineAction(h)` → `_defineActionWithId("<id>", h)`
 *   • client — `defineAction(h)` → `_actionStub("<id>")`: the handler body
 *     is removed, and imports that ONLY the removed handlers referenced are
 *     dropped too, so server-only code (a database client, secrets read
 *     from `process.env`) does not ship to the browser.
 *
 * Edits never add or remove line breaks, so line numbers stay aligned with
 * the original source for stack traces and the unchanged source map chain.
 *
 * @internal
 */
import { createHash } from 'node:crypto'
import { parseSync } from 'oxc-parser'

const ACTIONS_MODULE = '@pyreon/zero/actions'
const SERVER_FN = '__zeroDefineActionWithId'
const CLIENT_FN = '__zeroActionStub'

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

interface Edit {
  start: number
  end: number
  text: string
}

/** Derive a stable action id from a module path and a binding key. */
export function actionId(relPath: string, key: string): string {
  const hash = createHash('sha256').update(`${relPath}#${key}`).digest('hex').slice(0, 24)
  return `action_${hash}`
}

function langOf(file: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (/\.[mc]?tsx$/.test(file)) return 'tsx'
  if (/\.[mc]?ts$/.test(file)) return 'ts'
  if (/\.[mc]?jsx$/.test(file)) return 'jsx'
  return 'js'
}

/** Keep every line break of `text`, blank everything else. */
function newlinesOf(text: string): string {
  return text.replace(/[^\n]/g, '')
}

/** Visit every AST node with its parent. */
function walk(node: unknown, parent: AstNode | null, visit: (n: AstNode, p: AstNode | null) => boolean | void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, parent, visit)
    return
  }
  if (!node || typeof node !== 'object' || typeof (node as AstNode).type !== 'string') return
  const n = node as AstNode
  if (visit(n, parent) === false) return
  for (const key in n) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range' || key === 'loc') continue
    const v = n[key]
    if (v && typeof v === 'object') walk(v, n, visit)
  }
}

interface ActionCall {
  node: AstNode
  id: string
}

/**
 * Parse `code` and locate every `defineAction` call with its build-time id.
 * `null` when the module imports no `defineAction` (or does not parse).
 * The single derivation shared by the transform and the action manifest,
 * so a manifest id always equals the id the transform bakes in.
 */
function locateActions(
  code: string,
  filename: string,
  relPath: string,
): { program: AstNode; calls: ActionCall[] } | null {
  if (!code.includes(ACTIONS_MODULE)) return null

  let program: AstNode
  try {
    program = parseSync(filename, code, { sourceType: 'module', lang: langOf(filename) })
      .program as unknown as AstNode
  } catch {
    return null // Vite's own transform will report the syntax error.
  }

  // Local names bound to `defineAction` (named, aliased, or via namespace).
  const direct = new Set<string>()
  const namespaces = new Set<string>()
  for (const stmt of program.body as AstNode[]) {
    if (stmt.type !== 'ImportDeclaration') continue
    if ((stmt.source as AstNode).value !== ACTIONS_MODULE || stmt.importKind === 'type') continue
    for (const spec of stmt.specifiers as AstNode[]) {
      if (spec.type === 'ImportNamespaceSpecifier') {
        namespaces.add((spec.local as AstNode).name as string)
      } else if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') {
        const imported = spec.imported as AstNode
        const importedName = (imported.name ?? imported.value) as string
        if (importedName === 'defineAction') direct.add((spec.local as AstNode).name as string)
      }
    }
  }
  if (direct.size === 0 && namespaces.size === 0) return null

  const isDefineAction = (callee: AstNode): boolean => {
    if (callee.type === 'Identifier') return direct.has(callee.name as string)
    if (callee.type === 'MemberExpression' && !callee.computed) {
      const obj = callee.object as AstNode
      const prop = callee.property as AstNode
      return obj.type === 'Identifier' && namespaces.has(obj.name as string) && prop.name === 'defineAction'
    }
    return false
  }

  const calls: ActionCall[] = []
  const usedKeys = new Set<string>()
  let ordinal = 0
  walk(program, null, (node, parent) => {
    if (node.type !== 'CallExpression' || !isDefineAction(node.callee as AstNode)) return
    const args = node.arguments as AstNode[]
    if (args.length === 0) return false

    // The key: the binding the action is assigned to, `default` for a
    // default export, otherwise its position among this module's calls.
    let key = `$${ordinal}`
    if (parent?.type === 'VariableDeclarator' && (parent.id as AstNode).type === 'Identifier') {
      key = (parent.id as AstNode).name as string
    } else if (parent?.type === 'ExportDefaultDeclaration') {
      key = 'default'
    }
    if (usedKeys.has(key)) key = `${key}$${ordinal}`
    usedKeys.add(key)
    ordinal++
    calls.push({ node, id: actionId(relPath, key) })
    // Do not descend: a `defineAction` nested in a handler is part of the
    // stripped body (client) or is keyed independently only if reachable.
    return false
  })
  return { program, calls }
}

/**
 * The ids of every server action `code` defines — what the server's action
 * manifest maps to this module so a fresh server can load it on demand.
 */
export function collectActionIds(code: string, filename: string, relPath: string): string[] {
  return locateActions(code, filename, relPath)?.calls.map((c) => c.id) ?? []
}

/**
 * Rewrite `defineAction` call sites in `code`. Returns `null` when the
 * module has none (the common case; checked with a substring test before
 * any parse).
 *
 * @param relPath the module's path relative to the Vite root, POSIX
 *   separators — the id's only input besides the binding name.
 * @param ssr `true` for the server bundle, `false` for the browser bundle.
 */
export function transformServerActions(
  code: string,
  filename: string,
  relPath: string,
  ssr: boolean,
): string | null {
  const located = locateActions(code, filename, relPath)
  if (!located) return null
  const { program, calls } = located

  const edits: Edit[] = []
  const removed: Array<[number, number]> = []

  for (const { node, id: rawId } of calls) {
    const id = JSON.stringify(rawId)
    const callee = node.callee as AstNode
    const typeArgs = node.typeArguments as AstNode | null | undefined
    const headEnd = typeArgs ? typeArgs.end : callee.end
    const typeArgsText = typeArgs ? code.slice(typeArgs.start, typeArgs.end) : ''

    if (ssr) {
      const paren = code.indexOf('(', headEnd)
      edits.push({ start: callee.start, end: headEnd, text: `${SERVER_FN}${typeArgsText}` })
      edits.push({ start: paren + 1, end: paren + 1, text: `${id}, ` })
    } else {
      const original = code.slice(node.start, node.end)
      edits.push({
        start: node.start,
        end: node.end,
        text: `${CLIENT_FN}${typeArgsText}(${id})${newlinesOf(original)}`,
      })
      removed.push([node.start, node.end])
    }
  }

  if (edits.length === 0) return null

  if (!ssr) {
    // Drop import declarations whose every binding was referenced only
    // inside a removed handler. Conservative: any occurrence of the name
    // outside the removed ranges (as a reference, a property key, a type)
    // keeps the import, and a bare side-effect import is never touched.
    const inRemoved = (n: AstNode): boolean => removed.some(([s, e]) => n.start >= s && n.end <= e)
    const referenced = new Set<string>()
    walk(program, null, (node) => {
      if (node.type === 'ImportDeclaration') return false
      if (inRemoved(node)) return false
      if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
        referenced.add(node.name as string)
      }
    })
    for (const stmt of program.body as AstNode[]) {
      if (stmt.type !== 'ImportDeclaration') continue
      const specs = stmt.specifiers as AstNode[]
      if (specs.length === 0) continue
      const allUnused = specs.every((s) => !referenced.has((s.local as AstNode).name as string))
      if (!allUnused) continue
      edits.push({ start: stmt.start, end: stmt.end, text: newlinesOf(code.slice(stmt.start, stmt.end)) })
    }
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let out = code
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)

  // Prepended on the FIRST line (no trailing newline) so every later line
  // keeps its number.
  const imported = ssr
    ? `_defineActionWithId as ${SERVER_FN}`
    : `_actionStub as ${CLIENT_FN}`
  return `import { ${imported} } from ${JSON.stringify(ACTIONS_MODULE)};${out}`
}

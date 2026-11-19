/**
 * Module state IMPORTED from another file — named, because it has no native lowering.
 *
 * A module-scope `signal()` / `computed()` lowers to ONE singleton per file (`module-state.ts`). PMTC compiles one
 * `.tsx` file at a time, so a file that imports that state from another module (`import { plan } from './cart'`) has
 * no singleton to read it through: the emit referenced a bare `plan` that exists in neither language, and the native
 * build failed with zero warnings (#4313). A `.ts` module is not compiled at all, so there is not even a declaring
 * singleton. (A store imported from another file is a hook-named function, and the imported-hook path in
 * `inline-hooks.ts` already names it; recognising a store here would put library knowledge in the compiler.)
 *
 * Every import shape is resolved to the declaration it binds: a named or aliased import, a default import, a
 * namespace import read as `ns.name`, and through the exporting module's own aliases, named re-exports, `export *`
 * and an import it re-exports — so a barrel `index.ts` names the state the same way.
 */
import { isAbsolute, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import { isRelative, resolveModule } from './module-resolve'

// oxc's ESTree output, read structurally.
// oxlint-disable-next-line typescript/no-explicit-any
type Node = any

/** The reactive state an import resolves to. */
type StateKind = 'signal' | 'computed'

interface FoundState {
  readonly kind: StateKind
  /** The module specifier as the importing file wrote it. */
  readonly spec: string
}

const STATE_CALLS: ReadonlySet<string> = new Set(['signal', 'computed'])
const MAX_DEPTH = 8

/**
 * Warnings for every value import in `program` that resolves to module state declared in another file, keyed by the
 * LOCAL name the importing file uses. Only a file compiled from a readable path can be checked: an in-memory transform
 * has no directory to resolve a relative import from.
 */
export function importedModuleState(
  program: Node,
  filename: string,
  readModule: (p: string) => string | undefined,
): Map<string, string> {
  const out = new Map<string, string>()
  const callerPath = isAbsolute(filename) ? filename : resolve(filename)
  let readable: boolean | undefined
  for (const imp of program.body as Node[]) {
    if (imp.type !== 'ImportDeclaration' || imp.importKind === 'type' || !isRelative(imp.source.value)) continue
    readable ??= readModule(callerPath) !== undefined
    if (!readable) return out
    const spec = imp.source.value as string
    const mod = resolveModule(callerPath, spec, readModule)
    if (!mod) continue
    for (const sp of imp.specifiers as Node[]) {
      if (sp.type === 'ImportSpecifier' && sp.importKind === 'type') continue
      const local = sp.local.name as string
      if (sp.type === 'ImportNamespaceSpecifier') {
        for (const member of namespaceMembers(program, local)) {
          const found = exportedState(mod.path, mod.source, member, readModule, new Set())
          if (found) out.set(`${local}.${member}`, message(`${local}.${member}`, member, { kind: found, spec }))
        }
        continue
      }
      const exportName = sp.type === 'ImportDefaultSpecifier' ? 'default' : ((sp.imported.name ?? sp.imported.value) as string)
      const found = exportedState(mod.path, mod.source, exportName, readModule, new Set())
      if (found) out.set(local, message(local, exportName, { kind: found, spec }))
    }
  }

  return out
}

function message(local: string, exportName: string, found: FoundState): string {
  const named = exportName === 'default' ? `the default export of '${found.spec}'` : exportName === local || local.endsWith(`.${exportName}`) ? `'${found.spec}'` : `'${found.spec}' (as \`${exportName}\`)`
  return (
    `\`${local}\` is a module-scope ${found.kind}() imported from ${named}, and native has no lowering for state shared across files: module state is ` +
    `one singleton per compiled file, so every read and write of \`${local}\` here references a name that does not exist and ` +
    `the native build fails. Declare the state in this .tsx file (only this file's components then share it), or own it in one ` +
    `component and pass the value and a setter down as props.`
  )
}

/** Every `ns.member` read in the file, for a namespace import `ns`. */
function namespaceMembers(program: Node, ns: string): Set<string> {
  const out = new Set<string>()
  const visit = (n: Node): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (
      (n.type === 'MemberExpression' || n.type === 'JSXMemberExpression') &&
      !n.computed &&
      (n.object?.type === 'Identifier' || n.object?.type === 'JSXIdentifier') &&
      n.object.name === ns
    ) {
      out.add(n.property.name as string)
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(program.body)

  return out
}

/** One parsed module, and how to follow a specifier out of it. */
interface ModuleView {
  readonly body: Node[]
  readonly stateCalls: Map<string, StateKind>
  readonly follow: (spec: string, exportName: string) => StateKind | undefined
}

/**
 * The kind of state the module at `path` exports as `exportName` (`default` for its default export), following its own
 * declaration, an aliased export, a named re-export, an import it re-exports and `export *`. `undefined` when the
 * export is anything else, or cannot be found — which is not this check's to report.
 */
function exportedState(
  path: string,
  source: string,
  exportName: string,
  readModule: (p: string) => string | undefined,
  seen: Set<string>,
): StateKind | undefined {
  const key = `${path}#${exportName}`
  if (seen.has(key) || seen.size > MAX_DEPTH) return undefined
  seen.add(key)
  const parsed = parseSync(path, source, { sourceType: 'module', lang: 'tsx' })
  if (parsed.errors.length > 0) return undefined
  const body = (parsed.program as Node).body as Node[]
  const view: ModuleView = {
    body,
    stateCalls: stateCallNames(body),
    follow: (spec, name) => {
      if (!isRelative(spec)) return undefined
      const next = resolveModule(path, spec, readModule)
      return next ? exportedState(next.path, next.source, name, readModule, seen) : undefined
    },
  }
  const own = ownExport(view, exportName)
  if (own !== null) return own
  // `export * from './x'` never re-exports a default.
  if (exportName === 'default') return undefined
  for (const stmt of body) {
    if (stmt.type !== 'ExportAllDeclaration' || stmt.exported) continue
    const found = view.follow(stmt.source.value, exportName)
    if (found) return found
  }

  return undefined
}

/** The state a module's own `export` statement for `exportName` binds; `null` when no such statement exists. */
function ownExport(view: ModuleView, exportName: string): StateKind | undefined | null {
  for (const stmt of view.body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      if (exportName !== 'default') continue
      const d = stmt.declaration
      return d?.type === 'Identifier' ? localState(view, d.name) : stateOf(d, view.stateCalls)
    }
    if (stmt.type !== 'ExportNamedDeclaration') continue
    const d = stmt.declaration
    if (d?.type === 'VariableDeclaration' && (d.declarations as Node[]).some((x) => x.id?.type === 'Identifier' && x.id.name === exportName)) {
      return localState(view, exportName)
    }
    const sp = ((stmt.specifiers as Node[] | undefined) ?? []).find((x) => (x.exported.name ?? x.exported.value) === exportName)
    if (!sp) continue
    const name = (sp.local.name ?? sp.local.value) as string

    return stmt.source ? view.follow(stmt.source.value, name) : localState(view, name)
  }

  return null
}

/** What a top-level name of the module is bound to: its own declaration, or an import followed to its source. */
function localState(view: ModuleView, name: string): StateKind | undefined {
  for (const stmt of view.body) {
    if (stmt.type === 'ImportDeclaration') {
      const sp = (stmt.specifiers as Node[]).find((x) => x.local.name === name && x.type !== 'ImportNamespaceSpecifier')
      if (!sp) continue
      return view.follow(stmt.source.value, sp.type === 'ImportDefaultSpecifier' ? 'default' : ((sp.imported.name ?? sp.imported.value) as string))
    }
    const decl = stmt.type === 'ExportNamedDeclaration' && stmt.declaration ? stmt.declaration : stmt
    if (decl.type !== 'VariableDeclaration') continue
    const d = (decl.declarations as Node[]).find((x) => x.id?.type === 'Identifier' && x.id.name === name)
    if (d) return stateOf(d.init, view.stateCalls)
  }

  return undefined
}

/**
 * The names this module calls `signal` / `computed` by: the bare names (how `parse.ts` recognises same-file module
 * state), and any alias an import from a `@pyreon/` package gives them.
 */
function stateCallNames(body: Node[]): Map<string, StateKind> {
  const out = new Map<string, StateKind>([...STATE_CALLS].map((n) => [n, n as StateKind]))
  for (const stmt of body) {
    if (stmt.type !== 'ImportDeclaration' || !String(stmt.source.value).startsWith('@pyreon/')) continue
    for (const sp of stmt.specifiers as Node[]) {
      if (sp.type !== 'ImportSpecifier') continue
      const imported = (sp.imported.name ?? sp.imported.value) as string
      if (STATE_CALLS.has(imported)) out.set(sp.local.name, imported as StateKind)
    }
  }

  return out
}

function stateOf(init: Node, calls: Map<string, StateKind>): StateKind | undefined {
  let e = init
  while (e && (e.type === 'TSAsExpression' || e.type === 'TSSatisfiesExpression' || e.type === 'TSNonNullExpression' || e.type === 'ParenthesizedExpression')) e = e.expression
  return e?.type === 'CallExpression' && e.callee?.type === 'Identifier' ? calls.get(e.callee.name) : undefined
}

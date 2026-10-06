/**
 * Hook BINDING resolution — decide which identifier a hook call really is,
 * before any recognizer reads its name.
 *
 * Every lowering recognizer in `parse.ts` matches a call by its bare callee
 * name (`calleeName === 'useOnline'`), about sixty sites. Name-only matching is
 * wrong in three ways that this pass removes at the one place all of them read
 * from — the AST itself:
 *
 *   1. SHADOWING. A user's own `function useOnline() {…}` was lowered as the
 *      framework hook, so its call emitted a `PyreonNetworkStatus` container
 *      the author never asked for.
 *   2. FOREIGN IMPORTS. `import { useOnline } from './my-hooks'` was treated as
 *      `@pyreon/hooks`' hook. PMTC has no module graph, so it cannot see what
 *      the file exports; the honest outcome is "not the framework hook".
 *   3. ALIASES. `import { useOnline as useNet } from '@pyreon/hooks'` matched
 *      nothing, so the declaration was silently dropped and the component read
 *      an undefined name on device — with no warning.
 *
 * The fix is an alpha-rename over the parsed AST, so no recognizer changes:
 *   - an aliased framework hook has its CALL sites renamed to the canonical
 *     export name;
 *   - a name that is NOT the framework hook (declared locally, or imported from
 *     somewhere else) is renamed to `<name>_` everywhere, so name-keyed
 *     recognizers no longer see it and it compiles as the user's own function.
 *
 * A name that is neither imported nor declared stays claimable. Snippets and
 * fixtures routinely omit imports, and PMTC has always lowered them; keeping
 * that is a deliberate back-compat choice, not an oversight.
 */

type AnyNode = Record<string, unknown> & { type?: string }

interface ImportInfo {
  source: string
  imported: string
  specifier: AnyNode
}

function nameOf(node: unknown): string | undefined {
  const n = node as AnyNode | undefined
  if (!n) return undefined
  if (typeof n.name === 'string') return n.name
  if (typeof n.value === 'string') return n.value
  return undefined
}

function topLevelNodes(program: AnyNode): AnyNode[] {
  const out: AnyNode[] = []
  for (const top of (program.body as AnyNode[]) ?? []) {
    const inner = (top.type === 'ExportNamedDeclaration' || top.type === 'ExportDefaultDeclaration') && top.declaration
      ? (top.declaration as AnyNode)
      : top
    out.push(inner)
  }
  return out
}

function collectImports(program: AnyNode): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>()
  for (const node of (program.body as AnyNode[]) ?? []) {
    if (node.type !== 'ImportDeclaration') continue
    const source = (node.source as AnyNode | undefined)?.value
    if (typeof source !== 'string') continue
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const local = nameOf(spec.local)
      const imported = nameOf(spec.imported)
      if (local && imported) imports.set(local, { source, imported, specifier: spec })
    }
  }
  return imports
}

/**
 * Names the AUTHOR wrote as a function: a function declaration, or a variable
 * holding an arrow/function expression. A variable initialised by a CALL
 * (`const useCounter = defineStore(…)`) is deliberately NOT here — that is a
 * hook the parser itself recognises by its user-declared name (the store
 * mechanism), so renaming it would break the very lowering it relies on.
 */
function collectDeclared(program: AnyNode): Set<string> {
  const declared = new Set<string>()
  for (const node of topLevelNodes(program)) {
    if (node.type === 'FunctionDeclaration' && nameOf(node.id)) {
      declared.add(nameOf(node.id) as string)
    } else if (node.type === 'VariableDeclaration') {
      for (const d of (node.declarations as AnyNode[]) ?? []) {
        const id = d.id as AnyNode | undefined
        const init = d.init as AnyNode | undefined
        const isFunction = init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression'
        if (id?.type === 'Identifier' && typeof id.name === 'string' && isFunction) declared.add(id.name)
      }
    }
  }
  return declared
}

/** True when an Identifier node at (`parent`, `key`) is a NAME rather than a reference/binding of a variable. */
function isPropertyName(parent: AnyNode | undefined, key: string): boolean {
  if (!parent) return false
  if (parent.type === 'MemberExpression' && key === 'property') return parent.computed !== true
  if ((parent.type === 'Property' || parent.type === 'ObjectProperty' || parent.type === 'PropertyDefinition' || parent.type === 'MethodDefinition' || parent.type === 'TSPropertySignature') && key === 'key') {
    return parent.computed !== true && parent.shorthand !== true
  }
  if (parent.type === 'ImportSpecifier' && key === 'imported') return true
  if (parent.type === 'ExportSpecifier' && key === 'exported') return true
  return false
}

function walk(node: unknown, parent: AnyNode | undefined, key: string, visit: (n: AnyNode, parent: AnyNode | undefined, key: string) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, parent, key, visit)
    return
  }
  if (!node || typeof node !== 'object') return
  const n = node as AnyNode
  if (typeof n.type === 'string') visit(n, parent, key)
  for (const k of Object.keys(n)) {
    if (k === 'type' || k === 'start' || k === 'end') continue
    const child = n[k]
    if (child && typeof child === 'object') walk(child, typeof n.type === 'string' ? n : parent, k, visit)
  }
}

/**
 * Does `source` legitimately provide `hook`? A package-owned plugin declares
 * the specifiers it serves (`modules`), so its hooks are claimed from there as
 * well as from `@pyreon/*`. Absent, only `@pyreon/*` counts — unchanged.
 */
export type HookSourceClaim = (hook: string, source: string) => boolean

const isFrameworkSource = (source: string, hook: string, claims?: HookSourceClaim): boolean =>
  source.startsWith('@pyreon/') || claims?.(hook, source) === true

/** The suffix a non-framework `useX` is renamed with so name-keyed recognizers stop seeing it. */
export const NOT_FRAMEWORK_SUFFIX = '_'

/**
 * Canonicalize hook bindings in `program` IN PLACE. Returns warnings for the
 * cases the author should hear about (a foreign import of a framework hook
 * name); a locally declared function of the same name needs none, since it is
 * simply the author's own function.
 */
export function canonicalizeHookBindings(
  program: AnyNode,
  hooks: ReadonlySet<string>,
  claims?: HookSourceClaim,
): string[] {
  const imports = collectImports(program)
  const declared = collectDeclared(program)
  const warnings: string[] = []
  const rename = new Set<string>()
  const alias = new Map<string, string>()

  // A local name that is a framework hook NAME but is not bound to that hook.
  for (const name of hooks) {
    const imp = imports.get(name)
    if (imp) {
      const isFramework = isFrameworkSource(imp.source, name, claims) && imp.imported === name
      if (!isFramework) {
        rename.add(name)
        warnings.push(
          imp.source.startsWith('@pyreon/')
            ? `\`${name}\` is imported here as \`${imp.imported}\` from \`${imp.source}\`, not as the \`${name}\` hook, so it is NOT lowered as the framework hook of that name.`
            : `\`${name}\` is imported from \`${imp.source}\`, so it is NOT lowered as the framework hook of that name — PMTC has no module graph and cannot see what that file exports. Import it from its \`@pyreon/*\` package to use the native lowering.`,
        )
      }
    } else if (declared.has(name)) {
      rename.add(name)
    }
  }

  // An aliased framework hook: calls under the alias are the canonical hook.
  for (const [local, imp] of imports) {
    if (local === imp.imported) continue
    if (!isFrameworkSource(imp.source, imp.imported, claims) || !hooks.has(imp.imported)) continue
    // The canonical name is taken by something else in this file: leave it, the alias stays unresolved.
    if (declared.has(imp.imported) || imports.has(imp.imported)) continue
    alias.set(local, imp.imported)
  }

  if (rename.size === 0 && alias.size === 0) return warnings

  walk(program, undefined, '', (n, parent, key) => {
    if (n.type !== 'Identifier' || typeof n.name !== 'string') return
    if (isPropertyName(parent, key)) return
    if (rename.has(n.name)) {
      n.name = `${n.name}${NOT_FRAMEWORK_SUFFIX}`
      return
    }
    const canonical = alias.get(n.name)
    if (canonical && parent?.type === 'CallExpression' && key === 'callee') n.name = canonical
  })
  return warnings
}

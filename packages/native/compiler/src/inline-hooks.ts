/**
 * Inline same-file custom hooks into the components that call them — a source-to-source pre-pass that runs before a
 * component is parsed for native emit.
 *
 * A custom hook is how a Pyreon app factors stateful logic: `function useMe(auth) { return useQuery(…) }`. On the web it
 * is an ordinary function call. Natively it has no standalone form at all: the hooks inside it (`signal`, `useQuery`,
 * `useOidc`, …) lower to VIEW state — SwiftUI `@State`, Compose `remember` — which only exists inside a component. The
 * compiler's helper path emits a same-file function as a plain top-level native function, which is right for pure logic
 * and structurally impossible for a hook, so a hook used to be skipped with "return type couldn't be inferred".
 *
 * What a custom hook MEANS is "this state belongs to the component that calls me", so the faithful lowering is to put
 * it there: `const me = useMe(auth)` becomes the hook's body, parameters replaced by the arguments and locals renamed
 * under the caller's name, before the component is parsed. Every hook the body uses is then recognised exactly as if the
 * author had written it inline.
 *
 * The rewrite is conservative, and REFUSES with a named reason anything it cannot rewrite faithfully, rather than
 * guessing:
 *
 * - The hook is a same-file top-level `function useX(…) {}` or `const useX = (…) => …`, not async or a generator, with no
 *   type parameters and plain identifier parameters.
 * - Its body is declarations and expression statements ending in ONE `return`. An early return or a branch at the top
 *   level is a control-flow shape this rewrite does not reproduce.
 * - Each argument is free of side effects and cheap to repeat (an identifier, a member read, a literal), because it is
 *   substituted textually wherever the parameter appears.
 * - No name the rewrite touches is re-declared in a nested scope (a parameter or a local shadowed by an inner function's
 *   own binding), because the rewrite is lexical, not scope-aware, and a shadowed name would be renamed wrongly.
 * - The returned value maps onto the call site: `return local` (the local takes the caller's name), `return <expr>`
 *   (assigned to the caller's name), or `return { a, b: c }` read through a destructuring call site
 *   (`const { a, b } = useX()`), each name mapping to the hook's own local.
 *
 * The pass repeats, so a hook that calls another same-file hook is inlined through. A hook whose every call site was
 * inlined is removed from the native source; one still referenced keeps its declaration and the existing helper path.
 *
 * A hook IMPORTED from a relative module (`import { useMe } from './hooks'`) is inlined the same way when the calling
 * file is on disk: the module is read, and what the hook's body needs from it travels along — its imports are added to
 * the calling file (relative paths rebased, a clashing name refused), the types it names are copied in, and another
 * hook from the same module is imported so the next pass inlines it too. A plain value from that module (a `const`, a
 * helper) is refused by name: PMTC compiles one file at a time, and copying it could silently duplicate state. Before
 * this, such a call was emitted unchanged with no warning, and the native build failed on a function that does not
 * exist natively — so an imported hook that cannot be inlined is now always NAMED.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'

// oxc's ESTree output, read structurally.
// oxlint-disable-next-line typescript/no-explicit-any
type Node = any

export interface InlineHooksResult {
  readonly code: string
  readonly warnings: string[]
}

interface HookDef {
  readonly name: string
  readonly params: string[]
  readonly body: Node[]
  /** The source text the body's positions index into — the calling file, or the module the hook is imported from. */
  readonly src: string
  /** Set for a hook imported from another module: what inlining it requires of the calling file. */
  readonly origin?: ImportedOrigin | undefined
  /** The statement to delete when no reference is left (an `export` wrapper included). */
  readonly declStart: number
  readonly declEnd: number
  /** Why this hook cannot be inlined, or `undefined` when it can. */
  readonly refusal: string | undefined
}

interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}

const HOOK_NAME = /^use[A-Z0-9]/
const MAX_PASSES = 8

export interface InlineHooksOptions {
  /**
   * Read a module the calling file imports a hook from, by absolute path; `undefined` when it does not exist. Defaults
   * to the filesystem, and only runs when `filename` is absolute — an in-memory transform has no directory to resolve
   * from, so an imported hook there is reported rather than read.
   */
  readonly readModule?: ((absolutePath: string) => string | undefined) | undefined
}

const readFromDisk = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

export function inlineCustomHooks(source: string, filename: string, options: InlineHooksOptions = {}): InlineHooksResult | null {
  if (!/\buse[A-Z0-9]\w*\s*(?:=|\(|<)/.test(source) && !/\bfrom\s+['"]\.{1,2}\//.test(source)) return null
  const readModule = options.readModule ?? readFromDisk
  let code = source
  const warnings: string[] = []
  const seenWarnings = new Set<string>()
  let changed = false
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const step = inlineOnce(code, filename, readModule)
    if (!step) break
    for (const w of step.warnings) {
      if (!seenWarnings.has(w)) {
        seenWarnings.add(w)
        warnings.push(w)
      }
    }
    if (step.code === code) break
    code = step.code
    changed = true
  }
  if (!changed && warnings.length === 0) return null
  return { code, warnings }
}

function inlineOnce(
  source: string,
  filename: string,
  readModule: (absolutePath: string) => string | undefined,
): InlineHooksResult | null {
  const ast = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  if (ast.errors.length > 0) return null
  const program = ast.program as Node
  const hooks = collectHooks(program, source)
  const unresolved = new Map<string, string>()
  for (const [local, def] of collectImportedHooks(program, filename, readModule, unresolved)) hooks.set(local, def)
  const callerTop = moduleTopBindings(program, source)
  const additions = new Map<string, string>()
  const warnings: string[] = []
  // Types imported from a sibling module travel too: natively there is no other file to resolve them from.
  const importedTypes = collectImportedTypes(program, filename, readModule, callerTop, additions, warnings)
  if (hooks.size === 0 && unresolved.size === 0 && importedTypes.size === 0) return warnings.length > 0 ? { code: source, warnings } : null

  const fileNames = collectAllIdentifierNames(program)
  const edits: Edit[] = []

  for (const stmt of program.body as Node[]) {
    for (const fn of componentFunctions(stmt)) {
      const body = fn.body
      if (!body || body.type !== 'BlockStatement') continue
      for (const s of body.body as Node[]) {
        const unresolvedName = calledName(s, unresolved)
        if (unresolvedName) {
          warnings.push(
            `${unresolvedName}() is a hook imported from another file that cannot be inlined into ${fnName(fn)} for native: ${unresolved.get(unresolvedName)}. Native code cannot call it, so the build would fail on this call.`,
          )
          continue
        }
        const site = callSite(s, hooks)
        if (!site) continue
        const hook = hooks.get(site.hookName)!
        if (hook.refusal) {
          warnings.push(`${hook.name}() is a custom hook that cannot be inlined into ${fnName(fn)} for native: ${hook.refusal}. It stays a helper function, which cannot hold hook state natively.`)
          continue
        }
        const result = expandCall(site, hook, source, fileNames)
        if ('refusal' in result) {
          warnings.push(`${hook.name}() cannot be inlined into ${fnName(fn)} for native: ${result.refusal}.`)
          continue
        }
        if (hook.origin) {
          const conflict = mergeRequirements(hook.origin, isAbsolute(filename) ? filename : resolve(filename), callerTop, additions)
          if (conflict) {
            warnings.push(`${hook.name}() cannot be inlined into ${fnName(fn)} for native: ${conflict}.`)
            continue
          }
        }
        edits.push({ start: s.start, end: s.end, text: result.text })
      }
    }
  }
  if (edits.length === 0 && importedTypes.size === 0) return warnings.length > 0 ? { code: source, warnings } : null
  if (additions.size > 0) {
    // After the last import, so the added imports and copied types precede the code that uses them.
    const imports = (program.body as Node[]).filter((n) => n.type === 'ImportDeclaration')
    const at = imports.length > 0 ? lineEnd(source, imports[imports.length - 1].end) : 0
    edits.push({ start: at, end: at, text: `${[...additions.values()].join('\n')}\n` })
  }

  let code = applyEdits(source, edits)
  // A hook nothing references any more is removed, so the helper path does not warn about a function no call needs.
  const after = parseSync(filename, code, { sourceType: 'module', lang: 'tsx' })
  if (after.errors.length === 0) {
    const remaining = collectHooks(after.program as Node, code)
    const refs = countReferences(after.program as Node)
    const removals: Edit[] = []
    for (const h of remaining.values()) {
      if ((refs.get(h.name) ?? 0) === 0) removals.push({ start: h.declStart, end: h.declEnd, text: '' })
    }
    // An inlined hook's import specifier is spent once nothing calls it.
    const spent = new Set([...[...hooks.values()].filter((h) => h.origin).map((h) => h.origin!.local), ...importedTypes])
    for (const imp of (after.program as Node).body as Node[]) {
      if (imp.type !== 'ImportDeclaration' || !isRelative(imp.source.value)) continue
      const keep = (imp.specifiers as Node[]).filter((sp) => !(spent.has(sp.local.name) && (refs.get(sp.local.name) ?? 0) === 0))
      if (keep.length === imp.specifiers.length) continue
      removals.push({ start: imp.start, end: lineEnd(code, imp.end), text: keep.length === 0 ? '' : `${importText(keep, imp.source.value, code)}\n` })
    }
    if (removals.length > 0) code = applyEdits(code, removals)
  }
  return { code, warnings }
}

// ─── Collection ──────────────────────────────────────────────────────────────

function collectHooks(program: Node, source: string): Map<string, HookDef> {
  const out = new Map<string, HookDef>()
  for (const stmt of program.body as Node[]) {
    const decl =
      (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') && stmt.declaration ? stmt.declaration : stmt
    if (decl.type === 'FunctionDeclaration' && decl.id && HOOK_NAME.test(decl.id.name)) {
      out.set(decl.id.name, hookDef(decl.id.name, decl, stmt, source))
    } else if (decl.type === 'VariableDeclaration' && decl.kind === 'const' && decl.declarations.length === 1) {
      const d = decl.declarations[0]
      const init = d.init
      if (
        d.id?.type === 'Identifier' &&
        HOOK_NAME.test(d.id.name) &&
        init &&
        (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      ) {
        out.set(d.id.name, hookDef(d.id.name, init, stmt, source))
      }
    }
  }
  return out
}

function hookDef(name: string, fn: Node, stmt: Node, source: string): HookDef {
  const base = { name, src: source, declStart: stmt.start, declEnd: lineEnd(source, stmt.end) }
  const refuse = (refusal: string): HookDef => ({ ...base, params: [], body: [], refusal })
  if (fn.async) return refuse('it is async')
  if (fn.generator) return refuse('it is a generator')
  if (fn.typeParameters) return refuse('it is generic')
  const params: string[] = []
  for (const p of fn.params as Node[]) {
    const id = p.type === 'TSParameterProperty' ? p.parameter : p
    if (id.type !== 'Identifier') return refuse('a parameter is destructured, defaulted or a rest parameter')
    params.push(id.name)
  }
  let body: Node[]
  if (fn.body.type === 'BlockStatement') {
    body = fn.body.body
  } else {
    // `const useX = (a) => expr` — an implicit return.
    body = [{ type: 'ReturnStatement', argument: fn.body, start: fn.body.start, end: fn.body.end }]
  }
  const last = body[body.length - 1]
  if (!last || last.type !== 'ReturnStatement' || !last.argument) return refuse('it does not end in a single `return <value>`')
  for (const s of body.slice(0, -1)) {
    if (s.type !== 'VariableDeclaration' && s.type !== 'ExpressionStatement') {
      return refuse(`its body has a \`${describeStatement(s)}\` at the top level, and only declarations and expression statements are inlined`)
    }
  }
  if (containsReturnOutsideNestedFunctions(body.slice(0, -1))) return refuse('it returns early')
  return { ...base, params, body, refusal: undefined }
}

function* componentFunctions(stmt: Node): Generator<Node> {
  const decl = stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration' ? stmt.declaration : stmt
  if (!decl) return
  if (decl.type === 'FunctionDeclaration' && decl.id && /^[A-Z]/.test(decl.id.name)) yield decl
  if (decl.type === 'VariableDeclaration') {
    for (const d of decl.declarations as Node[]) {
      if (
        d.id?.type === 'Identifier' &&
        /^[A-Z]/.test(d.id.name) &&
        d.init &&
        (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')
      ) {
        yield { ...d.init, id: d.id }
      }
    }
  }
}

const fnName = (fn: Node): string => fn.id?.name ?? 'a component'

interface CallSite {
  readonly hookName: string
  readonly args: Node[]
  /** `const x = useX()`. */
  readonly binding?: string | undefined
  /** `const { a, b: c } = useX()` — returned property → the caller's binding name. */
  readonly destructure?: Map<string, string> | undefined
  readonly declKind?: string | undefined
}

function callSite(s: Node, hooks: Map<string, HookDef>): CallSite | undefined {
  const call = (n: Node): Node | undefined =>
    n?.type === 'CallExpression' && n.callee?.type === 'Identifier' && hooks.has(n.callee.name) ? n : undefined
  if (s.type === 'ExpressionStatement') {
    const c = call(s.expression)
    return c ? { hookName: c.callee.name, args: c.arguments } : undefined
  }
  if (s.type !== 'VariableDeclaration' || s.declarations.length !== 1) return undefined
  const d = s.declarations[0]
  const c = call(d.init)
  if (!c) return undefined
  if (d.id.type === 'Identifier') return { hookName: c.callee.name, args: c.arguments, binding: d.id.name, declKind: s.kind }
  if (d.id.type === 'ObjectPattern') {
    const map = new Map<string, string>()
    for (const p of d.id.properties as Node[]) {
      if (p.type !== 'Property' || p.computed || p.key.type !== 'Identifier' || p.value.type !== 'Identifier') {
        return { hookName: c.callee.name, args: c.arguments, destructure: undefined, declKind: 'unsupported-pattern' }
      }
      map.set(p.key.name, p.value.name)
    }
    return { hookName: c.callee.name, args: c.arguments, destructure: map, declKind: s.kind }
  }
  return { hookName: c.callee.name, args: c.arguments, declKind: 'unsupported-pattern' }
}

// ─── Expansion ───────────────────────────────────────────────────────────────

type Expansion = { readonly text: string } | { readonly refusal: string }

function expandCall(site: CallSite, hook: HookDef, source: string, fileNames: Set<string>): Expansion {
  const hookSrc = hook.src
  if (site.declKind === 'unsupported-pattern') return { refusal: 'the call site destructures with a nested, computed or rest pattern' }
  if (site.args.length > hook.params.length) return { refusal: 'it is called with more arguments than it declares' }
  const paramText = new Map<string, string>()
  for (const [i, p] of hook.params.entries()) {
    const a = site.args[i]
    if (!a) {
      paramText.set(p, 'undefined')
      continue
    }
    if (a.type === 'SpreadElement' || !isRepeatable(a)) {
      return { refusal: `argument ${i + 1} (\`${source.slice(a.start, a.end)}\`) is an expression with a cost or a side effect; bind it to a \`const\` first and pass the name` }
    }
    // An identifier, a member read or a literal is already atomic; wrapping it would turn `auth.subject()` into
    // `(auth).subject()`, which the native receiver lowering does not recognise. Only a cast needs parentheses.
    const text = source.slice(a.start, a.end)
    paramText.set(p, a.type === 'TSAsExpression' || a.type === 'TSNonNullExpression' ? `(${text})` : text)
  }

  const ret = hook.body[hook.body.length - 1]
  const statements = hook.body.slice(0, -1)
  const locals = topLevelLocals(statements)

  // Names the rewrite touches must not be re-declared in any nested scope — the rewrite is lexical.
  const nestedBindings = collectNestedBindings(hook.body)
  for (const n of [...hook.params, ...locals]) {
    if (nestedBindings.has(n)) return { refusal: `\`${n}\` is re-declared in a nested scope inside the hook` }
  }
  for (const p of hook.params) {
    if (locals.includes(p)) return { refusal: `the parameter \`${p}\` is re-declared in the hook body` }
  }

  // How the returned value reaches the caller.
  const renames = new Map<string, string>()
  let tail = ''
  const arg = ret.argument
  if (site.destructure) {
    if (arg.type !== 'ObjectExpression') return { refusal: 'the call site destructures the result, but the hook does not return an object literal' }
    const returned = new Map<string, string>()
    for (const p of arg.properties as Node[]) {
      if (p.type !== 'Property' || p.computed || p.key.type !== 'Identifier' || p.value.type !== 'Identifier' || !locals.includes(p.value.name)) {
        return { refusal: 'the hook returns an object whose entries are not all its own locals (`{ a, b: c }`)' }
      }
      returned.set(p.key.name, p.value.name)
    }
    for (const [key, binding] of site.destructure) {
      const local = returned.get(key)
      if (!local) return { refusal: `the hook returns no \`${key}\`` }
      if (renames.has(local)) return { refusal: `\`${local}\` is destructured twice` }
      renames.set(local, binding)
    }
  } else if (arg.type === 'Identifier' && locals.includes(arg.name)) {
    if (site.binding) renames.set(arg.name, site.binding)
  } else if (arg.type === 'ObjectExpression' && site.binding) {
    return { refusal: `the hook returns an object; read it through destructuring (\`const { … } = ${hook.name}(…)\`) so each value keeps its own native state` }
  } else if (site.binding) {
    tail = `${site.declKind ?? 'const'} ${site.binding} = `
  }

  // Every other local takes a name prefixed by the caller, unique in the file.
  const prefix = site.binding ?? hook.name.replace(/^use/, '').replace(/^./, (c) => c.toLowerCase())
  const used = new Set([...fileNames, ...renames.values()])
  for (const l of locals) {
    if (renames.has(l)) continue
    let candidate = `${prefix}${l[0]!.toUpperCase()}${l.slice(1)}`
    let n = 2
    while (used.has(candidate)) candidate = `${prefix}${l[0]!.toUpperCase()}${l.slice(1)}${n++}`
    used.add(candidate)
    renames.set(l, candidate)
  }

  const parts = statements.map((s) => rewrite(hookSrc, s.start, s.end, paramText, renames))
  if (tail) parts.push(tail + rewrite(hookSrc, arg.start, arg.end, paramText, renames))
  return { text: parts.join('\n') }
}

/** Repeating it is free and changes nothing: a name, a member read, a literal. */
function isRepeatable(n: Node): boolean {
  switch (n.type) {
    case 'Identifier':
    case 'Literal':
    case 'ThisExpression':
      return true
    case 'TemplateLiteral':
      return n.expressions.length === 0
    case 'MemberExpression':
      return !n.computed && isRepeatable(n.object)
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'ParenthesizedExpression':
      return isRepeatable(n.expression)
    default:
      return false
  }
}

/** Source `[start, end)` with every reference to a parameter or a renamed local replaced. */
function rewrite(
  source: string,
  start: number,
  end: number,
  params: Map<string, string>,
  renames: Map<string, string> | null,
): string {
  const ast = parseSync('fragment.tsx', source, { sourceType: 'module', lang: 'tsx' })
  const edits: Edit[] = []
  walkRefs(ast.program, (id, kind) => {
    if (id.start < start || id.end > end) return
    const name = id.name
    // A parameter is never re-bound in the body (checked before rewriting), so only a local's own declaration renames.
    const replacement = kind === 'binding' ? renames?.get(name) : (params.get(name) ?? renames?.get(name))
    if (replacement === undefined) return
    if (kind === 'shorthand') edits.push({ start: id.start, end: id.end, text: `${name}: ${replacement}` })
    else edits.push({ start: id.start, end: id.end, text: replacement })
  })
  return applyEdits(source.slice(0, end), edits).slice(start)
}

// ─── Hooks imported from another module ──────────────────────────────────────

interface ImportedOrigin {
  /** The name the calling file imports the hook under. */
  readonly local: string
  /** Absolute path of the module the hook lives in. */
  readonly modulePath: string
  /** Imports the hook's body needs, keyed by the name it uses. */
  readonly imports: ReadonlyMap<string, ImportBinding>
  /** Type declarations the hook's body names, copied into the calling file. */
  readonly types: ReadonlyMap<string, string>
}

interface ImportBinding {
  /** The module specifier, as written in the module it was found in. */
  readonly spec: string
  /** Absolute path the specifier was found relative to — used to rebase a relative specifier. */
  readonly fromFile: string
  /** `default`, `*`, or the exported name. */
  readonly imported: string
  readonly typeOnly: boolean
}

type TopBinding =
  | ({ readonly kind: 'import' } & ImportBinding)
  | { readonly kind: 'hook' }
  | { readonly kind: 'type'; readonly text: string }
  | { readonly kind: 'value' }

/** Keys of the pending additions map — one per copied type, one per added import, so a repeat is a no-op. */
const typeKey = (name: string): string => 'type:' + name
const importKey = (name: string): string => 'import:' + name

const isRelative = (spec: string): boolean => spec === '.' || spec.startsWith('./') || spec.startsWith('../')

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

function resolveModule(fromFile: string, spec: string, readModule: (p: string) => string | undefined): { path: string; source: string } | undefined {
  const base = resolve(dirname(fromFile), spec)
  for (const candidate of [base, ...MODULE_EXTENSIONS.map((e) => base + e)]) {
    if (/\.(c|m)?[jt]sx?$/.test(candidate) || candidate !== base) {
      const source = readModule(candidate)
      if (source !== undefined) return { path: candidate, source }
    }
  }
  return undefined
}

/**
 * Hooks the calling file imports from a relative module, keyed by their LOCAL name. A hook that cannot be read or
 * inlined lands in `unresolved` with the reason instead, so its call sites are reported rather than emitted unchanged.
 */
function collectImportedHooks(
  program: Node,
  filename: string,
  readModule: (p: string) => string | undefined,
  unresolved: Map<string, string>,
): Map<string, HookDef> {
  const out = new Map<string, HookDef>()
  for (const imp of program.body as Node[]) {
    if (imp.type !== 'ImportDeclaration' || imp.importKind === 'type' || !isRelative(imp.source.value)) continue
    // `import { useMe }`, `import { useMe as useProfile }`, and a default-imported hook (`import useMe from …`).
    const named = (imp.specifiers as Node[]).filter(
      (sp) =>
        (sp.type === 'ImportSpecifier' && sp.importKind !== 'type' && HOOK_NAME.test(sp.imported.name ?? sp.imported.value)) ||
        (sp.type === 'ImportDefaultSpecifier' && HOOK_NAME.test(sp.local.name)),
    )
    if (named.length === 0) continue
    const spec = imp.source.value as string
    // The file has to NAME a real file — absolute, or relative to the working directory (how the golden gate and the
    // CLI pass it). An in-memory name such as `input.tsx` has no directory to resolve from.
    const callerPath = isAbsolute(filename) ? filename : resolve(filename)
    if (readModule(callerPath) === undefined) {
      for (const sp of named) unresolved.set(sp.local.name, `'${spec}' cannot be read, because this file was compiled from memory rather than from a path`)
      continue
    }
    const mod = resolveModule(callerPath, spec, readModule)
    if (!mod) {
      for (const sp of named) unresolved.set(sp.local.name, `'${spec}' was not found next to this file`)
      continue
    }
    for (const sp of named) {
      const exportName = sp.type === 'ImportDefaultSpecifier' ? 'default' : ((sp.imported.name ?? sp.imported.value) as string)
      // Follows the module's own export, an aliased export, a named re-export and `export *` — a barrel `index.ts`.
      const found = findExportedHook(mod.path, mod.source, exportName, readModule, new Set())
      if ('reason' in found) {
        unresolved.set(sp.local.name, `'${spec}' ${found.reason}`)
        continue
      }
      const { def, path } = found
      if (def.refusal) {
        unresolved.set(sp.local.name, def.refusal)
        continue
      }
      const needs = requirementsOf(def, found.top, path)
      if (typeof needs === 'string') {
        unresolved.set(sp.local.name, needs)
        continue
      }
      out.set(sp.local.name, { ...def, name: sp.local.name, origin: { local: sp.local.name, modulePath: path, ...needs } })
    }
  }
  return out
}

const MAX_REEXPORT_DEPTH = 8

interface FoundHook {
  readonly def: HookDef
  /** The module that DEFINES the hook — what its requirements and relative imports are resolved against. */
  readonly path: string
  readonly top: Map<string, TopBinding>
}

/**
 * The hook a module exports as `exportName` (`default` for a default export), following the module's own declaration,
 * an aliased export (`export { inner as useMe }`), a named re-export (`export { useMe } from './me'`) and `export *` —
 * so a barrel `index.ts` resolves to the module that actually defines the hook. `seen` stops a re-export cycle.
 */
function findExportedHook(
  path: string,
  source: string,
  exportName: string,
  readModule: (p: string) => string | undefined,
  seen: Set<string>,
): FoundHook | { readonly reason: string } {
  const key = `${path}#${exportName}`
  if (seen.has(key) || seen.size > MAX_REEXPORT_DEPTH) return { reason: `re-exports \`${exportName}\` in a cycle` }
  seen.add(key)
  const parsed = parseSync(path, source, { sourceType: 'module', lang: 'tsx' })
  if (parsed.errors.length > 0) return { reason: 'does not parse' }
  const program = parsed.program as Node
  const defs = collectHooks(program, source)
  const found = (localName: string): FoundHook | undefined => {
    const def = defs.get(localName)
    return def ? { def, path, top: moduleTopBindings(program, source, path) } : undefined
  }

  for (const stmt of program.body as Node[]) {
    if (stmt.type === 'ExportDefaultDeclaration' && exportName === 'default') {
      const d = stmt.declaration
      if (d?.type === 'FunctionDeclaration' && d.id) return found(d.id.name) ?? { reason: `default-exports \`${d.id.name}\`, which is not a hook it can inline` }
      if (d?.type === 'Identifier') return found(d.name) ?? { reason: `default-exports \`${d.name}\`, which is not a hook it can inline` }
      if (d && (d.type === 'FunctionDeclaration' || d.type === 'ArrowFunctionExpression' || d.type === 'FunctionExpression')) {
        return { def: hookDef('default', d, stmt, source), path, top: moduleTopBindings(program, source, path) }
      }
      return { reason: 'default-exports something that is not a function' }
    }
    if (stmt.type !== 'ExportNamedDeclaration') continue
    const d = stmt.declaration
    if (exportName !== 'default') {
      if (d?.type === 'FunctionDeclaration' && d.id?.name === exportName) return found(exportName) ?? { reason: `exports \`${exportName}\`, which is not a hook it can inline` }
      if (d?.type === 'VariableDeclaration' && (d.declarations as Node[]).some((x) => x.id?.name === exportName)) {
        return found(exportName) ?? { reason: `exports \`${exportName}\`, which is not a hook it can inline` }
      }
    }
    for (const sp of (stmt.specifiers as Node[] | undefined) ?? []) {
      if ((sp.exported.name ?? sp.exported.value) !== exportName) continue
      const local = (sp.local.name ?? sp.local.value) as string
      if (!stmt.source) return found(local) ?? { reason: `exports \`${exportName}\` as \`${local}\`, which is not a hook it can inline` }
      // `export { useMe } from './me'` / `export { default as useMe } from './me'`
      const next = resolveModule(path, stmt.source.value, readModule)
      if (!next) return { reason: `re-exports \`${exportName}\` from '${stmt.source.value}', which was not found` }
      return findExportedHook(next.path, next.source, local, readModule, seen)
    }
  }
  // `export * from './x'` never re-exports a default.
  if (exportName !== 'default') {
    for (const stmt of program.body as Node[]) {
      if (stmt.type !== 'ExportAllDeclaration' || stmt.exported) continue
      const next = resolveModule(path, stmt.source.value, readModule)
      if (!next) continue
      const result = findExportedHook(next.path, next.source, exportName, readModule, seen)
      if (!('reason' in result)) return result
    }
  }
  return { reason: `exports no hook named \`${exportName}\`` }
}

/** Every top-level name a module binds, and what it is. */
function moduleTopBindings(program: Node, source: string, path = ''): Map<string, TopBinding> {
  const out = new Map<string, TopBinding>()
  for (const stmt of program.body as Node[]) {
    if (stmt.type === 'ImportDeclaration') {
      for (const sp of stmt.specifiers as Node[]) {
        const imported =
          sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : ((sp.imported.name ?? sp.imported.value) as string)
        out.set(sp.local.name, {
          kind: 'import',
          spec: stmt.source.value,
          fromFile: path,
          imported,
          typeOnly: stmt.importKind === 'type' || sp.importKind === 'type',
        })
      }
      continue
    }
    const decl = (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') && stmt.declaration ? stmt.declaration : stmt
    if (decl.type === 'TSTypeAliasDeclaration' || decl.type === 'TSInterfaceDeclaration') {
      out.set(decl.id.name, { kind: 'type', text: source.slice(decl.start, decl.end) })
    } else if (decl.type === 'FunctionDeclaration' && decl.id) {
      out.set(decl.id.name, HOOK_NAME.test(decl.id.name) ? { kind: 'hook' } : { kind: 'value' })
    } else if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations as Node[]) {
        const names: string[] = []
        collectPatternNames(d.id, names)
        for (const n of names) {
          const isHook = HOOK_NAME.test(n) && (d.init?.type === 'ArrowFunctionExpression' || d.init?.type === 'FunctionExpression')
          out.set(n, isHook ? { kind: 'hook' } : { kind: 'value' })
        }
      }
    } else if ((decl.type === 'ClassDeclaration' || decl.type === 'TSEnumDeclaration') && decl.id) {
      out.set(decl.id.name, { kind: 'value' })
    }
  }
  return out
}

/**
 * Copy the types this file imports from a sibling module (`import type { Me } from './types'`, or a type named in a
 * value import) into the file, with the types they name in turn, and return the local names whose import specifier is
 * then spent. Natively there is no other file to resolve a type from, so without this a struct the file uses simply
 * does not exist. An aliased type import is left alone, and a different same-named declaration here is refused.
 */
function collectImportedTypes(
  program: Node,
  filename: string,
  readModule: (p: string) => string | undefined,
  callerTop: Map<string, TopBinding>,
  additions: Map<string, string>,
  warnings: string[],
): Set<string> {
  const spent = new Set<string>()
  const callerPath = isAbsolute(filename) ? filename : resolve(filename)
  let callerExists: boolean | undefined
  for (const imp of program.body as Node[]) {
    if (imp.type !== 'ImportDeclaration' || !isRelative(imp.source.value)) continue
    const candidates = (imp.specifiers as Node[]).filter(
      (sp) => sp.type === 'ImportSpecifier' && !HOOK_NAME.test((sp.imported.name ?? sp.imported.value) as string),
    )
    if (candidates.length === 0) continue
    callerExists ??= readModule(callerPath) !== undefined
    if (!callerExists) return spent
    const mod = resolveModule(callerPath, imp.source.value, readModule)
    if (!mod) continue
    const parsed = parseSync(mod.path, mod.source, { sourceType: 'module', lang: 'tsx' })
    if (parsed.errors.length > 0) continue
    const top = moduleTopBindings(parsed.program as Node, mod.source, mod.path)
    for (const sp of candidates) {
      const name = (sp.imported.name ?? sp.imported.value) as string
      const b = top.get(name)
      if (b?.kind !== 'type' || sp.local.name !== name) continue
      // The type and every type it names, in this module.
      const texts = new Map<string, string>()
      const pending = [name]
      while (pending.length > 0) {
        const t = pending.pop()!
        if (texts.has(t)) continue
        const tb = top.get(t)
        if (tb?.kind !== 'type') continue
        texts.set(t, tb.text.replace(/^export\s+/, ''))
        pending.push(...collectTypeRefs(parseSync('t.ts', tb.text, { sourceType: 'module', lang: 'ts' }).program))
      }
      let conflict: string | undefined
      for (const [t, text] of texts) {
        const existing = callerTop.get(t)
        if (t === name && existing?.kind === 'import') continue // the import being replaced
        if (existing && !(existing.kind === 'type' && existing.text.replace(/^export\s+/, '') === text)) {
          conflict = `\`${t}\` is already declared differently in this file`
          break
        }
      }
      if (conflict) {
        warnings.push(`The type \`${name}\` imported from '${imp.source.value}' cannot be copied in for native: ${conflict}.`)
        continue
      }
      for (const [t, text] of texts) {
        if (callerTop.get(t)?.kind === 'type') continue
        additions.set(typeKey(t), text)
      }
      spent.add(sp.local.name)
    }
  }
  return spent
}

/**
 * What inlining `def` (from the module at `modulePath`) requires of a calling file, or why it cannot be inlined:
 * every free VALUE name its body uses must be an import of that module (carried over) or another hook of it (imported,
 * so the next pass inlines it); every TYPE it names is copied over, with the types those name in turn.
 */
function requirementsOf(
  def: HookDef,
  top: Map<string, TopBinding>,
  modulePath: string,
): Pick<ImportedOrigin, 'imports' | 'types'> | string {
  const bound = new Set([...def.params, ...topLevelLocals(def.body.slice(0, -1)), ...collectNestedBindings(def.body)])
  const imports = new Map<string, ImportBinding>()
  const types = new Map<string, string>()
  const valueNames = new Set<string>()
  walkRefs(def.body, (id, kind) => {
    if (kind !== 'binding' && !bound.has(id.name)) valueNames.add(id.name)
  })
  for (const name of valueNames) {
    const b = top.get(name)
    if (!b) continue // a global (`fetch`, `Math`, `JSON`, …)
    if (b.kind === 'import') imports.set(name, b)
    else if (b.kind === 'hook') imports.set(name, { spec: `./${relative(dirname(modulePath), modulePath)}`, fromFile: modulePath, imported: name, typeOnly: false })
    else if (b.kind === 'value') return `it uses \`${name}\`, which its own module declares — native code compiles one file at a time, so move \`${name}\` into a package or pass it in as an argument`
  }
  const pending = [...collectTypeRefs(def.body)]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (types.has(name) || imports.has(name) || bound.has(name)) continue
    const b = top.get(name)
    if (!b) continue // a built-in type
    if (b.kind === 'type') {
      types.set(name, b.text)
      const parsed = parseSync('types.ts', b.text, { sourceType: 'module', lang: 'ts' })
      pending.push(...collectTypeRefs(parsed.program))
    } else if (b.kind === 'import') {
      imports.set(name, { ...b, typeOnly: true })
    }
  }
  return { imports, types }
}

/** Every type name referenced (`Foo`, `Foo<…>`, `typeof foo`'s `foo` is a value and is not collected). */
function collectTypeRefs(node: Node): Set<string> {
  const out = new Set<string>()
  const visit = (n: Node): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (n.type === 'TSTypeReference' && n.typeName?.type === 'Identifier') out.add(n.typeName.name)
    if (n.type === 'TSInterfaceHeritage' || n.type === 'TSClassImplements') {
      if (n.expression?.type === 'Identifier') out.add(n.expression.name)
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(node)
  return out
}

/**
 * Fold one inlined hook's requirements into the calling file's pending additions. Returns why it cannot be inlined
 * (a name it needs is already bound to something else in the calling file), or `undefined`.
 */
function mergeRequirements(
  origin: ImportedOrigin,
  callerFile: string,
  callerTop: Map<string, TopBinding>,
  additions: Map<string, string>,
): string | undefined {
  const lines = new Map<string, string>()
  for (const [name, b] of origin.imports) {
    const spec = rebase(b.spec, b.fromFile, callerFile)
    const existing = callerTop.get(name)
    if (existing) {
      const same = existing.kind === 'import' && existing.imported === b.imported && rebase(existing.spec, callerFile, callerFile) === spec
      if (!same) return `it needs \`${name}\` from '${spec}', but this file already uses that name for something else`
      continue
    }
    const key = importKey(name)
    const line = importLine(name, b.imported, spec, b.typeOnly)
    const pending = additions.get(key)
    if (pending !== undefined && pending !== line) return `it needs \`${name}\` from '${spec}', which another inlined hook imports differently`
    lines.set(key, line)
  }
  for (const [name, text] of origin.types) {
    const existing = callerTop.get(name)
    const copied = text.replace(/^export\s+/, '')
    // The same declaration already on its way in (the file imports the type from the same module).
    if (additions.get(typeKey(name)) === copied) continue
    if (existing) {
      if (existing.kind === 'type' && existing.text.replace(/^export\s+/, '') === copied) continue
      return `it names the type \`${name}\`, and this file already declares a different \`${name}\``
    }
    lines.set(typeKey(name), copied)
  }
  for (const [k, v] of lines) additions.set(k, v)
  return undefined
}

function rebase(spec: string, fromFile: string, toFile: string): string {
  if (!isRelative(spec) || fromFile === '' || fromFile === toFile) return spec
  const target = resolve(dirname(fromFile), spec).replace(/\.(c|m)?[jt]sx?$/, '')
  let rel = relative(dirname(toFile), target).split('\\').join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

function importLine(local: string, imported: string, spec: string, typeOnly: boolean): string {
  const kw = typeOnly ? 'import type' : 'import'
  if (imported === 'default') return `${kw} ${local} from '${spec}'`
  if (imported === '*') return `${kw} * as ${local} from '${spec}'`
  return `${kw} { ${imported === local ? local : `${imported} as ${local}`} } from '${spec}'`
}

function importText(specifiers: Node[], spec: string, source: string): string {
  const def = specifiers.find((sp) => sp.type === 'ImportDefaultSpecifier')
  const ns = specifiers.find((sp) => sp.type === 'ImportNamespaceSpecifier')
  const named = specifiers.filter((sp) => sp.type === 'ImportSpecifier').map((sp) => source.slice(sp.start, sp.end))
  const parts: string[] = []
  if (def) parts.push(def.local.name)
  if (ns) parts.push(`* as ${ns.local.name}`)
  if (named.length > 0) parts.push(`{ ${named.join(', ')} }`)
  return `import ${parts.join(', ')} from '${spec}'`
}

/** The local name of a hook in `names` called at the top of statement `s`, if any. */
function calledName(s: Node, names: Map<string, string>): string | undefined {
  const call =
    s.type === 'ExpressionStatement' ? s.expression : s.type === 'VariableDeclaration' && s.declarations.length === 1 ? s.declarations[0].init : undefined
  return call?.type === 'CallExpression' && call.callee?.type === 'Identifier' && names.has(call.callee.name) ? call.callee.name : undefined
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

type RefKind = 'ref' | 'binding' | 'shorthand'

/**
 * Visit every identifier that names a VALUE: a reference (`ref`), a declaration's own name (`binding`), or a shorthand
 * object property (`shorthand`, which must keep its key). Property keys, member properties, labels and type positions
 * are not values and are skipped.
 */
function walkRefs(node: Node, visit: (id: Node, kind: RefKind) => void, parent?: Node, key?: string): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) walkRefs(n, visit, parent, key)
    return
  }
  if (typeof node.type !== 'string') return
  if (node.type.startsWith('TS') && node.type !== 'TSAsExpression' && node.type !== 'TSNonNullExpression' && node.type !== 'TSSatisfiesExpression') return
  if (node.type === 'Identifier') {
    if (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) return
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && key === 'key' && !parent.computed) {
      // A shorthand `{ name }` rewrites to `{ name: replacement }` whether it reads a value or binds one in a pattern.
      if (parent.type === 'Property' && parent.shorthand) visit(node, 'shorthand')
      return
    }
    if (parent?.type === 'Property' && key === 'value' && parent.shorthand) return // visited through the key
    if (parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') return
    if (parent?.type === 'JSXAttribute') return
    // An import specifier DECLARES its local name; the name it imports is the other module's, not a value here.
    if (parent?.type === 'ImportSpecifier' || parent?.type === 'ImportDefaultSpecifier' || parent?.type === 'ImportNamespaceSpecifier') {
      if (key === 'local') visit(node, 'binding')
      return
    }
    // `export { a as b }` reads `a` (counted by `countReferences`); the exported name is not a value here.
    if (parent?.type === 'ExportSpecifier') return
    const isBinding =
      (parent?.type === 'VariableDeclarator' && key === 'id') ||
      ((parent?.type === 'FunctionDeclaration' || parent?.type === 'FunctionExpression' || parent?.type === 'ArrowFunctionExpression') && (key === 'id' || key === 'params'))
    visit(node, isBinding ? 'binding' : 'ref')
    return
  }
  if (node.type === 'JSXIdentifier') {
    // `<Foo>` with a capitalised name refers to a value; an intrinsic tag or an attribute name does not.
    if (parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') {
      if (/^[A-Z]/.test(node.name)) visit(node, 'ref')
    } else if (parent?.type === 'JSXMemberExpression' && key === 'object') {
      visit(node, 'ref')
    }
    return
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'range' || k === 'loc' || k === 'typeAnnotation' || k === 'returnType' || k === 'typeParameters' || k === 'typeArguments') continue
    walkRefs(node[k], visit, node, k)
  }
}

function topLevelLocals(statements: Node[]): string[] {
  const out: string[] = []
  for (const s of statements) {
    if (s.type !== 'VariableDeclaration') continue
    for (const d of s.declarations as Node[]) collectPatternNames(d.id, out)
  }
  return out
}

function collectPatternNames(p: Node, out: string[]): void {
  if (!p) return
  switch (p.type) {
    case 'Identifier':
      out.push(p.name)
      return
    case 'ObjectPattern':
      for (const prop of p.properties as Node[]) collectPatternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out)
      return
    case 'ArrayPattern':
      for (const el of p.elements as Node[]) if (el) collectPatternNames(el.type === 'RestElement' ? el.argument : el, out)
      return
    case 'AssignmentPattern':
      collectPatternNames(p.left, out)
      return
    case 'RestElement':
      collectPatternNames(p.argument, out)
  }
}

/** Every name bound inside a NESTED function (its params, its declarations, a catch param). */
function collectNestedBindings(body: Node[]): Set<string> {
  const out = new Set<string>()
  const visit = (n: Node, nested: boolean): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c, nested)
      return
    }
    if (typeof n.type !== 'string') return
    const isFn = n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression'
    if (isFn) {
      const names: string[] = []
      for (const p of n.params as Node[]) collectPatternNames(p.type === 'TSParameterProperty' ? p.parameter : p, names)
      if (n.id && nested) names.push(n.id.name)
      for (const x of names) out.add(x)
      visit(n.body, true)
      return
    }
    if (nested && n.type === 'VariableDeclaration') {
      const names: string[] = []
      for (const d of n.declarations as Node[]) collectPatternNames(d.id, names)
      for (const x of names) out.add(x)
    }
    if (n.type === 'CatchClause' && n.param) {
      const names: string[] = []
      collectPatternNames(n.param, names)
      for (const x of names) out.add(x)
    }
    // A block-scoped declaration inside a top-level block (`if`, `for`) is nested too.
    const childNested = nested || n.type === 'BlockStatement' || n.type === 'ForStatement' || n.type === 'ForInStatement' || n.type === 'ForOfStatement'
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end') continue
      visit(n[k], childNested && k !== 'test')
    }
  }
  visit(body, false)
  return out
}

function containsReturnOutsideNestedFunctions(statements: Node[]): boolean {
  let found = false
  const visit = (n: Node): void => {
    if (found || !n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (typeof n.type !== 'string') return
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') return
    if (n.type === 'ReturnStatement') {
      found = true
      return
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(statements)
  return found
}

function collectAllIdentifierNames(program: Node): Set<string> {
  const out = new Set<string>()
  const visit = (n: Node): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if ((n.type === 'Identifier' || n.type === 'JSXIdentifier') && typeof n.name === 'string') out.add(n.name)
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(program)
  return out
}

/** References to each hook name, excluding the name in its own declaration. */
function countReferences(program: Node): Map<string, number> {
  const counts = new Map<string, number>()
  walkRefs(program, (id, kind) => {
    if (kind === 'binding') return
    counts.set(id.name, (counts.get(id.name) ?? 0) + 1)
  })
  // `export { useX }` re-exports count as a reference.
  for (const s of program.body as Node[]) {
    if (s.type === 'ExportNamedDeclaration' && !s.declaration) {
      for (const sp of s.specifiers as Node[]) {
        const local = sp.local?.name
        if (local) counts.set(local, (counts.get(local) ?? 0) + 1)
      }
    }
  }
  return counts
}

function describeStatement(s: Node): string {
  switch (s.type) {
    case 'IfStatement':
      return 'if'
    case 'ForStatement':
    case 'ForOfStatement':
    case 'ForInStatement':
      return 'for'
    case 'WhileStatement':
    case 'DoWhileStatement':
      return 'while'
    case 'FunctionDeclaration':
      return 'function declaration'
    case 'TryStatement':
      return 'try'
    case 'SwitchStatement':
      return 'switch'
    default:
      return s.type
  }
}

function lineEnd(source: string, offset: number): number {
  return source[offset] === '\n' ? offset + 1 : offset
}

function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = source
  let floor = Number.POSITIVE_INFINITY
  for (const e of sorted) {
    if (e.end > floor) continue // overlapping edit: keep the outer, earlier-applied one
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
    floor = e.start
  }
  return out
}

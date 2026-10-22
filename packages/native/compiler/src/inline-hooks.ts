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
 */
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

export function inlineCustomHooks(source: string, filename: string): InlineHooksResult | null {
  if (!/\buse[A-Z0-9]\w*\s*(?:=|\()/.test(source)) return null
  let code = source
  const warnings: string[] = []
  const seenWarnings = new Set<string>()
  let changed = false
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const step = inlineOnce(code, filename)
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

function inlineOnce(source: string, filename: string): InlineHooksResult | null {
  const ast = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  if (ast.errors.length > 0) return null
  const program = ast.program as Node
  const hooks = collectHooks(program, source)
  if (hooks.size === 0) return null

  const fileNames = collectAllIdentifierNames(program)
  const edits: Edit[] = []
  const warnings: string[] = []

  for (const stmt of program.body as Node[]) {
    for (const fn of componentFunctions(stmt)) {
      const body = fn.body
      if (!body || body.type !== 'BlockStatement') continue
      for (const s of body.body as Node[]) {
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
        edits.push({ start: s.start, end: s.end, text: result.text })
      }
    }
  }
  if (edits.length === 0) return warnings.length > 0 ? { code: source, warnings } : null

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
    if (removals.length > 0) code = applyEdits(code, removals)
  }
  return { code, warnings }
}

// ─── Collection ──────────────────────────────────────────────────────────────

function collectHooks(program: Node, source: string): Map<string, HookDef> {
  const out = new Map<string, HookDef>()
  for (const stmt of program.body as Node[]) {
    const decl = stmt.type === 'ExportNamedDeclaration' && stmt.declaration ? stmt.declaration : stmt
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
  const base = { name, declStart: stmt.start, declEnd: lineEnd(source, stmt.end) }
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

  const parts = statements.map((s) => rewrite(source, s.start, s.end, paramText, renames))
  if (tail) parts.push(tail + rewrite(source, arg.start, arg.end, paramText, renames))
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

/**
 * Classic → Plain Mode codemod (`migrateToPlain`).
 *
 * Converts classic reactivity code (`signal`/`computed`/`effect` from
 * `@pyreon/reactivity`) into the Plain Mode dialect (`state`/`derived`/
 * `effect` markers from `@pyreon/core/plain`) — the adoption lever for the
 * dialect, and one half of the round-trip oracle (fuzzed classic → codemod →
 * compile → behavioral diff against the direct classic compile; see
 * `runtime-dom/src/tests/plain-roundtrip-fuzz.test.tsx`).
 *
 * Per-BINDING convertibility, never per-file: a binding converts only when
 * EVERY reference to it is a shape the dialect can express —
 *
 *   const count = signal(0)   →  let count = state(0)
 *   count()                   →  count
 *   count.set(v)              →  count = v
 *   count.update(n => n + 1)  →  count = count + 1     (param substituted)
 *   count.peek()              →  untrack(() => count)
 *   const d = computed(fn)    →  const d = derived(fn)  (thunk form is legal)
 *   effect(fn)                →  effect(fn)             (the plain marker)
 *
 * Any other reference DECLINES the binding with a named reason (the
 * `--plain-readiness` histogram feeds on these): a signal passed as a VALUE
 * (`subscribe(count)`, `wrapSignal(count, …)`, `.direct`, `._v`), a `.set`
 * whose RESULT is used (classic `.set` returns void; an assignment
 * expression yields the value — converting would change semantics), a
 * complex `.update` callback.
 *
 * An OBJECT/ARRAY-literal signal converts to `state.raw(...)` — classic
 * signals are replace-the-value; bare `state({...})` would become DEEP state
 * (a store proxy) and silently change mutation semantics. The codemod never
 * changes semantics; opting into deep state is a human edit.
 *
 * Files already in the dialect return `{ alreadyPlain: true }` untouched.
 */
import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import { detectPlain } from './plain'

// oxc-parser's ESTree output is consumed untyped, matching plain.ts.
// oxlint-disable-next-line no-explicit-any
type N = any

const REACTIVITY_SOURCE = '@pyreon/reactivity'
const PLAIN_SOURCE = '@pyreon/core/plain'

/** Why a binding could not be converted — the readiness histogram's key. */
export type PlainDeclineCode =
  | 'signal-as-value'
  | 'set-result-used'
  | 'update-result-used'
  | 'mixed-declaration'
  | 'exported'
  | 'reassigned'

export interface PlainMigrateDeclined {
  /** Binding name (or `<file>` for file-level notes). */
  name: string
  code: PlainDeclineCode
  reason: string
  /** 1-based line of the offending reference. */
  line: number
  /** 0-based column. */
  column: number
}

export interface MigrateToPlainResult {
  /** Rewritten source, or null when nothing was converted. */
  code: string | null
  /** Names of bindings converted to the dialect. */
  converted: string[]
  /** Bindings (or file notes) that could not convert, each with a reason. */
  declined: PlainMigrateDeclined[]
  /** True when the file is already in the Plain Mode dialect. */
  alreadyPlain: boolean
}

type Role = 'signal' | 'computed' | 'effect'

interface Candidate {
  name: string
  role: 'signal' | 'computed'
  /** The VariableDeclaration statement node. */
  decl: N
  /** The single declarator. */
  declarator: N
  /** The `signal(...)` / `computed(...)` call. */
  call: N
  /** Object/array-literal initializer → `state.raw`. */
  literalObject: boolean
  declined: PlainMigrateDeclined | null
  /** Planned MagicString edits, applied only if the binding survives. */
  edits: Array<() => void>
  /** Some reference needs the signal itself → emits `signalOf(x)`. */
  usesSignalOf?: boolean
}

/** Every name the file BINDS in any scope (declarations, params, imports, catch). */
function collectAllBindingNames(program: N): Set<string> {
  const out = new Set<string>()
  const pattern = (p: N): void => {
    if (!p) return
    switch (p.type) {
      case 'Identifier':
        out.add(p.name)
        return
      case 'ObjectPattern':
        for (const prop of p.properties ?? []) pattern(prop.type === 'RestElement' ? prop.argument : prop.value)
        return
      case 'ArrayPattern':
        for (const el of p.elements ?? []) pattern(el)
        return
      case 'RestElement':
        pattern(p.argument)
        return
      case 'AssignmentPattern':
        pattern(p.left)
        return
      case 'TSParameterProperty':
        pattern(p.parameter)
        return
    }
  }
  const visit = (n: N): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (typeof n.type !== 'string') return
    switch (n.type) {
      case 'VariableDeclarator':
        pattern(n.id)
        break
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (n.id) pattern(n.id)
        for (const prm of n.params ?? []) pattern(prm)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (n.id) pattern(n.id)
        break
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        pattern(n.local)
        break
      case 'CatchClause':
        pattern(n.param)
        break
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      const v = n[key]
      if (v && typeof v === 'object') visit(v)
    }
  }
  visit(program)
  return out
}

export function migrateToPlain(code: string, filename = 'input.tsx'): MigrateToPlainResult {
  const empty: MigrateToPlainResult = { code: null, converted: [], declined: [], alreadyPlain: false }
  if (detectPlain(code)) return { ...empty, alreadyPlain: true }

  const lang = filename.endsWith('.tsx')
    ? 'tsx'
    : filename.endsWith('.ts')
      ? 'ts'
      : filename.endsWith('.jsx')
        ? 'jsx'
        : filename.endsWith('.js')
          ? 'js'
          : 'tsx'
  let program: N
  try {
    program = parseSync(filename, code, { sourceType: 'module', lang }).program
  } catch {
    return empty
  }

  // ── Imports: which local names are the reactivity primitives? ────────────
  let reactivityImport: N = null
  /** local name → role */
  const importedRoles = new Map<string, Role>()
  for (const stmt of program.body as N[]) {
    if (stmt.type !== 'ImportDeclaration') continue
    if (stmt.source?.value !== REACTIVITY_SOURCE || stmt.importKind === 'type') continue
    reactivityImport = stmt
    for (const spec of stmt.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier' || spec.importKind === 'type') continue
      const imported = spec.imported?.name
      if (imported === 'signal' || imported === 'computed' || imported === 'effect') {
        importedRoles.set(spec.local.name, imported)
      }
    }
  }
  if (importedRoles.size === 0) return empty

  const ms = new MagicString(code)
  const posOf = (offset: number): { line: number; column: number } => {
    let line = 1
    let lineStart = 0
    for (let i = 0; i < offset && i < code.length; i++) {
      if (code.charCodeAt(i) === 10) {
        line++
        lineStart = i + 1
      }
    }
    return { line, column: offset - lineStart }
  }

  // ── Scope-aware candidate + reference walk ────────────────────────────────
  // Each scope maps a name to its Candidate (convertible declaration) or to
  // null (a SHADOW — param, non-signal declaration, import, catch param).
  const scopes: Array<Map<string, Candidate | null>> = [new Map()]
  const candidates: Candidate[] = []
  const lookup = (name: string): Candidate | null => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i]!
      if (s.has(name)) return s.get(name)!
    }
    return null
  }
  const declineOf = (
    c: Candidate,
    codeName: PlainDeclineCode,
    reason: string,
    offset: number,
  ): void => {
    if (c.declined) return
    const { line, column } = posOf(offset)
    c.declined = { name: c.name, code: codeName, reason, line, column }
  }

  /** Whether `effect` (by local name) can move to the plain marker import. */
  const effectLocals = [...importedRoles.entries()].filter(([, r]) => r === 'effect').map(([n]) => n)
  let effectCallSeen = false
  let effectNonCallSeen = false

  let untrackNeeded = false
  /**
   * > 0 while walking an effect / computed callback. Classic `.update(fn)`
   * reads the value UNTRACKED (`fn(this._v)`), but a plain read inside a
   * tracked scope subscribes — so there the codemod emits the explicit
   * `untrack(() => x)` form instead of substituting a tracked read.
   */
  let trackedDepth = 0
  // ── Marker names ─────────────────────────────────────────────────────────
  // The injected `state` / `derived` / `signalOf` imports must not collide with
  // a binding the file already declares ANYWHERE (a local `const state =
  // useFormState(form)` is common). A colliding marker is imported under a
  // `plain*` alias — the pre-pass resolves markers by their LOCAL name.
  const bindingNames = collectAllBindingNames(program)
  const pickName = (base: string): string => {
    if (!bindingNames.has(base)) return base
    let alias = `plain${base[0]!.toUpperCase()}${base.slice(1)}`
    while (bindingNames.has(alias)) alias = `${alias}$`
    return alias
  }
  const markerName = { state: pickName('state'), derived: pickName('derived'), signalOf: pickName('signalOf') }
  const importSpec = (base: 'state' | 'derived' | 'signalOf'): string =>
    markerName[base] === base ? base : `${base} as ${markerName[base]}`
  /** TypeScript file — explicit type arguments are legal. */
  const isTs = lang === 'ts' || lang === 'tsx'
  /**
   * > 0 while walking call arguments / component JSX attributes. A generic
   * call nested in a context-sensitive position (an object literal with arrow
   * siblings, a generic component's props) is inferred from the CONTEXTUAL
   * return type, not its argument — `useSortable({ items: signalOf(items),
   * by: (it) => it.id })` types `it` as `unknown`. The explicit
   * `signalOf<typeof x>(x)` form pins the type in exactly those positions.
   */
  let inferenceContextDepth = 0
  /** The `export const …` declaration statement — ONLY its own declarators are exported. */
  let exportedDeclaration: N = null

  function collectPatternNames(pat: N, into: Set<string>): void {
    if (!pat) return
    switch (pat.type) {
      case 'Identifier':
        into.add(pat.name)
        break
      case 'ObjectPattern':
        for (const p of pat.properties ?? []) {
          if (p.type === 'RestElement') collectPatternNames(p.argument, into)
          else collectPatternNames(p.value ?? p.key, into)
        }
        break
      case 'ArrayPattern':
        for (const el of pat.elements ?? []) if (el) collectPatternNames(el, into)
        break
      case 'AssignmentPattern':
        collectPatternNames(pat.left, into)
        break
      case 'RestElement':
        collectPatternNames(pat.argument, into)
        break
    }
  }
  const shadowPattern = (pat: N): void => {
    const names = new Set<string>()
    collectPatternNames(pat, names)
    for (const n of names) scopes[scopes.length - 1]!.set(n, null)
    walkPatternDefaults(pat)
  }

  /**
   * DEFAULT VALUES inside binding patterns (`{ q = a() }`, `[x = a()]`,
   * `(p = a())`) are ordinary expressions — a candidate read inside one must
   * be classified/rewritten like any other, or the migrated file keeps a
   * stale `a()` call on a now-plain binding (a runtime crash).
   */
  function walkPatternDefaults(pat: N): void {
    if (!pat) return
    switch (pat.type) {
      case 'ObjectPattern':
        for (const p of pat.properties ?? []) {
          if (p.type === 'RestElement') walkPatternDefaults(p.argument)
          else {
            if (p.computed && p.key) walkExpr(p.key, true)
            walkPatternDefaults(p.value ?? p.key)
          }
        }
        return
      case 'ArrayPattern':
        for (const el of pat.elements ?? []) if (el) walkPatternDefaults(el)
        return
      case 'AssignmentPattern':
        walkPatternDefaults(pat.left)
        walkExpr(pat.right, true)
        return
      case 'RestElement':
        walkPatternDefaults(pat.argument)
        return
      default:
        return
    }
  }

  const unwrapTs = (n: N): N => {
    let cur = n
    while (
      cur &&
      (cur.type === 'ParenthesizedExpression' ||
        cur.type === 'TSAsExpression' ||
        cur.type === 'TSSatisfiesExpression' ||
        cur.type === 'TSNonNullExpression' ||
        cur.type === 'TSInstantiationExpression' ||
        cur.type === 'ChainExpression')
    ) {
      cur = cur.expression
    }
    return cur
  }

  /** `signal(...)` / `computed(...)` call whose callee is the live import? */
  const roleOfCall = (init: N): { role: Role; call: N } | null => {
    const call = init ? unwrapTs(init) : null
    if (call?.type !== 'CallExpression') return null
    const callee = call.callee
    if (callee?.type !== 'Identifier') return null
    const role = importedRoles.get(callee.name)
    if (!role) return null
    // The import name may be shadowed at this point by a closer binding.
    if (lookup(callee.name) !== null || shadowedNonCandidate(callee.name)) return null
    return { role, call }
  }
  /** True when `name` is shadowed by a NON-candidate scope entry. */
  function shadowedNonCandidate(name: string): boolean {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i]!
      if (s.has(name)) return true
    }
    return false
  }

  // ── Statement / expression walkers ────────────────────────────────────────

  function walkStmt(stmt: N): void {
    if (!stmt || typeof stmt.type !== 'string') return
    switch (stmt.type) {
      case 'VariableDeclaration':
        walkVariableDeclaration(stmt)
        return
      case 'ExpressionStatement': {
        // `x()` as a bare statement is the classic dependency-read idiom
        // (subscribe an effect to x). Its plain form is `void x` — a bare
        // `x;` means the same but reads as a mistake (and trips lint).
        const e = stmt.expression
        if (
          e?.type === 'CallExpression' &&
          e.callee?.type === 'Identifier' &&
          (e.arguments ?? []).length === 0 &&
          !e.optional
        ) {
          const c = lookup(e.callee.name)
          if (c) c.edits.push(() => ms.prependRight(e.start, 'void '))
        }
        walkExpr(stmt.expression, false)
        return
      }
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration': {
        // `export { count }` — exporting the BINDING is fine (plain state
        // exports are live via the vite-plugin registry); nothing to edit.
        // `export default <expr>` carries the EXPRESSION on `declaration`
        // (ESTree) — that is a VALUE use and must be classified, or a
        // signal exported by value would silently convert.
        const decl = stmt.declaration
        // `export { a, b as c }` — the binding keeps its SIGNAL type for every
        // importer (`a()` there); converting it would make those call sites
        // type errors in files this per-file codemod cannot see.
        if (stmt.type === 'ExportNamedDeclaration' && !stmt.source) {
          for (const spec of stmt.specifiers ?? []) {
            const local = spec.local?.name
            const c = local ? lookup(local) : null
            if (c) declineExported(c, spec.start)
          }
        }
        if (decl?.type === 'VariableDeclaration' && stmt.type === 'ExportNamedDeclaration') {
          exportedDeclaration = decl
          walkStmt(decl)
          return
        }
        if (decl) {
          if (
            decl.type === 'VariableDeclaration' ||
            decl.type === 'FunctionDeclaration' ||
            decl.type === 'ClassDeclaration'
          ) {
            walkStmt(decl)
          } else {
            walkExpr(decl, true)
          }
        }
        return
      }
      case 'FunctionDeclaration':
        if (stmt.id?.name) scopes[scopes.length - 1]!.set(stmt.id.name, null)
        walkFunction(stmt)
        return
      case 'ClassDeclaration':
        if (stmt.id?.name) scopes[scopes.length - 1]!.set(stmt.id.name, null)
        walkClass(stmt)
        return
      case 'ReturnStatement':
      case 'ThrowStatement':
        if (stmt.argument) walkExpr(stmt.argument, true)
        return
      case 'IfStatement':
        walkExpr(stmt.test, true)
        walkStmt(stmt.consequent)
        if (stmt.alternate) walkStmt(stmt.alternate)
        return
      case 'BlockStatement':
        scopes.push(new Map())
        for (const s of stmt.body ?? []) walkStmt(s)
        scopes.pop()
        return
      case 'ForStatement':
        scopes.push(new Map())
        if (stmt.init) {
          if (stmt.init.type === 'VariableDeclaration') walkVariableDeclaration(stmt.init)
          else walkExpr(stmt.init, false)
        }
        if (stmt.test) walkExpr(stmt.test, true)
        if (stmt.update) walkExpr(stmt.update, false)
        walkStmt(stmt.body)
        scopes.pop()
        return
      case 'ForOfStatement':
      case 'ForInStatement':
        scopes.push(new Map())
        if (stmt.left?.type === 'VariableDeclaration') {
          for (const d of stmt.left.declarations ?? []) shadowPattern(d.id)
        } else if (stmt.left) {
          walkExpr(stmt.left, false)
        }
        walkExpr(stmt.right, true)
        walkStmt(stmt.body)
        scopes.pop()
        return
      case 'WhileStatement':
      case 'DoWhileStatement':
        walkExpr(stmt.test, true)
        walkStmt(stmt.body)
        return
      case 'SwitchStatement':
        walkExpr(stmt.discriminant, true)
        scopes.push(new Map())
        for (const c of stmt.cases ?? []) {
          if (c.test) walkExpr(c.test, true)
          for (const s of c.consequent ?? []) walkStmt(s)
        }
        scopes.pop()
        return
      case 'TryStatement':
        walkStmt(stmt.block)
        if (stmt.handler) {
          scopes.push(new Map())
          if (stmt.handler.param) shadowPattern(stmt.handler.param)
          walkStmt(stmt.handler.body)
          scopes.pop()
        }
        if (stmt.finalizer) walkStmt(stmt.finalizer)
        return
      case 'LabeledStatement':
        walkStmt(stmt.body)
        return
      default:
        return
    }
  }

  function walkFunction(fn: N): void {
    scopes.push(new Map())
    for (const p of fn.params ?? []) shadowPattern(p)
    if (fn.body?.type === 'BlockStatement') {
      for (const s of fn.body.body ?? []) walkStmt(s)
    } else if (fn.body) {
      const setter = voidWriteBody(fn.body)
      if (setter) {
        // `() => x.set(v)` — the arrow RETURNS `.set`'s void result. A plain
        // `x = v` would return `v`, so wrap the body in a block: `() => { x = v }`
        // returns undefined exactly like the classic form. The brace edit rides
        // on the candidate, so a declined binding keeps its original text.
        walkExpr(fn.body, false)
        const body = fn.body
        setter.edits.push(() => {
          ms.prependRight(body.start, '{ ')
          ms.appendLeft(body.end, ' }')
        })
      } else {
        walkExpr(fn.body, true)
      }
    }
    scopes.pop()
  }

  /**
   * An expression arrow body that is exactly a `.set(v)` / `.update(fn)` call on
   * a candidate — its value only ever flows to the arrow's return, which the
   * block-wrap rewrite preserves as `undefined`.
   */
  function voidWriteBody(body: N): Candidate | null {
    if (body?.type !== 'CallExpression' || body.optional) return null
    const mem = body.callee
    if (mem?.type !== 'MemberExpression' || mem.computed || mem.object?.type !== 'Identifier') return null
    const method = mem.property?.name
    if ((method !== 'set' && method !== 'update') || (body.arguments ?? []).length !== 1) return null
    return lookup(mem.object.name) ?? null
  }

  function walkClass(cls: N): void {
    if (cls.superClass) walkExpr(cls.superClass, true)
    for (const el of cls.body?.body ?? []) {
      if (el.computed && el.key) walkExpr(el.key, true)
      if (el.value) {
        if (el.type === 'MethodDefinition') walkFunction(el.value)
        else walkExpr(el.value, true)
      }
    }
  }

  function walkVariableDeclaration(stmt: N): void {
    const decls: N[] = stmt.declarations ?? []
    for (const d of decls) {
      const found = d.init ? roleOfCall(d.init) : null
      if (found && (found.role === 'signal' || found.role === 'computed') && d.id?.type === 'Identifier') {
        if (decls.length > 1) {
          // Mixed multi-declarator statements complicate the `const`→`let`
          // kind rewrite — decline, rare shape.
          const { line, column } = posOf(d.id.start)
          const c: Candidate = {
            name: d.id.name,
            role: found.role,
            decl: stmt,
            declarator: d,
            call: found.call,
            literalObject: false,
            declined: {
              name: d.id.name,
              code: 'mixed-declaration',
              reason: 'declared in a multi-declarator statement — split the declaration first',
              line,
              column,
            },
            edits: [],
          }
          candidates.push(c)
          scopes[scopes.length - 1]!.set(d.id.name, c)
          walkExpr(d.init, true)
          continue
        }
        const firstArg = found.call.arguments?.[0] ? unwrapTs(found.call.arguments[0]) : null
        const c: Candidate = {
          name: d.id.name,
          role: found.role,
          decl: stmt,
          declarator: d,
          call: found.call,
          literalObject:
            found.role === 'signal' &&
            (firstArg?.type === 'ObjectExpression' || firstArg?.type === 'ArrayExpression'),
          declined: null,
          edits: [],
        }
        candidates.push(c)
        scopes[scopes.length - 1]!.set(d.id.name, c)
        if (stmt === exportedDeclaration) declineExported(c, d.id.start)
        // Walk the ARGUMENTS (they may reference earlier candidates). A
        // computed's callback is a TRACKED scope — see `trackedDepth`.
        if (found.role === 'computed') trackedDepth++
        for (const a of found.call.arguments ?? []) walkExpr(a, true)
        if (found.role === 'computed') trackedDepth--
        continue
      }
      shadowPattern(d.id)
      if (d.init) walkExpr(d.init, true)
    }
  }

  function walkExpr(node: N, valueUsed: boolean): void {
    if (!node || typeof node.type !== 'string') return
    switch (node.type) {
      case 'Identifier': {
        const c = lookup(node.name)
        if (c) identityUse(c, node, null)
        return
      }
      case 'Literal':
      case 'ThisExpression':
      case 'Super':
      case 'MetaProperty':
      case 'PrivateIdentifier':
      case 'JSXEmptyExpression':
      case 'JSXText':
        return
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSInstantiationExpression':
      case 'ChainExpression':
        walkExpr(node.expression, valueUsed)
        return
      case 'TemplateLiteral':
        for (const e of node.expressions ?? []) walkExpr(e, true)
        return
      case 'TaggedTemplateExpression':
        walkExpr(node.tag, true)
        walkExpr(node.quasi, true)
        return
      case 'ArrayExpression':
        for (const el of node.elements ?? []) if (el) walkExpr(el, true)
        return
      case 'SpreadElement':
        walkExpr(node.argument, true)
        return
      case 'ObjectExpression':
        for (const p of node.properties ?? []) {
          if (p.type === 'SpreadElement') {
            walkExpr(p.argument, true)
            continue
          }
          if (p.computed && p.key) walkExpr(p.key, true)
          if (p.shorthand && p.value?.type === 'Identifier') {
            // `{ ready }` stores the SIGNAL — expand to `ready: signalOf(ready)`.
            const c = lookup(p.value.name)
            if (c) {
              identityUse(c, p.value, p.value.name)
              continue
            }
          }
          if (p.value) walkExpr(p.value, true)
        }
        return
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        walkFunction(node)
        return
      case 'ClassExpression':
        walkClass(node)
        return
      case 'CallExpression':
        handleCall(node, valueUsed)
        return
      case 'NewExpression':
        walkExpr(node.callee, true)
        walkArgs(node.arguments)
        return
      case 'MemberExpression':
        handleMember(node)
        return
      case 'AssignmentExpression': {
        const left = node.left
        if (left?.type === 'Identifier') {
          const c = lookup(left.name)
          if (c) {
            declineOf(
              c,
              'reassigned',
              `\`${left.name}\` is reassigned — the binding does not hold the signal for its whole lifetime`,
              left.start,
            )
          }
        } else if (left) {
          walkExpr(left, false)
        }
        walkExpr(node.right, true)
        return
      }
      case 'UpdateExpression':
      case 'UnaryExpression':
      case 'AwaitExpression':
      case 'YieldExpression':
        if (node.argument) walkExpr(node.argument, true)
        return
      case 'BinaryExpression':
      case 'LogicalExpression':
        walkExpr(node.left, true)
        walkExpr(node.right, true)
        return
      case 'ConditionalExpression':
        walkExpr(node.test, true)
        walkExpr(node.consequent, true)
        walkExpr(node.alternate, true)
        return
      case 'SequenceExpression': {
        const exprs: N[] = node.expressions ?? []
        for (let i = 0; i < exprs.length; i++) walkExpr(exprs[i], valueUsed && i === exprs.length - 1)
        return
      }
      case 'ImportExpression':
        walkExpr(node.source, true)
        return
      case 'JSXElement': {
        walkJsxElement(node)
        return
      }
      case 'JSXFragment':
        for (const child of node.children ?? []) walkJsxChild(child)
        return
      case 'JSXExpressionContainer':
        walkExpr(node.expression, true)
        return
      default: {
        // Conservative fallback: walk plausible child nodes so no reference
        // is missed (a MISSED reference could silently convert a binding
        // whose remaining use-shape is unconvertible).
        for (const key of Object.keys(node)) {
          if (key === 'typeAnnotation' || key === 'typeParameters' || key === 'returnType') continue
          const v = node[key]
          if (Array.isArray(v)) for (const child of v) walkExpr(child, true)
          else if (v && typeof v === 'object' && typeof v.type === 'string') walkExpr(v, true)
        }
        return
      }
    }
  }

  function isComponentTag(name: N): boolean {
    if (!name) return false
    if (name.type === 'JSXMemberExpression') return true
    return name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name ?? '')
  }
  function walkJsxElement(node: N): void {
    for (const attr of node.openingElement?.attributes ?? []) {
      if (attr.type === 'JSXSpreadAttribute') {
        walkExpr(attr.argument, true)
        continue
      }
      if (!attr.value) continue
      if (attr.value.type === 'JSXExpressionContainer') {
        if (isComponentTag(node.openingElement?.name)) {
          // A COMPONENT prop receives the signal itself in classic code (the
          // compiler then auto-calls it). Its declared type may be an accessor
          // (`when: () => boolean`), so keep identity with signalOf — runtime
          // identical, and exactly the classic type.
          const inner = unwrapTs(attr.value.expression)
          const c = inner?.type === 'Identifier' ? lookup(inner.name) : null
          inferenceContextDepth++
          if (c) identityUse(c, inner, null)
          else walkExpr(attr.value.expression, true)
          inferenceContextDepth--
        } else {
          walkJsxSlot(attr.value.expression)
        }
      }
      else if (attr.value.type === 'JSXElement' || attr.value.type === 'JSXFragment')
        walkExpr(attr.value, true)
    }
    for (const child of node.children ?? []) walkJsxChild(child)
  }
  function walkJsxChild(child: N): void {
    if (!child) return
    if (child.type === 'JSXExpressionContainer') walkJsxSlot(child.expression)
    else if (child.type === 'JSXElement' || child.type === 'JSXFragment') walkExpr(child, true)
  }
  /**
   * A bare signal in a JSX slot (`value={email}`, `{count}`) is ALREADY a read
   * in classic code: the compiler auto-calls a known signal in component props
   * and children, and a DOM attr/child treats the callable as a reactive
   * accessor. The plain read `email` compiles to the same live binding, so the
   * text stays as-is — no `signalOf` needed.
   */
  function walkJsxSlot(expr: N): void {
    const inner = unwrapTs(expr)
    if (inner?.type === 'Identifier' && lookup(inner.name)) return
    walkExpr(expr, true)
  }
  /**
   * A reference that needs the signal ITSELF (passed to a function, stored,
   * returned). Classic code hands over the signal object; the plain form
   * `signalOf(x)` compiles back to exactly that bare reference.
   */
  function identityUse(c: Candidate, node: N, shorthandKey: string | null): void {
    c.usesSignalOf = true
    const typeArg = isTs && inferenceContextDepth > 0 ? `<typeof ${node.name}>` : ''
    const open = `${markerName.signalOf}${typeArg}(`
    c.edits.push(() => {
      if (shorthandKey !== null) {
        ms.appendLeft(node.end, `: ${open}${node.name})`)
      } else {
        ms.prependRight(node.start, open)
        ms.appendLeft(node.end, ')')
      }
    })
  }
  function declineExported(c: Candidate, at: number): void {
    declineOf(
      c,
      'exported',
      `\`${c.name}\` is exported — importers read it as a signal (\`${c.name}()\`); converting it would break their types. Migrate it together with its importers, or keep it classic`,
      at,
    )
  }
  function walkArgs(args: N[] | undefined): void {
    inferenceContextDepth++
    for (const a of args ?? []) walkExpr(a, true)
    inferenceContextDepth--
  }

  /** `X()` read / `effect(fn)` / ordinary call. */
  function handleCall(node: N, valueUsed: boolean): void {
    const callee = node.callee
    if (callee?.type === 'Identifier') {
      const c = lookup(callee.name)
      if (c) {
        if ((node.arguments ?? []).length === 0 && !node.optional) {
          // `count()` → `count`
          c.edits.push(() => ms.remove(callee.end, node.end))
          return
        }
        declineOf(
          c,
          'signal-as-value',
          `\`${callee.name}\` is called with arguments — not a plain read`,
          node.start,
        )
        walkArgs(node.arguments)
        return
      }
      // `effect(fn)` from the reactivity import → the plain marker keeps the
      // same name; only the IMPORT moves. Nested reads still need walking.
      if (effectLocals.includes(callee.name) && !shadowedNonCandidate(callee.name)) {
        effectCallSeen = true
        trackedDepth++
        walkArgs(node.arguments)
        trackedDepth--
        return
      }
      walkExpr(callee, true)
      walkArgs(node.arguments)
      return
    }
    // Member calls on candidates: .set / .update / .peek
    const mem = callee?.type === 'MemberExpression' ? callee : null
    const obj = mem?.object
    if (mem && !mem.computed && obj?.type === 'Identifier') {
      const c = lookup(obj.name)
      if (c) {
        const method = mem.property?.name
        const args: N[] = node.arguments ?? []
        if (method === 'set' && args.length === 1) {
          if (valueUsed) {
            declineOf(
              c,
              'set-result-used',
              `the result of \`${obj.name}.set(…)\` is used — classic .set returns void, a plain assignment yields the value`,
              node.start,
            )
          } else {
            // `x.set(v)` → `x = v`
            c.edits.push(() => {
              ms.overwrite(obj.end, args[0].start, ' = ')
              ms.remove(args[0].end, node.end)
            })
          }
          walkExpr(args[0], true)
          return
        }
        if (method === 'peek' && args.length === 0) {
          // `x.peek()` → `untrack(() => x)` — inside the untrack callback a
          // plain mention is a read, exactly the peek semantics.
          untrackNeeded = true
          c.edits.push(() => {
            ms.overwrite(node.start, node.end, `untrack(() => ${obj.name})`)
          })
          return
        }
        if (method === 'update' && args.length === 1) {
          if (valueUsed) {
            declineOf(
              c,
              'update-result-used',
              `the result of \`${obj.name}.update(…)\` is used`,
              node.start,
            )
            walkExpr(args[0], true)
            return
          }
          const fn = unwrapTs(args[0])
          const sub = trackedDepth === 0 ? updateSubstitution(c, obj.name, fn) : null
          if (sub === null) {
            // General exact form: apply the callback to the UNTRACKED current
            // value — byte-for-byte the classic `_update` semantics, for any
            // callback shape (destructured params, block bodies, a reference).
            untrackNeeded = true
            const fnStart = args[0].start
            const fnEnd = args[0].end
            c.edits.push(() => {
              ms.overwrite(node.start, fnStart, `${obj.name} = (`)
              ms.overwrite(fnEnd, node.end, `)(untrack(() => ${obj.name}))`)
            })
            walkExpr(args[0], true)
            return
          }
          const body = fn.body
          c.edits.push(() => {
            ms.overwrite(node.start, body.start, `${obj.name} = `)
            for (const ref of sub) ms.overwrite(ref.start, ref.end, obj.name)
            ms.remove(body.end, node.end)
          })
          // The callback BODY's other references still need classification —
          // and their edits now land in the kept body text.
          walkExpr(body, true)
          return
        }
        // Any other signal API (`.subscribe`, `.direct`, `.label`, …) runs on
        // the signal itself: `signalOf(x).subscribe(…)` compiles back to it.
        identityUse(c, obj, null)
        walkArgs(args)
        return
      }
    }
    walkExpr(callee, true)
    walkArgs(node.arguments)
  }

  /**
   * `x.update(n => n + 1)` → the substituted expression `x + 1`, or null when
   * the callback is not a single-identifier-param expression-body arrow whose
   * param is used without shadowing.
   */
  /**
   * `x.update(n => n + 1)` → the param references to rename (the caller turns
   * the call into `x = <body>` with GRANULAR edits, so rewrites of OTHER
   * candidates inside the body survive), or null when the callback is not a
   * single-identifier-param expression-body arrow whose param can be renamed
   * in place (nested scopes, or a shorthand `{ n }` whose key would change).
   */
  function updateSubstitution(c: Candidate, name: string, fn: N): N[] | null {
    if (fn?.type !== 'ArrowFunctionExpression') return null
    if ((fn.params ?? []).length !== 1) return null
    const param = fn.params[0]
    if (param?.type !== 'Identifier') return null
    if (fn.body?.type === 'BlockStatement') return null
    // Any nested function/declaration inside the body could shadow — bail on
    // anything that declares scope.
    let complex = false
    const paramRefs: N[] = []
    const visit = (n: N): void => {
      if (complex || !n || typeof n !== 'object') return
      if (Array.isArray(n)) {
        for (const child of n) visit(child)
        return
      }
      if (typeof n.type !== 'string') return
      if (
        n.type === 'ArrowFunctionExpression' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ClassExpression'
      ) {
        complex = true
        return
      }
      if (n.type === 'Property' && n.shorthand && n.value?.type === 'Identifier' && n.value.name === param.name) {
        complex = true
        return
      }
      if (n.type === 'Identifier' && n.name === param.name) paramRefs.push(n)
      for (const key of Object.keys(n)) {
        if (key === 'typeAnnotation' || key === 'typeParameters' || key === 'returnType') continue
        const v = n[key]
        if (v && typeof v === 'object') visit(v)
      }
    }
    visit(fn.body)
    if (complex) return null
    void c
    void name
    return paramRefs
  }

  /** Bare member access on a candidate (not a call) — no plain form. */
  function handleMember(node: N): void {
    const obj = node.object
    if (!node.computed && obj?.type === 'Identifier') {
      const c = lookup(obj.name)
      if (c) {
        identityUse(c, obj, null)
        if (node.computed && node.property) walkExpr(node.property, true)
        return
      }
    }
    walkExpr(node.object, true)
    if (node.computed && node.property) walkExpr(node.property, true)
  }

  // Track non-call references to the effect import (blocks the import move).
  const walkEffectRefs = (): void => {
    // A second cheap scan: any Identifier equal to an effect local that is
    // NOT the callee of a direct call blocks moving `effect` to the plain
    // import (both imports would collide on the name).
    if (effectLocals.length === 0) return
    const re = new RegExp(`\\b(?:${effectLocals.join('|')})\\b`, 'g')
    let m: RegExpExecArray | null
    let calls = 0
    let mentions = 0
    while ((m = re.exec(code)) !== null) {
      mentions++
      const after = code.slice(m.index + m[0].length).match(/^\s*\(/)
      if (after) calls++
    }
    // one mention is the import specifier itself
    if (mentions - 1 > calls) effectNonCallSeen = true
  }

  for (const stmt of program.body as N[]) walkStmt(stmt)
  walkEffectRefs()

  // ── Apply ─────────────────────────────────────────────────────────────────
  const survivors = candidates.filter((c) => !c.declined)
  const declined = candidates.filter((c) => c.declined).map((c) => c.declined!)
  const importRewritable =
    !reactivityImport ||
    (reactivityImport.specifiers ?? []).every((s: N) => s.type === 'ImportSpecifier')
  const moveEffect = effectCallSeen && !effectNonCallSeen && importRewritable
  if (survivors.length === 0 && !moveEffect) {
    return { code: null, converted: [], declined, alreadyPlain: false }
  }

  let usesState = false
  let usesRaw = false
  let usesDerived = false
  for (const c of survivors) {
    // Declaration: callee rename + kind rewrite.
    const callee = c.call.callee
    if (c.role === 'signal') {
      if (c.literalObject) {
        // Classic signals REPLACE the value — `state.raw` preserves that;
        // bare `state({…})` would opt into deep-store mutation semantics.
        usesRaw = true
        ms.overwrite(callee.start, callee.end, `${markerName.state}.raw`)
      } else {
        usesState = true
        ms.overwrite(callee.start, callee.end, markerName.state)
      }
      if (c.decl.kind !== 'let') {
        ms.overwrite(c.decl.start, c.decl.start + c.decl.kind.length, 'let')
      }
    } else {
      usesDerived = true
      ms.overwrite(callee.start, callee.end, markerName.derived)
    }
    for (const apply of c.edits) apply()
  }

  // ── Imports ───────────────────────────────────────────────────────────────
  // Remove converted names from the reactivity import; add the plain import.
  const plainNames: string[] = []
  if (usesState || usesRaw) plainNames.push(importSpec('state'))
  if (usesDerived) plainNames.push(importSpec('derived'))
  if (moveEffect) plainNames.push('effect')
  if (survivors.some((c) => c.usesSignalOf)) plainNames.push(importSpec('signalOf'))

  let reactivityImportRemoved = false
  if (reactivityImport && importRewritable) {
    const keep: string[] = []
    for (const spec of reactivityImport.specifiers ?? []) {
      const imported = spec.imported?.name ?? spec.local?.name
      const local = spec.local?.name
      const importedRole = importedRoles.get(local)
      let drop = false
      if (importedRole === 'signal') {
        // Drop only when NO unconverted signal usage remains.
        drop = !candidates.some((c) => c.role === 'signal' && c.declined) && usesOnlyConverted('signal')
      } else if (importedRole === 'computed') {
        drop = !candidates.some((c) => c.role === 'computed' && c.declined) && usesOnlyConverted('computed')
      } else if (importedRole === 'effect') {
        drop = moveEffect
      }
      if (!drop) {
        const text = spec.local.name === imported ? imported : `${imported} as ${local}`
        keep.push(spec.importKind === 'type' ? `type ${text}` : text)
      }
    }
    if (untrackNeeded && !keep.includes('untrack')) keep.push('untrack')
    if (keep.length > 0) {
      const specStart = reactivityImport.specifiers[0].start
      const specEnd = reactivityImport.specifiers[reactivityImport.specifiers.length - 1].end
      ms.overwrite(specStart, specEnd, keep.join(', '))
    } else {
      ms.remove(reactivityImport.start, reactivityImport.end)
      reactivityImportRemoved = true
    }
  }

  /** Every use of the primitive's NAME was one of the converted declarations? */
  function usesOnlyConverted(role: Role): boolean {
    // Count REAL identifier references to the primitive (outside the import
    // itself) against the converted declarations. A textual scan counted the
    // word in comments and strings, kept the import, and left it unused.
    // Any other reference (a helper calling signal(), a shadowing local) keeps
    // it — conservative by construction.
    const locals = new Set([...importedRoles.entries()].filter(([, r]) => r === role).map(([n]) => n))
    if (locals.size === 0) return true
    let refs = 0
    const visit = (n: N): void => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) {
        for (const c of n) visit(c)
        return
      }
      if (typeof n.type !== 'string' || n.type === 'ImportDeclaration') return
      if (n.type === 'Identifier' && locals.has(n.name)) refs++
      for (const key of Object.keys(n)) {
        if (key === 'type' || key === 'start' || key === 'end') continue
        // NAME positions are not references: `{ signal: x }`, `a.signal`,
        // class member keys. (A shorthand `{ signal }` IS a reference — its
        // value node is visited.)
        if (key === 'key' && !n.computed && (n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition')) continue
        if (key === 'property' && !n.computed && n.type === 'MemberExpression') continue
        const v = n[key]
        if (v && typeof v === 'object') visit(v)
      }
    }
    visit(program)
    return refs <= survivors.filter((c) => c.role === role).length
  }

  if (plainNames.length > 0) {
    const importText = `import { ${plainNames.join(', ')} } from '${PLAIN_SOURCE}'`
    if (reactivityImportRemoved) {
      // Take the removed import's place — no blank line left behind.
      ms.appendLeft(reactivityImport.start, importText)
    } else {
      const anchor = reactivityImport ?? program.body[0]
      ms.appendLeft(anchor ? anchor.start : 0, `${importText}\n`)
    }
  }

  return {
    code: ms.toString(),
    converted: survivors.map((c) => c.name),
    declined,
    alreadyPlain: false,
  }
}

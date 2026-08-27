/**
 * Plain Mode — a compile-time dialect where reactive code reads like plain
 * JavaScript. This pre-pass runs BEFORE the JSX transform (both backends) and
 * emits ordinary classic-Pyreon code, so the rest of the pipeline — template
 * lowering, SSR compile-to-string, hydration planning, the native backend —
 * needs zero awareness of it.
 *
 * Activation: a module either carries the `'use plain'` directive or imports
 * from `@pyreon/core/plain`. Everything else returns `null` (byte-untouched).
 *
 * What it rewrites (see each section below):
 *
 *   1. `let count = state(0)`   → `const count = signal(0)`   (+ injected import)
 *   2. every READ of a state/derived binding → a tracked call: `count` → `count()`
 *   3. every WRITE → `.set(...)`: `count = v` → `count.set(v)`,
 *      `count += v` → `count.set(count() + (v))`, `count++` → `count.set(count() + 1)`
 *   4. `const d = derived(expr)` → `const d = computed(() => (expr))`
 *   5. `effect(fn)` → reactivity `effect(fn)` with TOTAL tracking: state the
 *      callback mentions only conditionally (a branch, after an `await`, inside
 *      a nested function) is subscribed via a hoisted prologue read, so a
 *      branch flip or a post-await read can never silently lose its subscription.
 *   6. component props destructuring — `function C({ name })` → `(props)` with
 *      body reads rewritten to `props.name`, preserving reactivity through the
 *      existing `_rp` machinery. Also `const { name } = props` in a component body.
 *   7. a component-body `if (<reactive>) return <jsx>` early return wraps the
 *      statement tail in `return () => { ... }` so the branch re-evaluates.
 *
 * Three laws govern the dialect (documented in the RFC):
 *   - a read is a read: mentioning a binding yields its VALUE, everywhere.
 *   - liveness comes from position: JSX/effect/derived positions re-run;
 *     plain statement positions are snapshots.
 *   - arguments are values; module exports are live (the export carries the
 *     signal — importers go through the vite-plugin's signal-export registry).
 *
 * Deliberately OUT of scope (each returns an explicit warning, never a silent
 * wrong answer): deep mutation of state objects (`obj.k = v` does not notify —
 * replace the object), destructuring assignment onto state, rest/nested props
 * patterns, `for (x of …)` heads writing state.
 */
import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import type { CompilerWarning } from './jsx'

// oxc-parser's ESTree output is consumed untyped, matching jsx.ts.
// oxlint-disable-next-line no-explicit-any
type N = any

export interface PlainTransformResult {
  code: string
  warnings: CompilerWarning[]
}

export interface PlainOptions {
  /**
   * Binding names known to hold signals imported from OTHER modules (the
   * vite-plugin's cross-module signal-export registry). Their reads are
   * rewritten to calls; assigning to one is a warning (ESM forbids assigning
   * to imports anyway — write through an exported function instead).
   */
  knownSignals?: string[] | undefined
}

const PLAIN_SOURCE = '@pyreon/core/plain'
const REACTIVITY_SOURCE = '@pyreon/reactivity'

/**
 * Cheap pre-parse gate — callers use it to skip the parse entirely.
 *
 * Pure substring checks, deliberately NOT a regex: the gate runs on every
 * module the vite-plugin sees, and an anchored directive regex here was
 * flagged by CodeQL as polynomial-backtracking (`js/polynomial-redos` — the
 * `[\n\r;{]`/`\s*` ambiguity). Over-matching is fine by design — a file
 * that merely CONTAINS the quoted token gets parsed, and the parser's real
 * directive check decides; `transformPlain` returns null for false alarms.
 */
export function detectPlain(code: string): boolean {
  if (code.includes(PLAIN_SOURCE)) return true
  return code.includes("'use plain'") || code.includes('"use plain"')
}

function getLang(filename: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (filename.endsWith('.tsx')) return 'tsx'
  if (filename.endsWith('.ts') || filename.endsWith('.mts') || filename.endsWith('.cts')) return 'ts'
  if (filename.endsWith('.jsx') || filename.endsWith('.pyreon')) return 'jsx'
  if (filename.endsWith('.js') || filename.endsWith('.mjs') || filename.endsWith('.cjs')) return 'js'
  return 'tsx'
}

type BindingKind =
  | { kind: 'state' }
  | { kind: 'derived' }
  | { kind: 'imported-state' }
  | { kind: 'shadow' }
  | { kind: 'prop'; propsVar: string; key: string; defaultText: string | null }

interface TrackFrame {
  /** Bindings read at least once unconditionally (sync, top level, pre-await). */
  unconditional: Set<string>
  /** Bindings read only under a condition / nested fn / after an await. */
  conditional: Set<string>
  /** Function nesting depth at which the frame was opened. */
  funcDepth: number
  /** Offset where the prologue is inserted (after the callback body's `{`),
   *  or null for an expression-bodied arrow (wrapped instead). */
  prologueAt: number | null
  exprBody: { start: number; end: number } | null
}

export function transformPlain(
  code: string,
  filename = 'input.tsx',
  options: PlainOptions = {},
): PlainTransformResult | null {
  if (!detectPlain(code)) return null

  let program: N
  try {
    program = parseSync(filename, code, { sourceType: 'module', lang: getLang(filename) }).program
  } catch {
    return null // downstream transform reports the parse error
  }

  // ── Module-level scan: directive, marker imports, existing reactivity import ──
  let hasDirective = false
  /** local name → marker role */
  const markers = new Map<string, 'state' | 'derived' | 'effect'>()
  const stripRanges: Array<{ start: number; end: number }> = []
  let reactivityImport: N = null
  const reactivityImported = new Set<string>()

  for (const stmt of program.body as N[]) {
    if (stmt.type === 'ExpressionStatement' && stmt.directive === 'use plain') {
      hasDirective = true
      stripRanges.push({ start: stmt.start, end: stmt.end })
      continue
    }
    if (stmt.type !== 'ImportDeclaration') continue
    const source = stmt.source?.value
    if (source === PLAIN_SOURCE) {
      for (const spec of stmt.specifiers ?? []) {
        if (spec.type !== 'ImportSpecifier') continue
        const imported = spec.imported?.name
        if (imported === 'state' || imported === 'derived' || imported === 'effect') {
          markers.set(spec.local.name, imported)
        }
      }
      stripRanges.push({ start: stmt.start, end: stmt.end })
    } else if (source === REACTIVITY_SOURCE && stmt.importKind !== 'type') {
      reactivityImport = stmt
      for (const spec of stmt.specifiers ?? []) {
        if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') {
          reactivityImported.add(spec.imported?.name)
        }
      }
    }
  }

  if (!hasDirective && markers.size === 0) return null

  const ms = new MagicString(code)
  const warnings: CompilerWarning[] = []
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
  const warn = (offset: number, message: string): void => {
    const { line, column } = posOf(offset)
    warnings.push({ message: `[plain] ${message}`, line, column, code: 'plain-mode' })
  }

  // ── Emit-name selection ────────────────────────────────────────────────────
  // Emitted classic code calls `signal` / `computed` / `effect` by name so the
  // downstream transform's `isSignalCall` tracking sees the canonical shape.
  // A module-scope user binding with the same name (that is NOT the reactivity
  // import) forces an alias.
  const moduleScopeNames = new Set<string>()
  for (const stmt of program.body as N[]) {
    collectDeclaredNames(stmt, moduleScopeNames)
  }
  const emitNames = { state: 'signal', derived: 'computed', effect: 'effect' }
  if (moduleScopeNames.has('signal') && !reactivityImported.has('signal')) {
    emitNames.state = '__plainSignal'
  }
  if (moduleScopeNames.has('computed') && !reactivityImported.has('computed')) {
    emitNames.derived = '__plainComputed'
  }
  // `effect` imported from the plain source is stripped, freeing the name —
  // only a NON-marker `effect` binding collides.
  if (moduleScopeNames.has('effect') && !markers.has('effect') && !reactivityImported.has('effect')) {
    emitNames.effect = '__plainEffect'
  }
  const used = { state: false, derived: false, effect: false }

  // ── Scope stack ────────────────────────────────────────────────────────────
  const scopes: Array<Map<string, BindingKind>> = [new Map()]
  for (const name of options.knownSignals ?? []) {
    scopes[0]!.set(name, { kind: 'imported-state' })
  }
  const lookup = (name: string): BindingKind | null => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const b = scopes[i]!.get(name)
      if (b) return b
    }
    return null
  }
  const declare = (name: string, b: BindingKind): void => {
    scopes[scopes.length - 1]!.set(name, b)
  }
  const isMarker = (name: string): 'state' | 'derived' | 'effect' | null => {
    if (!markers.has(name)) return null
    if (lookup(name)) return null // shadowed by a closer binding
    return markers.get(name)!
  }

  // ── Total-tracking frames (effect/derived callbacks) ──────────────────────
  const trackStack: TrackFrame[] = []
  let funcDepth = 0
  let condDepth = 0
  let awaitSeen = 0 // count of awaits crossed within the innermost frame

  const recordRead = (name: string): void => {
    const frame = trackStack[trackStack.length - 1]
    if (!frame) return
    const unconditional = funcDepth === frame.funcDepth && condDepth === 0 && awaitSeen === 0
    if (unconditional) frame.unconditional.add(name)
    else frame.conditional.add(name)
  }

  /** Rewrite a READ of a tracked binding at an Identifier node. */
  const rewriteRead = (node: N): void => {
    const b = lookup(node.name)
    if (!b) return
    if (b.kind === 'state' || b.kind === 'derived' || b.kind === 'imported-state') {
      ms.appendLeft(node.end, '()')
      recordRead(node.name)
    } else if (b.kind === 'prop') {
      const access = `${b.propsVar}.${b.key}`
      ms.overwrite(node.start, node.end, b.defaultText !== null ? `(${access} ?? ${b.defaultText})` : access)
      recordRead(node.name)
    }
  }

  // ── Walker ────────────────────────────────────────────────────────────────

  /** Names declared by a statement (module-scope collision scan + hoisting). */
  function collectDeclaredNames(stmt: N, into: Set<string>): void {
    if (!stmt) return
    switch (stmt.type) {
      case 'VariableDeclaration':
        for (const d of stmt.declarations ?? []) collectPatternNames(d.id, into)
        break
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (stmt.id?.name) into.add(stmt.id.name)
        break
      case 'ImportDeclaration':
        for (const spec of stmt.specifiers ?? []) into.add(spec.local?.name)
        break
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        if (stmt.declaration) collectDeclaredNames(stmt.declaration, into)
        break
    }
  }

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

  /** Hoisted names (`var`, function declarations) for a function body. */
  function hoistScan(body: N, into: Set<string>): void {
    const stmts = body?.body
    if (!Array.isArray(stmts)) return
    const visit = (s: N): void => {
      if (!s || typeof s.type !== 'string') return
      if (s.type === 'FunctionDeclaration') {
        if (s.id?.name) into.add(s.id.name)
        return // do not descend into nested functions
      }
      if (s.type === 'VariableDeclaration' && s.kind === 'var') {
        for (const d of s.declarations ?? []) collectPatternNames(d.id, into)
      }
      // Recurse into nested statement containers (blocks, if, loops, try).
      for (const key of ['body', 'consequent', 'alternate', 'block', 'handler', 'finalizer', 'cases']) {
        const child = s[key]
        if (Array.isArray(child)) for (const c of child) visit(c)
        else if (child && typeof child.type === 'string') visit(child)
      }
      if (s.type === 'SwitchCase') for (const c of s.consequent ?? []) visit(c)
    }
    for (const s of stmts) visit(s)
  }

  /** Does any declaration ANYWHERE inside `node` (nested functions included)
   *  bind `name`? Used to pick a collision-free props variable. */
  function declaresNameDeep(node: N, name: string): boolean {
    let found = false
    const visit = (n: N): void => {
      if (found || !n || typeof n !== 'object') return
      if (Array.isArray(n)) {
        for (const c of n) visit(c)
        return
      }
      if (typeof n.type !== 'string') return
      if (n.type === 'VariableDeclaration') {
        const names = new Set<string>()
        for (const d of n.declarations ?? []) collectPatternNames(d.id, names)
        if (names.has(name)) {
          found = true
          return
        }
      }
      if (
        (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') &&
        n.id?.name === name
      ) {
        found = true
        return
      }
      for (const key of Object.keys(n)) {
        if (key === 'typeAnnotation' || key === 'typeParameters' || key === 'returnType') continue
        const v = n[key]
        if (v && typeof v === 'object') visit(v)
      }
    }
    visit(node)
    return found
  }

  /** Register every name a pattern binds as `shadow` in the CURRENT scope. */
  function declarePatternAsShadow(pat: N): void {
    const names = new Set<string>()
    collectPatternNames(pat, names)
    for (const n of names) declare(n, { kind: 'shadow' })
  }

  function unwrapTs(node: N): N {
    let n = node
    while (
      n &&
      (n.type === 'TSAsExpression' ||
        n.type === 'TSSatisfiesExpression' ||
        n.type === 'TSNonNullExpression' ||
        n.type === 'TSInstantiationExpression' ||
        n.type === 'ParenthesizedExpression')
    ) {
      n = n.expression
    }
    return n
  }

  // ── Component detection ───────────────────────────────────────────────────

  function isPascalCase(name: string | undefined): boolean {
    return !!name && /^[A-Z]/.test(name)
  }

  function containsJsxReturn(fnBody: N): boolean {
    let found = false
    const visit = (n: N): void => {
      if (found || !n || typeof n !== 'object') return
      if (Array.isArray(n)) {
        for (const c of n) visit(c)
        return
      }
      if (typeof n.type !== 'string') return
      if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
        found = true
        return
      }
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') return
      for (const key of Object.keys(n)) {
        if (key === 'typeAnnotation' || key === 'typeParameters' || key === 'returnType') continue
        const v = n[key]
        if (v && typeof v === 'object') visit(v)
      }
    }
    visit(fnBody)
    return found
  }

  /** Simple ObjectPattern = only init properties with Identifier keys and
   *  Identifier / defaulted-Identifier values. Anything else bails (warned). */
  function analyzeSimplePropsPattern(
    pat: N,
  ): Array<{ key: string; local: string; defaultText: string | null }> | 'complex' {
    const out: Array<{ key: string; local: string; defaultText: string | null }> = []
    for (const p of pat.properties ?? []) {
      if (p.type === 'RestElement') return 'complex'
      if (p.computed || p.kind !== 'init' || p.key?.type !== 'Identifier') return 'complex'
      const value = p.value
      if (value?.type === 'Identifier') {
        out.push({ key: p.key.name, local: value.name, defaultText: null })
      } else if (value?.type === 'AssignmentPattern' && value.left?.type === 'Identifier') {
        out.push({
          key: p.key.name,
          local: value.left.name,
          defaultText: `(${code.slice(value.right.start, value.right.end)})`,
        })
      } else {
        return 'complex'
      }
    }
    return out
  }

  // ── Statement / expression walking ────────────────────────────────────────

  interface FnInfo {
    /** Set when this function is a detected component: its props variable. */
    propsVar: string | null
    isComponent: boolean
    body: N
  }
  const fnStack: FnInfo[] = []

  function walkFunction(fn: N, componentName: string | null): void {
    const body = fn.body
    const isComponent =
      (isPascalCase(componentName ?? undefined) || containsJsxReturn(body)) && !fn.generator

    funcDepth++
    scopes.push(new Map())
    const savedCond = condDepth
    const savedAwait = awaitSeen
    condDepth = 0

    // Hoisted names shadow before anything in the body runs.
    const hoisted = new Set<string>()
    if (body?.type === 'BlockStatement') hoistScan(body, hoisted)
    for (const n of hoisted) declare(n, { kind: 'shadow' })

    // Params: possibly the props-destructure rewrite; everything else shadows.
    const params: N[] = fn.params ?? []
    let propsVar: string | null = null
    if (isComponent && params.length >= 1) {
      const p0 = params[0]
      if (p0?.type === 'ObjectPattern') {
        const simple = analyzeSimplePropsPattern(p0)
        if (simple === 'complex') {
          warn(
            p0.start,
            'complex props destructuring (rest / nested / computed) is not rewritten — it captures values ONCE and loses reactivity. Take `props` and read properties directly.',
          )
          declarePatternAsShadow(p0)
        } else {
          const names = new Set<string>()
          collectPatternNames(p0, names)
          for (const other of params.slice(1)) collectPatternNames(other, names)
          // The chosen props name must be free EVERYWHERE in the function —
          // a body-level `const props = {}` (even in a nested block or
          // closure) would shadow the param and the emitted `props.a` reads
          // would resolve to the wrong binding.
          propsVar =
            names.has('props') || hoisted.has('props') || declaresNameDeep(body, 'props')
              ? '__props'
              : 'props'
          const annStart: number | undefined = p0.typeAnnotation?.start
          ms.overwrite(p0.start, annStart ?? p0.end, propsVar)
          for (const entry of simple) {
            declare(entry.local, {
              kind: 'prop',
              propsVar,
              key: entry.key,
              defaultText: entry.defaultText,
            })
          }
        }
      } else if (p0?.type === 'Identifier') {
        propsVar = p0.name
        declare(p0.name, { kind: 'shadow' })
      }
      for (const other of params.slice(1)) {
        walkParamDefaults(other)
        declarePatternAsShadow(other)
      }
    } else {
      for (const p of params) {
        walkParamDefaults(p)
        declarePatternAsShadow(p)
      }
    }

    fnStack.push({ propsVar, isComponent, body })

    if (body?.type === 'BlockStatement') {
      for (const stmt of body.body ?? []) walkStmt(stmt)
      // Tail detection runs AFTER the walk so component-BODY state
      // (`let loading = state(true)` inside the component) is in scope when
      // the `if` tests are classified — the function scope is still live here.
      const wrapFrom = isComponent ? findReactiveTail(body) : null
      if (wrapFrom !== null) {
        ms.appendLeft(wrapFrom, 'return () => {\n')
        ms.appendRight(body.end - 1, '\n}\n')
      }
    } else if (body) {
      walkExpr(body, true)
    }

    fnStack.pop()
    scopes.pop()
    funcDepth--
    condDepth = savedCond
    awaitSeen = savedAwait
  }

  /** Default values in ordinary params are expressions — walk them. */
  function walkParamDefaults(pat: N): void {
    if (!pat) return
    if (pat.type === 'AssignmentPattern') {
      walkExpr(pat.right, true)
      walkParamDefaults(pat.left)
    } else if (pat.type === 'ObjectPattern') {
      for (const p of pat.properties ?? []) {
        if (p.type === 'RestElement') walkParamDefaults(p.argument)
        else walkParamDefaults(p.value ?? p.key)
      }
    } else if (pat.type === 'ArrayPattern') {
      for (const el of pat.elements ?? []) if (el) walkParamDefaults(el)
    } else if (pat.type === 'RestElement') {
      walkParamDefaults(pat.argument)
    }
  }

  /**
   * Component tail wrap: the offset of the first top-level `if` whose test
   * mentions a reactive binding and whose branches contain a `return` — or
   * null when the body has no such early return. Bails (with a warning) when
   * the tail contains hoisted declarations the wrap would re-scope.
   */
  function findReactiveTail(body: N): number | null {
    const stmts: N[] = body.body ?? []
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i]
      if (s.type !== 'IfStatement') continue
      if (!statementContainsReturn(s)) continue
      if (!mentionsReactive(s.test)) continue
      const tail = stmts.slice(i)
      const bad = tail.some(
        (t) =>
          t.type === 'FunctionDeclaration' ||
          (t.type === 'VariableDeclaration' && t.kind === 'var'),
      )
      if (bad) {
        warn(
          s.start,
          'a reactive early return could not be made live: the statement tail declares a hoisted `function`/`var`. Move those above the conditional, or the branch is evaluated ONCE.',
        )
        return null
      }
      return s.start
    }
    return null
  }

  function statementContainsReturn(s: N): boolean {
    let found = false
    const visit = (n: N): void => {
      if (found || !n || typeof n !== 'object') return
      if (Array.isArray(n)) {
        for (const c of n) visit(c)
        return
      }
      if (typeof n.type !== 'string') return
      if (n.type === 'ReturnStatement') {
        found = true
        return
      }
      if (
        n.type === 'FunctionDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression'
      )
        return
      for (const key of Object.keys(n)) {
        if (key === 'typeAnnotation' || key === 'typeParameters' || key === 'returnType') continue
        const v = n[key]
        if (v && typeof v === 'object') visit(v)
      }
    }
    visit(s)
    return found
  }

  /** Does an expression mention a binding this pass treats as reactive? */
  function mentionsReactive(expr: N): boolean {
    let found = false
    const visit = (n: N): void => {
      if (found || !n || typeof n !== 'object') return
      if (Array.isArray(n)) {
        for (const c of n) visit(c)
        return
      }
      if (typeof n.type !== 'string') return
      if (n.type === 'Identifier') {
        const b = lookup(n.name)
        if (b && b.kind !== 'shadow') found = true
        return
      }
      if (n.type === 'MemberExpression') {
        // `props.loading` — a props-member read is reactive for components.
        const fnInfo = fnStack[fnStack.length - 1]
        if (
          fnInfo?.propsVar &&
          n.object?.type === 'Identifier' &&
          n.object.name === fnInfo.propsVar
        ) {
          found = true
          return
        }
      }
      for (const key of Object.keys(n)) {
        if (key === 'typeAnnotation' || key === 'typeParameters' || key === 'returnType') continue
        const v = n[key]
        if (v && typeof v === 'object') visit(v)
      }
    }
    visit(expr)
    return found
  }

  function walkStmt(stmt: N): void {
    if (!stmt || typeof stmt.type !== 'string') return
    switch (stmt.type) {
      case 'ExpressionStatement': {
        if (stmt.directive === 'use plain') return // stripped
        walkExpr(stmt.expression, false)
        return
      }
      case 'VariableDeclaration':
        walkVariableDeclaration(stmt)
        return
      case 'FunctionDeclaration': {
        if (stmt.id?.name) declare(stmt.id.name, { kind: 'shadow' })
        walkFunction(stmt, stmt.id?.name ?? null)
        return
      }
      case 'ClassDeclaration': {
        if (stmt.id?.name) declare(stmt.id.name, { kind: 'shadow' })
        walkClass(stmt)
        return
      }
      case 'ReturnStatement':
        if (stmt.argument) walkExpr(stmt.argument, true)
        return
      case 'IfStatement': {
        walkExpr(stmt.test, true)
        condDepth++
        walkStmt(stmt.consequent)
        if (stmt.alternate) walkStmt(stmt.alternate)
        condDepth--
        return
      }
      case 'BlockStatement': {
        scopes.push(new Map())
        for (const s of stmt.body ?? []) walkStmt(s)
        scopes.pop()
        return
      }
      case 'ForStatement': {
        scopes.push(new Map())
        if (stmt.init) {
          if (stmt.init.type === 'VariableDeclaration') walkVariableDeclaration(stmt.init)
          else walkExpr(stmt.init, false)
        }
        if (stmt.test) walkExpr(stmt.test, true)
        condDepth++
        if (stmt.update) walkExpr(stmt.update, false)
        walkStmt(stmt.body)
        condDepth--
        scopes.pop()
        return
      }
      case 'ForOfStatement':
      case 'ForInStatement': {
        scopes.push(new Map())
        if (stmt.left?.type === 'VariableDeclaration') {
          for (const d of stmt.left.declarations ?? []) declarePatternAsShadow(d.id)
        } else if (stmt.left?.type === 'Identifier') {
          const b = lookup(stmt.left.name)
          if (b && (b.kind === 'state' || b.kind === 'derived')) {
            warn(
              stmt.left.start,
              `\`for (${stmt.left.name} of …)\` writes plain state per iteration — not rewritten. Use a local loop variable and assign once.`,
            )
          }
        }
        walkExpr(stmt.right, true)
        condDepth++
        walkStmt(stmt.body)
        condDepth--
        scopes.pop()
        return
      }
      case 'WhileStatement':
      case 'DoWhileStatement':
        walkExpr(stmt.test, true)
        condDepth++
        walkStmt(stmt.body)
        condDepth--
        return
      case 'SwitchStatement': {
        walkExpr(stmt.discriminant, true)
        condDepth++
        scopes.push(new Map())
        for (const c of stmt.cases ?? []) {
          if (c.test) walkExpr(c.test, true)
          for (const s of c.consequent ?? []) walkStmt(s)
        }
        scopes.pop()
        condDepth--
        return
      }
      case 'TryStatement': {
        condDepth++
        walkStmt(stmt.block)
        if (stmt.handler) {
          scopes.push(new Map())
          if (stmt.handler.param) declarePatternAsShadow(stmt.handler.param)
          walkStmt(stmt.handler.body)
          scopes.pop()
        }
        if (stmt.finalizer) walkStmt(stmt.finalizer)
        condDepth--
        return
      }
      case 'ThrowStatement':
        walkExpr(stmt.argument, true)
        return
      case 'LabeledStatement':
        walkStmt(stmt.body)
        return
      case 'ExportNamedDeclaration':
        // `export { x }` exports the SIGNAL — the live-binding law. Only a
        // wrapped declaration is walked.
        if (stmt.declaration) walkStmt(stmt.declaration)
        return
      case 'ExportDefaultDeclaration': {
        const decl = stmt.declaration
        if (decl?.type === 'FunctionDeclaration' || decl?.type === 'ClassDeclaration') {
          walkStmt(decl)
        } else if (decl) {
          walkExpr(decl, true)
        }
        return
      }
      case 'ImportDeclaration':
      case 'EmptyStatement':
      case 'DebuggerStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
        return
      default:
        // TS declarations (interfaces, type aliases, enums) and anything else.
        if (stmt.type.startsWith('TS')) return
        // Conservative: walk known statement-ish children.
        if (stmt.body) walkStmt(stmt.body)
        return
    }
  }

  function walkVariableDeclaration(stmt: N): void {
    const decls: N[] = stmt.declarations ?? []
    let allMarkers = decls.length > 0

    for (const d of decls) {
      const init = d.init ? unwrapTs(d.init) : null
      const markerRole =
        init?.type === 'CallExpression' && init.callee?.type === 'Identifier'
          ? isMarker(init.callee.name)
          : null

      if (markerRole === 'state' && d.id?.type === 'Identifier') {
        used.state = true
        ms.overwrite(init.callee.start, init.callee.end, emitNames.state)
        for (const arg of init.arguments ?? []) walkExpr(arg, true)
        declare(d.id.name, { kind: 'state' })
        continue
      }
      if (markerRole === 'derived' && d.id?.type === 'Identifier') {
        used.derived = true
        ms.overwrite(init.callee.start, init.callee.end, emitNames.derived)
        const arg = init.arguments?.[0]
        if (arg) {
          const inner = unwrapTs(arg)
          if (inner.type === 'ArrowFunctionExpression' || inner.type === 'FunctionExpression') {
            // Thunk form: walk as an effect-grade callback (total tracking).
            walkTrackedCallback(inner)
          } else {
            ms.appendLeft(arg.start, '() => (')
            openTrackedExprFrame(arg)
            walkExpr(arg, true)
            closeTrackedExprFrame(arg)
            ms.appendLeft(arg.end, ')')
          }
        }
        declare(d.id.name, { kind: 'derived' })
        continue
      }

      allMarkers = false

      // Body-level `const { a, b } = props` inside a component → live reads.
      const fnInfo = fnStack[fnStack.length - 1]
      if (
        fnInfo?.isComponent &&
        fnInfo.propsVar &&
        d.id?.type === 'ObjectPattern' &&
        d.init?.type === 'Identifier' &&
        d.init.name === fnInfo.propsVar &&
        scopes[scopes.length - 1] &&
        decls.length === 1
      ) {
        const simple = analyzeSimplePropsPattern(d.id)
        if (simple !== 'complex') {
          ms.remove(stmt.start, stmt.end)
          for (const entry of simple) {
            declare(entry.local, {
              kind: 'prop',
              propsVar: fnInfo.propsVar,
              key: entry.key,
              defaultText: entry.defaultText,
            })
          }
          continue
        }
        warn(
          d.id.start,
          'complex props destructuring (rest / nested / computed) is not rewritten — it captures values ONCE and loses reactivity. Read properties off `props` directly.',
        )
      }

      // Ordinary declaration: init is an expression, id shadows.
      if (d.init) walkExpr(d.init, true)
      declarePatternAsShadow(d.id)
    }

    // `let x = state(0)` → `const` (the binding is never reassigned in the
    // OUTPUT — writes went through `.set`). Only when every declarator was a
    // marker, so a mixed `let a = state(0), b = 1` keeps `let` for `b`.
    if (allMarkers && stmt.kind !== 'const') {
      const kindEnd = stmt.start + stmt.kind.length
      ms.overwrite(stmt.start, kindEnd, 'const')
    }
  }

  function walkClass(cls: N): void {
    if (cls.superClass) walkExpr(cls.superClass, true)
    for (const el of cls.body?.body ?? []) {
      if (el.computed && el.key) walkExpr(el.key, true)
      if (el.type === 'MethodDefinition' && el.value) {
        walkFunction(el.value, null)
      } else if (el.type === 'PropertyDefinition' && el.value) {
        walkExpr(el.value, true)
      }
    }
  }

  // ── Tracked-callback machinery (effect / derived) ─────────────────────────

  function walkTrackedCallback(fn: N): void {
    const body = fn.body
    const frame: TrackFrame = {
      unconditional: new Set(),
      conditional: new Set(),
      funcDepth: funcDepth + 1,
      prologueAt: body?.type === 'BlockStatement' ? body.start + 1 : null,
      exprBody: body && body.type !== 'BlockStatement' ? { start: body.start, end: body.end } : null,
    }
    trackStack.push(frame)
    const savedAwait = awaitSeen
    awaitSeen = 0
    walkFunction(fn, null)
    awaitSeen = savedAwait
    trackStack.pop()
    emitPrologue(frame)
  }

  /** Expression-position derived: `derived(a + b)` — frame without a callback body. */
  function openTrackedExprFrame(arg: N): void {
    trackStack.push({
      unconditional: new Set(),
      conditional: new Set(),
      funcDepth,
      prologueAt: null,
      exprBody: { start: arg.start, end: arg.end },
    })
  }
  function closeTrackedExprFrame(_arg: N): void {
    const frame = trackStack.pop()!
    emitPrologue(frame)
  }

  function emitPrologue(frame: TrackFrame): void {
    const names = [...frame.conditional].filter((n) => !frame.unconditional.has(n))
    if (names.length === 0) return
    const reads = names.map((n) => `${n}()`).join(', ')
    if (frame.prologueAt !== null) {
      ms.appendRight(frame.prologueAt, ` void (${reads});`)
    } else if (frame.exprBody) {
      ms.appendRight(frame.exprBody.start, `(void (${reads}), `)
      ms.appendLeft(frame.exprBody.end, ')')
    }
  }

  // ── Expressions ───────────────────────────────────────────────────────────

  function walkExpr(node: N, valueUsed: boolean): void {
    if (!node || typeof node.type !== 'string') return
    switch (node.type) {
      case 'Identifier':
        rewriteRead(node)
        return
      case 'Literal':
      case 'ThisExpression':
      case 'Super':
      case 'MetaProperty':
      case 'PrivateIdentifier':
      case 'JSXEmptyExpression':
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
      case 'ObjectExpression':
        for (const p of node.properties ?? []) {
          if (p.type === 'SpreadElement') {
            walkExpr(p.argument, true)
            continue
          }
          if (p.computed && p.key) walkExpr(p.key, true)
          if (p.shorthand && p.value?.type === 'Identifier') {
            // `{ count }` — appending `()` in place would be invalid: expand.
            const b = lookup(p.value.name)
            if (b && (b.kind === 'state' || b.kind === 'derived' || b.kind === 'imported-state')) {
              ms.appendLeft(p.value.end, `: ${p.value.name}()`)
              recordRead(p.value.name)
            } else if (b?.kind === 'prop') {
              const access = `${b.propsVar}.${b.key}`
              ms.appendLeft(
                p.value.end,
                `: ${b.defaultText !== null ? `(${access} ?? ${b.defaultText})` : access}`,
              )
              recordRead(p.value.name)
            }
          } else if (p.value) {
            if (p.value.type === 'FunctionExpression' || p.value.type === 'ArrowFunctionExpression') {
              walkFunction(p.value, null)
            } else {
              walkExpr(p.value, true)
            }
          }
        }
        return
      case 'SpreadElement':
        walkExpr(node.argument, true)
        return
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        walkFunction(node, null)
        return
      case 'ClassExpression':
        walkClass(node)
        return
      case 'CallExpression': {
        const callee = node.callee
        if (callee?.type === 'Identifier') {
          const role = isMarker(callee.name)
          if (role === 'effect') {
            used.effect = true
            if (callee.name !== emitNames.effect) {
              ms.overwrite(callee.start, callee.end, emitNames.effect)
            }
            const arg = node.arguments?.[0] ? unwrapTs(node.arguments[0]) : null
            if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) {
              walkTrackedCallback(arg)
            } else {
              warn(node.start, 'effect() expects a function callback.')
              for (const a of node.arguments ?? []) walkExpr(a, true)
            }
            return
          }
          if (role === 'state' || role === 'derived') {
            warn(
              node.start,
              `${role}() must initialize a variable declaration (\`let x = ${role}(…)\`); this call is left as-is and will throw at runtime.`,
            )
            for (const a of node.arguments ?? []) walkExpr(a, true)
            return
          }
        }
        walkExpr(callee, true)
        for (const a of node.arguments ?? []) walkExpr(a, true)
        return
      }
      case 'NewExpression':
        walkExpr(node.callee, true)
        for (const a of node.arguments ?? []) walkExpr(a, true)
        return
      case 'MemberExpression':
        walkExpr(node.object, true)
        if (node.computed && node.property) walkExpr(node.property, true)
        return
      case 'AssignmentExpression':
        rewriteAssignment(node, valueUsed)
        return
      case 'UpdateExpression':
        rewriteUpdate(node, valueUsed)
        return
      case 'UnaryExpression':
      case 'AwaitExpression': {
        if (node.type === 'AwaitExpression') {
          walkExpr(node.argument, true)
          awaitSeen++
          return
        }
        walkExpr(node.argument, true)
        return
      }
      case 'YieldExpression':
        if (node.argument) walkExpr(node.argument, true)
        return
      case 'BinaryExpression':
        walkExpr(node.left, true)
        walkExpr(node.right, true)
        return
      case 'LogicalExpression':
        walkExpr(node.left, true)
        condDepth++
        walkExpr(node.right, true)
        condDepth--
        return
      case 'ConditionalExpression':
        walkExpr(node.test, true)
        condDepth++
        walkExpr(node.consequent, true)
        walkExpr(node.alternate, true)
        condDepth--
        return
      case 'SequenceExpression': {
        const exprs: N[] = node.expressions ?? []
        for (let i = 0; i < exprs.length; i++) {
          walkExpr(exprs[i], valueUsed && i === exprs.length - 1)
        }
        return
      }
      case 'ImportExpression':
        walkExpr(node.source, true)
        return
      // ── JSX ──
      case 'JSXElement': {
        walkJsxOpening(node.openingElement)
        for (const c of node.children ?? []) walkJsxChild(c)
        return
      }
      case 'JSXFragment':
        for (const c of node.children ?? []) walkJsxChild(c)
        return
      case 'JSXExpressionContainer':
        walkExpr(node.expression, true)
        return
      default:
        if (node.type.startsWith('TS')) return
        return
    }
  }

  function walkJsxOpening(opening: N): void {
    if (!opening) return
    for (const attr of opening.attributes ?? []) {
      if (attr.type === 'JSXSpreadAttribute') {
        walkExpr(attr.argument, true)
      } else if (attr.type === 'JSXAttribute' && attr.value) {
        if (attr.value.type === 'JSXExpressionContainer') walkExpr(attr.value.expression, true)
        else if (attr.value.type === 'JSXElement' || attr.value.type === 'JSXFragment')
          walkExpr(attr.value, true)
      }
    }
  }

  function walkJsxChild(child: N): void {
    if (!child || typeof child.type !== 'string') return
    if (child.type === 'JSXExpressionContainer') walkExpr(child.expression, true)
    else if (child.type === 'JSXElement' || child.type === 'JSXFragment') walkExpr(child, true)
    else if (child.type === 'JSXSpreadChild') walkExpr(child.expression, true)
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  const COMPOUND_OPS: Record<string, string> = {
    '+=': '+',
    '-=': '-',
    '*=': '*',
    '/=': '/',
    '%=': '%',
    '**=': '**',
    '&=': '&',
    '|=': '|',
    '^=': '^',
    '<<=': '<<',
    '>>=': '>>',
    '>>>=': '>>>',
  }
  const LOGICAL_ASSIGN: Record<string, string> = { '&&=': '&&', '||=': '||', '??=': '??' }

  function rewriteAssignment(node: N, valueUsed: boolean): void {
    const left = node.left
    const target = left?.type === 'Identifier' ? lookup(left.name) : null

    if (left?.type === 'Identifier' && target) {
      if (target.kind === 'derived') {
        warn(left.start, `cannot assign to derived value \`${left.name}\` — derive it differently or make it state.`)
        walkExpr(node.right, true)
        return
      }
      if (target.kind === 'imported-state') {
        warn(
          left.start,
          `cannot assign to imported state \`${left.name}\` — ESM imports are read-only. Export a setter function from the owning module.`,
        )
        walkExpr(node.right, true)
        return
      }
      if (target.kind === 'prop') {
        warn(left.start, `cannot assign to prop \`${left.name}\` — props flow down; lift the state up.`)
        walkExpr(node.right, true)
        return
      }
      if (target.kind === 'state') {
        const name = left.name
        const op = node.operator
        if (op === '=') {
          // `x = v` → `x.set(v)`; expression position → `(x.set(v), x())`.
          ms.overwrite(left.start, node.right.start, valueUsed ? `(${name}.set(` : `${name}.set(`)
          walkExpr(node.right, true)
          ms.appendLeft(node.end, valueUsed ? `), ${name}())` : ')')
          return
        }
        const bin = COMPOUND_OPS[op]
        if (bin) {
          // `x += v` → `x.set(x() + (v))`.
          const open = valueUsed ? `(${name}.set(${name}() ${bin} (` : `${name}.set(${name}() ${bin} (`
          ms.overwrite(left.start, node.right.start, open)
          walkExpr(node.right, true)
          ms.appendLeft(node.end, valueUsed ? `)), ${name}())` : '))')
          return
        }
        const logical = LOGICAL_ASSIGN[op]
        if (logical) {
          // `x ||= v` → `x() || x.set(v)` (assign only when the base op says so);
          // expression position returns the settled value.
          const open = valueUsed
            ? `(${name}() ${logical} (${name}.set(`
            : `${name}() ${logical} ${name}.set(`
          ms.overwrite(left.start, node.right.start, open)
          walkExpr(node.right, true)
          ms.appendLeft(node.end, valueUsed ? `), ${name}()))` : ')')
          return
        }
      }
    }

    // Destructuring assignment onto tracked bindings → warn, walk untouched.
    if (left?.type === 'ObjectPattern' || left?.type === 'ArrayPattern') {
      const names = new Set<string>()
      collectPatternNames(left, names)
      for (const n of names) {
        const b = lookup(n)
        if (b && (b.kind === 'state' || b.kind === 'derived')) {
          warn(
            left.start,
            `destructuring assignment onto plain state \`${n}\` is not rewritten — assign each binding directly.`,
          )
          break
        }
      }
    }

    // Member writes whose ROOT is plain state: silent-mutation trap → warn.
    if (left?.type === 'MemberExpression') {
      let root: N = left
      while (root?.type === 'MemberExpression') root = root.object
      if (root?.type === 'Identifier') {
        const rb = lookup(root.name)
        if (rb && (rb.kind === 'state' || rb.kind === 'derived' || rb.kind === 'imported-state')) {
          warn(
            left.start,
            `mutating a property of plain state \`${root.name}\` does not notify subscribers — replace the value instead: \`${root.name} = { …${root.name}, key: v }\`.`,
          )
        }
      }
      walkExpr(left, true) // rewrites the root read: `obj().k = v`
      walkExpr(node.right, true)
      return
    }

    if (left) walkExpr(left, false)
    walkExpr(node.right, true)
  }

  function rewriteUpdate(node: N, valueUsed: boolean): void {
    const arg = node.argument
    const target = arg?.type === 'Identifier' ? lookup(arg.name) : null
    if (arg?.type === 'Identifier' && target?.kind === 'state') {
      const name = arg.name
      const bin = node.operator === '++' ? '+' : '-'
      if (!valueUsed) {
        ms.overwrite(node.start, node.end, `${name}.set(${name}() ${bin} 1)`)
      } else if (node.prefix) {
        ms.overwrite(node.start, node.end, `(${name}.set(${name}() ${bin} 1), ${name}())`)
      } else {
        // Postfix value is the OLD value — evaluate once via an IIFE.
        ms.overwrite(
          node.start,
          node.end,
          `((__v) => (${name}.set(__v ${bin} 1), __v))(${name}())`,
        )
      }
      return
    }
    if (arg?.type === 'Identifier' && target && (target.kind === 'derived' || target.kind === 'prop' || target.kind === 'imported-state')) {
      warn(arg.start, `cannot update \`${arg.name}\` — it is not writable state.`)
      return
    }
    if (arg?.type === 'MemberExpression') {
      let root: N = arg
      while (root?.type === 'MemberExpression') root = root.object
      if (root?.type === 'Identifier') {
        const rb = lookup(root.name)
        if (rb && (rb.kind === 'state' || rb.kind === 'imported-state')) {
          warn(
            arg.start,
            `mutating a property of plain state \`${root.name}\` does not notify subscribers — replace the value instead.`,
          )
        }
      }
      walkExpr(arg, true)
      return
    }
    if (arg) walkExpr(arg, valueUsed)
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  for (const stmt of program.body as N[]) walkStmt(stmt)

  // Strip the directive + marker imports — CONTENT only, newlines kept, so
  // every line number below stays aligned with the source (downstream
  // warnings and the JSX transform's sourcemap stay truthful).
  for (const r of stripRanges) {
    ms.remove(r.start, r.end)
  }

  // Inject the reactivity imports the rewrites need.
  const needed: string[] = []
  if (used.state && !(emitNames.state === 'signal' && reactivityImported.has('signal'))) {
    needed.push(emitNames.state === 'signal' ? 'signal' : `signal as ${emitNames.state}`)
  }
  if (used.derived && !(emitNames.derived === 'computed' && reactivityImported.has('computed'))) {
    needed.push(emitNames.derived === 'computed' ? 'computed' : `computed as ${emitNames.derived}`)
  }
  if (used.effect && !(emitNames.effect === 'effect' && reactivityImported.has('effect'))) {
    needed.push(emitNames.effect === 'effect' ? 'effect' : `effect as ${emitNames.effect}`)
  }
  if (needed.length > 0) {
    const importText = `import { ${needed.join(', ')} } from '${REACTIVITY_SOURCE}'`
    if (reactivityImport) {
      const last = reactivityImport.specifiers[reactivityImport.specifiers.length - 1]
      ms.appendLeft(last.end, `, ${needed.join(', ')}`)
    } else if (stripRanges.length > 0) {
      // Reuse a stripped slot — the import lands on the line the marker
      // import (or directive) occupied, keeping the line count identical.
      ms.appendLeft(stripRanges[0]!.start, importText)
    } else {
      const first = program.body[0]
      ms.appendLeft(first ? first.start : 0, `${importText}\n`)
    }
  }

  return { code: ms.toString(), warnings }
}

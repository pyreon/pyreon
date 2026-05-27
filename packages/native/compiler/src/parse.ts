// Parse Pyreon JSX source → ComponentIR[] by walking the oxc AST.
//
// Scope is intentionally minimal for Phase 0: only the shapes the seven
// starter fixtures use are recognised. Anything outside that set is
// either passed through as unknown or surfaces a warning.

import { parseSync } from 'oxc-parser'
import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  DeclIR,
  EnumIR,
  ExprIR,
  ModuleDeclIR,
  ParseResult,
  StatementIR,
  StructIR,
  TypeIR,
} from './types'

// oxc-parser's typed AST is rich; for Phase 0 we walk it loosely via
// `any` to keep the parser readable. As the IR coverage grows we can
// tighten this with `@oxc-project/types`.
//
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

interface ParseCtx {
  warnings: string[]
  source: string
}

export function parsePyreon(source: string, filename = 'input.tsx'): ParseResult {
  const ctx: ParseCtx = { warnings: [], source }
  const ast = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  const components: ComponentIR[] = []
  const enums: EnumIR[] = []
  const structs: StructIR[] = []
  const moduleDecls: ModuleDeclIR[] = []

  for (const node of ast.program.body as AnyNode[]) {
    const comp = tryComponentFromTopLevel(node, ctx)
    if (comp) components.push(comp)
    const en = tryEnumFromTypeAlias(node, ctx)
    if (en) enums.push(en)
    // G5 follow-up: try struct extraction for object-shape type aliases.
    // Falls through silently when the alias is a union (already caught by
    // tryEnumFromTypeAlias above) OR a non-object alias (`type Foo = string`).
    const st = tryStructFromTypeAlias(node, ctx)
    if (st) structs.push(st)
    // Phase 2 follow-up: module-level mutable / immutable bindings.
    // `let nextId = 1`, `const APP_VERSION = '1.0.0'` etc. Closes the
    // TodoMVC `nextId undefined` typecheck blocker by emitting these
    // at file scope on the target.
    const mds = tryModuleDeclsFromTopLevel(node, ctx)
    if (mds) moduleDecls.push(...mds)
  }

  return { components, enums, structs, moduleDecls, warnings: ctx.warnings }
}

/**
 * Extract module-level `let X = expr` / `const X = expr` bindings.
 * Phase 2 follow-up — closes the TodoMVC `nextId undefined` typecheck
 * blocker. TS source's `let` is mutable; `const` is immutable. The
 * mutability flows through to the target emit (`var`/`let` on Swift,
 * `var`/`val` on Kotlin).
 *
 * Skips:
 *   - declarators inside function bodies (already handled by
 *     tryDeclFromVarDeclarator)
 *   - declarators whose init is a CallExpression to `signal` / `computed`
 *     / `useStorage` (those are component-scope reactive decls, not
 *     module-level bindings — caught by tryComponentFromTopLevel)
 *   - destructured patterns (`const { a, b } = obj`) — Phase 3
 *   - non-init declarators (`let x` without value) — defensive bail
 */
function tryModuleDeclsFromTopLevel(node: AnyNode, ctx: ParseCtx): ModuleDeclIR[] | null {
  // Walk through `ExportNamedDeclaration` → `VariableDeclaration`.
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null

  const isConst = varDecl.kind === 'const'
  const declarators = varDecl.declarations as AnyNode[]
  const out: ModuleDeclIR[] = []
  for (const declarator of declarators) {
    const name = declarator.id?.name as string | undefined
    if (!name) continue // destructured — skip silently
    const init = declarator.init as AnyNode | undefined
    if (!init) continue // bare `let x` — skip
    // Skip declarators whose init is a `signal()` / `computed()` /
    // `useStorage()` call — those belong inside a component, not at
    // module scope. They shouldn't show up here (the parser walks
    // function bodies separately), but defensive bail catches any
    // shape where a user accidentally writes `const x = signal(0)` at
    // module scope (which would be a runtime bug in Pyreon anyway).
    if (init.type === 'CallExpression') {
      const calleeName = init.callee?.name as string | undefined
      if (
        calleeName === 'signal' ||
        calleeName === 'computed' ||
        calleeName === 'useStorage'
      ) {
        ctx.warnings.push(
          `Module-level binding ${name} initializes via ${calleeName}() — these belong inside a component. Skipped.`,
        )
        continue
      }
    }
    // Type annotation when present; otherwise unknown.
    const annotation = declarator.id?.typeAnnotation?.typeAnnotation as AnyNode | undefined
    const type: TypeIR = annotation ? parseTypeAnnotation(annotation, ctx) : { kind: 'unknown' }
    const initialExpr = parseExpr(init, ctx)
    out.push({ name, mutable: !isConst, type, initial: initialExpr })
  }
  return out.length > 0 ? out : null
}

/**
 * Extract a string-literal union type alias as a native enum. Source:
 *
 *   type Filter = 'all' | 'active' | 'completed'
 *   export type Filter = ...
 *
 * Reads the oxc shape: `TSTypeAliasDeclaration` with body `TSUnionType`
 * whose every branch is a `TSLiteralType` wrapping a string `Literal`.
 *
 * Returns null for:
 *   - non-union type aliases (`type Foo = string`)
 *   - non-string union members (`type Mixed = 1 | 'a'`)
 *   - generic type-parameter aliases (`type Box<T> = ...`)
 */
function tryEnumFromTypeAlias(node: AnyNode, ctx: ParseCtx): EnumIR | null {
  // Walk through `ExportNamedDeclaration` to the type alias.
  let alias: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'TSTypeAliasDeclaration'
  ) {
    alias = node.declaration
  } else if (node.type === 'TSTypeAliasDeclaration') {
    alias = node
  }
  if (!alias) return null
  // Skip generic type parameters — `type Box<T> = T | null` isn't a
  // closed enum.
  if (alias.typeParameters?.params?.length > 0) return null
  const name = alias.id?.name as string | undefined
  if (!name) return null
  const body = alias.typeAnnotation as AnyNode | undefined
  if (!body || body.type !== 'TSUnionType') return null
  const branches = body.types as AnyNode[] | undefined
  if (!branches || branches.length === 0) return null
  const cases: string[] = []
  for (const branch of branches) {
    if (branch.type !== 'TSLiteralType') return null
    const lit = branch.literal as AnyNode | undefined
    if (!lit || lit.type !== 'Literal') return null
    const v = lit.value
    if (typeof v !== 'string') return null
    // Empty-string enum cases would be valid TS but invalid Swift /
    // Kotlin identifiers — defensive bail.
    if (v.length === 0) {
      ctx.warnings.push(`Enum ${name}: skipped empty-string union branch.`)
      return null
    }
    cases.push(v)
  }
  return { name, cases }
}

/**
 * Extract an object-shape type alias as a native struct / data class.
 * Source:
 *
 *   type Todo = { id: number; text: string; done: boolean }
 *   export type Todo = { ... }
 *
 * Reads the oxc shape: `TSTypeAliasDeclaration` with body `TSTypeLiteral`
 * (anonymous object). Foundational Phase 2 work — closes the "anonymous
 * record types emit as labelled tuples" gap from G5 #849's known caveats.
 * Anonymous tuples block Codable bridges (Swift) and Compose Savers
 * (Kotlin); real structs unblock both.
 *
 * Returns null for:
 *   - non-object type aliases (`type Filter = 'all' | 'active'` —
 *     caught by tryEnumFromTypeAlias upstream)
 *   - non-object aliases (`type Foo = string`)
 *   - generic type-parameter aliases (`type Box<T> = ...`) — Phase 3
 *     work; structural emit of generic structs requires deeper inference
 *   - empty object types (no fields — defensive bail; emit would be
 *     `struct X { }` which is valid but useless)
 */
function tryStructFromTypeAlias(node: AnyNode, ctx: ParseCtx): StructIR | null {
  // Walk through `ExportNamedDeclaration` to the type alias.
  let alias: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'TSTypeAliasDeclaration'
  ) {
    alias = node.declaration
  } else if (node.type === 'TSTypeAliasDeclaration') {
    alias = node
  }
  if (!alias) return null
  // Skip generic type parameters — Phase 3 work.
  if (alias.typeParameters?.params?.length > 0) return null
  const name = alias.id?.name as string | undefined
  if (!name) return null
  const body = alias.typeAnnotation as AnyNode | undefined
  if (!body || body.type !== 'TSTypeLiteral') return null
  // Use the same parser as inline `TSTypeLiteral` annotations so the
  // field-walking logic stays in one place. Reuses the optional-chain
  // bails / index-signature skips already in parseTypeAnnotation.
  const parsed = parseTypeAnnotation(body, ctx)
  if (parsed.kind !== 'object') return null
  if (parsed.fields.length === 0) {
    ctx.warnings.push(`Struct ${name}: skipped — empty object type.`)
    return null
  }
  return { name, fields: parsed.fields }
}

/** Extract a component from `export function NAME(...) { ... }`. */
function tryComponentFromTopLevel(node: AnyNode, ctx: ParseCtx): ComponentIR | null {
  // Walk through `ExportNamedDeclaration` → `FunctionDeclaration`.
  let fn: AnyNode | null = null
  if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
    fn = node.declaration
  } else if (node.type === 'FunctionDeclaration') {
    fn = node
  }
  if (!fn || !fn.id?.name) return null

  const name = fn.id.name as string
  const body = fn.body?.body as AnyNode[] | undefined
  if (!body) return null

  // Parse props from the first parameter when it carries an object type
  // annotation. Other parameter shapes (no params, no type annotation,
  // destructured params) are tolerated but produce no props — the body's
  // member accesses on the param name still rewrite cleanly if the name
  // is captured.
  const { props, propsParamName } = parseProps(fn.params as AnyNode[] | undefined, ctx)

  const decls: DeclIR[] = []
  let returnExpr: ExprIR | null = null

  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration') {
      for (const declarator of stmt.declarations as AnyNode[]) {
        const decl = tryDeclFromVarDeclarator(declarator, ctx)
        if (decl) decls.push(decl)
      }
    } else if (stmt.type === 'ReturnStatement' && stmt.argument) {
      returnExpr = parseExpr(stmt.argument, ctx)
    }
  }

  if (returnExpr === null) {
    ctx.warnings.push(`Component ${name}: no return statement found; skipping.`)
    return null
  }

  return { name, props, propsParamName, decls, returnExpr }
}

/** Parse the function's first parameter as Pyreon props (object type or interface). */
function parseProps(
  params: AnyNode[] | undefined,
  ctx: ParseCtx,
): { props: import('./types').PropIR[]; propsParamName: string | undefined } {
  if (!params || params.length === 0) return { props: [], propsParamName: undefined }
  const firstParam = params[0]
  // Identifier-with-annotation shape: `(props: { … })` — the annotation
  // is on `firstParam.typeAnnotation.typeAnnotation`.
  if (firstParam?.type !== 'Identifier') return { props: [], propsParamName: undefined }
  const paramName = firstParam.name as string
  const annotation = firstParam.typeAnnotation?.typeAnnotation as AnyNode | undefined
  if (!annotation) return { props: [], propsParamName: paramName }

  const objType = parseTypeAnnotation(annotation, ctx)
  if (objType.kind !== 'object') {
    // Non-object type — could be a named interface ref we can't resolve
    // (Phase 0 doesn't follow imports). Track the binding name so member
    // rewrites still work; props list stays empty.
    return { props: [], propsParamName: paramName }
  }
  return {
    props: objType.fields.map((f) => ({ name: f.name, type: f.type })),
    propsParamName: paramName,
  }
}

/** Try to extract a signal / computed / function declaration from a `const x = …`. */
function tryDeclFromVarDeclarator(node: AnyNode, ctx: ParseCtx): DeclIR | null {
  const name = node.id?.name as string | undefined
  const init = node.init as AnyNode | undefined
  if (!name || !init) return null

  // Arrow-function declaration — `const fn = (params) => { ... }` —
  // becomes a `function` DeclIR. Parser-A from the TodoMVC walkthrough.
  // The emitter renders these as `private func` (Swift) / `private fn`
  // (Kotlin). The arrow's body can be a BlockStatement (multi-statement)
  // OR a single expression (concise arrow); we normalize both to
  // StatementIR[] so the emitter has one shape to handle.
  if (init.type === 'ArrowFunctionExpression') {
    return tryFunctionDecl(name, init, ctx)
  }

  if (init.type !== 'CallExpression') return null

  const calleeName = init.callee?.name as string | undefined
  if (calleeName === 'signal') {
    const type = parseGenericTypeArg(init, ctx)
    const initialArg = init.arguments?.[0]
    const initial: ExprIR = initialArg
      ? parseExpr(initialArg, ctx)
      : { kind: 'literal', value: 0 }
    return { kind: 'signal', name, type, initial }
  }
  // G5 — `useStorage<T>('key', default)` from `@pyreon/storage` is a
  // PERSISTENT signal. Same shape as `signal()` plus a storage-key
  // string. The emitter routes storage signals to platform-idiomatic
  // persistence primitives:
  //   Swift   →  @AppStorage("key") private var x: T = default
  //   Kotlin  →  var x by rememberSaveable { mutableStateOf(default) }
  // The `_signalNames` set in the emitters picks up storage signals
  // automatically (since they're DeclIR.signal), so `todos()` correctly
  // drops parens at call sites without a separate `_storageNames` set.
  if (calleeName === 'useStorage') {
    const type = parseGenericTypeArg(init, ctx)
    const keyArg = init.arguments?.[0]
    const initialArg = init.arguments?.[1]
    // The storage key MUST be a string literal — anything else (template
    // string, identifier, member access) can't be baked into the
    // `@AppStorage(...)` string at compile time. Conservative — fall
    // through to undeclared if the key isn't a static literal.
    if (
      !keyArg ||
      (keyArg.type !== 'Literal' && keyArg.type !== 'StringLiteral') ||
      typeof keyArg.value !== 'string'
    ) {
      ctx.warnings.push(
        `Declaration ${name}: useStorage key argument must be a string literal; got ${keyArg?.type ?? 'nothing'}.`,
      )
      return null
    }
    const storageKey = keyArg.value
    const initial: ExprIR = initialArg
      ? parseExpr(initialArg, ctx)
      : { kind: 'literal', value: 0 }
    return { kind: 'signal', name, type, initial, storageKey }
  }
  if (calleeName === 'computed') {
    const arg = init.arguments?.[0]
    if (!arg || arg.type !== 'ArrowFunctionExpression') {
      ctx.warnings.push(
        `Declaration ${name}: computed expected an arrow function argument; got ${arg?.type ?? 'nothing'}.`,
      )
      return null
    }
    const body = arg.body
    // computed-with-BlockStatement-body (multi-statement) requires the
    // same shape as a regular function-decl arrow. The emitter handles
    // it: a single-return BlockStatement renders inline as a Swift
    // computed property; anything more degrades to a getter with a
    // body. Phase 1: route through parseStatement.
    if (body.type === 'BlockStatement') {
      const stmts = parseStatementBlock(body, ctx)
      // Single-statement block that's a return → keep the legacy
      // single-expression shape so emit stays compact:
      //   computed(() => { return x })  →  computed.expr = x
      // Both shapes type-check identically; the legacy form keeps the
      // existing snapshots stable for the common-case 1-return body.
      if (stmts.length === 1 && stmts[0]?.kind === 'return' && stmts[0].expr !== undefined) {
        return { kind: 'computed', name, expr: stmts[0].expr }
      }
      // Multi-statement body — populate `body` with the full statement
      // sequence. The emit pass renders this as a Swift multi-statement
      // getter / Kotlin multi-statement `derivedStateOf` lambda body,
      // preserving any pre-return `let` bindings, `if` early-returns,
      // etc. Phase 2 follow-up closing the TodoMVC `visible: Any { xs }`
      // typecheck blocker — pre-PR the parser silently dropped
      // pre-return statements and emitted a synthetic expression.
      return { kind: 'computed', name, body: stmts }
    }
    const expr: ExprIR = parseExpr(body, ctx)
    return { kind: 'computed', name, expr }
  }
  // C4 — `@pyreon/router` hook recognition. Three shapes:
  //
  //   const router   = createRouter({ routes: [...] })
  //   const navigate = useNavigate()
  //   const params   = useParams()
  //
  // Per-target emit lives in emitSwiftDecl / emitKotlinDecl. The routes
  // config arg to createRouter is intentionally DROPPED at parse time
  // — native runtimes wire routes via .navigationDestination(for:) /
  // NavHost(routes), separately from the router instance itself.
  if (calleeName === 'createRouter') {
    return { kind: 'router', name }
  }
  if (calleeName === 'useNavigate') {
    return { kind: 'router-hook', name, hook: 'navigate' }
  }
  if (calleeName === 'useParams') {
    return { kind: 'router-hook', name, hook: 'params' }
  }
  return null
}

/**
 * Parse `const fn = (params) => { body }` into a `function` DeclIR.
 * Handles both arrow body forms:
 *   - BlockStatement: multi-statement → StatementIR[] verbatim
 *   - Expression body: wraps in `[{ kind: 'return', expr }]`
 */
function tryFunctionDecl(
  name: string,
  arrow: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  // Parse parameters with optional type annotations. TS params shape:
  // `(id: T, id2: T2)` where each param is an Identifier with
  // `typeAnnotation.typeAnnotation`.
  const params: { name: string; type: TypeIR }[] = []
  for (const p of (arrow.params as AnyNode[] | undefined) ?? []) {
    if (p?.type !== 'Identifier') continue
    const paramName = p.name as string
    const annot = p.typeAnnotation?.typeAnnotation as AnyNode | undefined
    const type: TypeIR = annot ? parseTypeAnnotation(annot, ctx) : { kind: 'unknown' }
    params.push({ name: paramName, type })
  }

  // Return type annotation, if any. oxc carries it on `arrow.returnType.typeAnnotation`.
  const returnTypeNode = arrow.returnType?.typeAnnotation as AnyNode | undefined
  const returnType: TypeIR = returnTypeNode
    ? parseTypeAnnotation(returnTypeNode, ctx)
    : { kind: 'unknown' }

  const body = arrow.body as AnyNode
  let stmts: StatementIR[]
  if (body.type === 'BlockStatement') {
    stmts = parseStatementBlock(body, ctx)
  } else {
    // Concise arrow body (`const fn = () => expr`): wrap as
    // `{ return expr }` for uniformity. The emitter pattern-matches
    // this case to emit `private func fn() -> T { expr }` without
    // the explicit `return` keyword on Swift.
    stmts = [{ kind: 'return', expr: parseExpr(body, ctx) }]
  }

  return { kind: 'function', name, params, returnType, body: stmts }
}

/**
 * Walk a BlockStatement's statements into a StatementIR[]. Handles
 * the four TodoMVC-relevant kinds (let / if / return / expr); other
 * statement types warn + drop.
 */
function parseStatementBlock(block: AnyNode, ctx: ParseCtx): StatementIR[] {
  const out: StatementIR[] = []
  for (const stmt of (block.body as AnyNode[] | undefined) ?? []) {
    const parsed = parseStatement(stmt, ctx)
    if (parsed) out.push(parsed)
  }
  return out
}

function parseStatement(node: AnyNode, ctx: ParseCtx): StatementIR | null {
  switch (node.type) {
    case 'VariableDeclaration': {
      // Only single-decl `const`/`let`/`var` for now — multi-declarator
      // (`const a = 1, b = 2`) is rare in real Pyreon code; warn + drop.
      const declarators = (node.declarations as AnyNode[] | undefined) ?? []
      if (declarators.length !== 1) {
        ctx.warnings.push(
          `Unsupported statement: multi-declarator VariableDeclaration (${declarators.length} decls).`,
        )
        return null
      }
      const d = declarators[0]!
      const declName = d.id?.name as string | undefined
      if (!declName || !d.init) return null
      return { kind: 'let', name: declName, expr: parseExpr(d.init, ctx) }
    }
    case 'IfStatement': {
      const cond = parseExpr(node.test, ctx)
      const consequent = node.consequent as AnyNode
      const then =
        consequent?.type === 'BlockStatement'
          ? parseStatementBlock(consequent, ctx)
          : ((): StatementIR[] => {
              const s = parseStatement(consequent, ctx)
              return s ? [s] : []
            })()
      const alt = node.alternate as AnyNode | undefined
      let elseBody: StatementIR[] | undefined
      if (alt) {
        elseBody =
          alt.type === 'BlockStatement'
            ? parseStatementBlock(alt, ctx)
            : ((): StatementIR[] => {
                const s = parseStatement(alt, ctx)
                return s ? [s] : []
              })()
      }
      return elseBody ? { kind: 'if', cond, then, elseBody } : { kind: 'if', cond, then }
    }
    case 'ReturnStatement': {
      const arg = node.argument as AnyNode | undefined
      return arg ? { kind: 'return', expr: parseExpr(arg, ctx) } : { kind: 'return' }
    }
    case 'ExpressionStatement': {
      return { kind: 'expr', expr: parseExpr(node.expression, ctx) }
    }
    default:
      ctx.warnings.push(`Unsupported statement: ${node.type}.`)
      return null
  }
}

/** Extract the `T` from `signal<T>(…)`. oxc exposes generics as `typeArguments`. */
function parseGenericTypeArg(callExpr: AnyNode, ctx: ParseCtx): TypeIR {
  const params = callExpr.typeArguments?.params as AnyNode[] | undefined
  if (!params || params.length === 0) return { kind: 'unknown' }
  return parseTypeAnnotation(params[0]!, ctx)
}

function parseTypeAnnotation(node: AnyNode, ctx: ParseCtx): TypeIR {
  switch (node.type) {
    case 'TSNumberKeyword':
      return { kind: 'number' }
    case 'TSStringKeyword':
      return { kind: 'string' }
    case 'TSBooleanKeyword':
      return { kind: 'boolean' }
    case 'TSNullKeyword':
      return { kind: 'null' }
    case 'TSUndefinedKeyword':
      // `undefined` in TS — both Swift and Kotlin model this as the
      // null-ish branch of an Optional / nullable type.
      return { kind: 'undefined' }
    case 'TSAnyKeyword':
    case 'TSUnknownKeyword':
    case 'TSVoidKeyword':
    case 'TSNeverKeyword':
      // Top/bottom types — degrade to `unknown` IR (emits as `Any` /
      // `Any?` per target). Phase 1 may refine the void/never cases.
      return { kind: 'unknown' }
    case 'TSArrayType':
      return { kind: 'array', element: parseTypeAnnotation(node.elementType, ctx) }
    case 'TSTypeLiteral': {
      const fields = (node.members as AnyNode[])
        .filter((m) => m.type === 'TSPropertySignature' && m.key?.name && m.typeAnnotation)
        .map((m) => ({
          name: m.key.name as string,
          type: parseTypeAnnotation(m.typeAnnotation.typeAnnotation, ctx),
        }))
      return { kind: 'object', fields }
    }
    case 'TSUnionType': {
      // Flat union — collapse nested unions and preserve branch order.
      const branches: TypeIR[] = []
      for (const t of node.types as AnyNode[]) {
        const parsed = parseTypeAnnotation(t, ctx)
        if (parsed.kind === 'union') branches.push(...parsed.branches)
        else branches.push(parsed)
      }
      return { kind: 'union', branches }
    }
    case 'TSTypeReference': {
      // `Foo`, `MyInterface`, `Array<T>`, `Promise<string>`, etc. The
      // Phase 0 parser doesn't follow imports so we preserve the name
      // verbatim + recursively-parsed generic args. Per-target emit
      // decides how to render. Common stdlib references (e.g. `Array`)
      // are handled by the emitter's typeRef case.
      const nameNode = node.typeName as AnyNode
      let name = '(unresolved-typeRef)'
      if (nameNode?.type === 'Identifier') name = nameNode.name as string
      else if (nameNode?.type === 'TSQualifiedName') {
        // namespaced like `Foo.Bar` — keep as-is for now
        name = `${nameNode.left?.name ?? ''}.${nameNode.right?.name ?? ''}`
      }
      const params = node.typeArguments?.params as AnyNode[] | undefined
      const args = params ? params.map((p) => parseTypeAnnotation(p, ctx)) : []
      return { kind: 'typeRef', name, args }
    }
    case 'TSFunctionType': {
      // `(a: T, b: U) => R` — capture each parameter's name + type,
      // and the return type. Names are kept in IR for debug + future
      // use; Swift / Kotlin function types are positional, so the
      // emitter drops names at emit time.
      const params = ((node.params as AnyNode[]) ?? []).map((p) => {
        const annotation = p.typeAnnotation?.typeAnnotation as AnyNode | undefined
        const type: TypeIR = annotation
          ? parseTypeAnnotation(annotation, ctx)
          : { kind: 'unknown' }
        // Omit `name` when absent — `exactOptionalPropertyTypes` disallows
        // `name: undefined` for an optional property.
        const paramName: string | undefined =
          p.type === 'Identifier' ? (p.name as string | undefined) : undefined
        return paramName !== undefined ? { name: paramName, type } : { type }
      })
      const returnAnnotation = node.returnType?.typeAnnotation as AnyNode | undefined
      const returnType: TypeIR = returnAnnotation
        ? parseTypeAnnotation(returnAnnotation, ctx)
        : { kind: 'unknown' }
      return { kind: 'function', params, returnType }
    }
    case 'TSLiteralType': {
      // String / numeric / boolean literal types — `'a' | 'b' | 'c'`
      // unions are common. Degrade the literal to its base type so the
      // union collapse produces something usable per target.
      //
      // oxc emits the literal child as type 'Literal' with the value
      // carrying the JS-level type. Walk the `value` field to discriminate.
      const lit = node.literal as AnyNode | undefined
      if (!lit) return { kind: 'unknown' }
      if (typeof lit.value === 'string') return { kind: 'string' }
      if (typeof lit.value === 'number') return { kind: 'number' }
      if (typeof lit.value === 'boolean') return { kind: 'boolean' }
      return { kind: 'unknown' }
    }
    default:
      ctx.warnings.push(`Unknown type annotation: ${node.type}.`)
      return { kind: 'unknown' }
  }
}

function parseExpr(node: AnyNode, ctx: ParseCtx): ExprIR {
  switch (node.type) {
    case 'Literal':
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
      return { kind: 'literal', value: node.value }
    case 'Identifier':
      return { kind: 'identifier', name: node.name as string }
    case 'CallExpression': {
      const callee = parseExpr(node.callee, ctx)
      const args = (node.arguments as AnyNode[]).map((a) => parseExpr(a, ctx))
      return { kind: 'call', callee, args }
    }
    case 'MemberExpression': {
      const object = parseExpr(node.object, ctx)
      const property = node.property?.name as string
      return { kind: 'member', object, property }
    }
    case 'BinaryExpression': {
      // Arithmetic operators (existing) + comparison/equality operators
      // (Parser-A slice). Pyreon source uses `===` / `!==` which evaluate
      // the same as `==` / `!=` for the value types signals carry; the
      // emitter coalesces to the native target's `==` / `!=`.
      const arith = ['+', '-', '*', '/', '%'] as const
      const compMap: Record<string, '==' | '!=' | '<' | '>' | '<=' | '>='> = {
        '===': '==',
        '!==': '!=',
        '==': '==',
        '!=': '!=',
        '<': '<',
        '>': '>',
        '<=': '<=',
        '>=': '>=',
      }
      const op = node.operator as string
      if ((arith as readonly string[]).includes(op)) {
        return {
          kind: 'binary',
          op: op as (typeof arith)[number],
          left: parseExpr(node.left, ctx),
          right: parseExpr(node.right, ctx),
        }
      }
      const compOp = compMap[op]
      if (compOp) {
        return {
          kind: 'comparison',
          op: compOp,
          left: parseExpr(node.left, ctx),
          right: parseExpr(node.right, ctx),
        }
      }
      ctx.warnings.push(`Unsupported binary operator: ${op}.`)
      return {
        kind: 'binary',
        op: '+',
        left: parseExpr(node.left, ctx),
        right: parseExpr(node.right, ctx),
      }
    }
    case 'UnaryExpression': {
      // Parser-B: `!t.done`, `-x`, `+x`. Both Swift and Kotlin accept
      // these as prefix unary verbatim. Other unary operators (`typeof`,
      // `void`, `delete`) don't have idiomatic native equivalents —
      // warn + degrade. `++` / `--` are UpdateExpression, not Unary.
      const known: ('!' | '-' | '+')[] = ['!', '-', '+']
      const op = node.operator as string
      if (!(known as readonly string[]).includes(op)) {
        ctx.warnings.push(`Unsupported unary operator: ${op}.`)
        return { kind: 'literal', value: '' }
      }
      return {
        kind: 'unary',
        op: op as '!' | '-' | '+',
        argument: parseExpr(node.argument, ctx),
      }
    }
    case 'LogicalExpression': {
      // Parser-C: `a && b`, `a || b`. Short-circuit semantics map
      // identically on Swift and Kotlin. `??` (nullish coalescing) is
      // also a LogicalExpression in oxc — defer; it needs target-
      // specific Optional handling.
      const knownLogical: ('&&' | '||')[] = ['&&', '||']
      const op = node.operator as string
      if (!(knownLogical as readonly string[]).includes(op)) {
        ctx.warnings.push(`Unsupported logical operator: ${op}.`)
        return { kind: 'literal', value: '' }
      }
      return {
        kind: 'logical',
        op: op as '&&' | '||',
        left: parseExpr(node.left, ctx),
        right: parseExpr(node.right, ctx),
      }
    }
    case 'SpreadElement': {
      // Array spread: `[...todos(), newTodo]`. Inside an ArrayExpression's
      // elements list, oxc emits SpreadElement entries. The emitter
      // pattern-matches array elements containing a single spread + N
      // literals to render as `target + [literals]` on Swift,
      // `target + listOf(literals)` on Kotlin (immutable concat).
      return { kind: 'spread', argument: parseExpr(node.argument, ctx) }
    }
    case 'ConditionalExpression': {
      // `cond ? a : b` — ternary. TodoMVC's toggle uses this in the
      // map callback: `t.id === id ? {...t, done: !t.done} : t`.
      return {
        kind: 'ternary',
        cond: parseExpr(node.test, ctx),
        then: parseExpr(node.consequent, ctx),
        otherwise: parseExpr(node.alternate, ctx),
      }
    }
    case 'UpdateExpression': {
      // `nextId++` (post) or `++nextId` (pre). Used by TodoMVC's
      // addTodo in the array-literal id assignment. JS post-increment
      // returns the OLD value while side-effect-incrementing; the
      // emit degrades to `x + 1` for the value (Swift / Kotlin
      // `@State` / `var` don't support `++` in expression position),
      // losing the side-effect.
      const op = node.operator as '++' | '--'
      if (op !== '++' && op !== '--') {
        ctx.warnings.push(`Unsupported update operator: ${op}.`)
        return { kind: 'literal', value: 0 }
      }
      return { kind: 'update', op, argument: parseExpr(node.argument, ctx) }
    }
    case 'ArrowFunctionExpression': {
      const params = (node.params as AnyNode[])
        .filter((p) => p.type === 'Identifier')
        .map((p) => p.name as string)
      const body = node.body
      const isExpressionBody = body.type !== 'BlockStatement'
      if (isExpressionBody) {
        return { kind: 'arrow', params, body: parseExpr(body, ctx) }
      }
      // Block body — pull out the single return / expression statement.
      // For Phase 0 we only handle event-handler shapes: `() => count.set(...)`.
      const stmts = body.body as AnyNode[]
      const expressionStmt = stmts.find(
        (s) => s.type === 'ExpressionStatement' || s.type === 'ReturnStatement',
      )
      if (!expressionStmt) {
        ctx.warnings.push('Arrow body had no expression/return statement.')
        return { kind: 'arrow', params, body: { kind: 'literal', value: '' } }
      }
      const inner =
        expressionStmt.type === 'ReturnStatement' ? expressionStmt.argument : expressionStmt.expression
      return { kind: 'arrow', params, body: parseExpr(inner, ctx) }
    }
    case 'ArrayExpression': {
      const elements = (node.elements as AnyNode[]).map((e) => parseExpr(e, ctx))
      return { kind: 'array', elements }
    }
    case 'ObjectExpression': {
      // G4: ObjectExpression carries both regular fields (`a: 1`) AND
      // spread members (`...x`) in `properties`. The parser previously
      // filtered out spreads silently — the partial-update idiom
      // `{ ...t, done: !t.done }` lost the spread data, leaving emit
      // targets unable to produce correct copy-with-overrides shapes.
      const properties = node.properties as AnyNode[]
      const fields: { name: string; value: ExprIR }[] = []
      const spreads: ExprIR[] = []
      for (const p of properties) {
        if (p.type === 'Property' && p.key?.name) {
          fields.push({ name: p.key.name as string, value: parseExpr(p.value, ctx) })
        } else if (p.type === 'SpreadElement') {
          spreads.push(parseExpr(p.argument, ctx))
        }
      }
      return spreads.length > 0
        ? { kind: 'object', fields, spreads }
        : { kind: 'object', fields }
    }
    case 'ParenthesizedExpression': {
      // Parens around JSX in source (`return (<X>...)`) are syntactic
      // grouping for readability — they carry no semantic weight. Drop
      // the wrap when the inner is JSX so the emitter doesn't produce
      // `(ForEach …)` / `(if …)` parens in target output.
      const inner = parseExpr(node.expression, ctx)
      if (inner.kind === 'jsx-element' || inner.kind === 'jsx-fragment') return inner
      return { kind: 'paren', inner }
    }
    case 'JSXElement':
      return parseJsxElement(node, ctx)
    case 'JSXFragment': {
      const children = (node.children as AnyNode[])
        .map((c) => parseJsxChild(c, ctx))
        .filter((c): c is ChildIR => c !== null)
      return { kind: 'jsx-fragment', children }
    }
    default:
      ctx.warnings.push(`Unsupported expression: ${node.type}.`)
      return { kind: 'literal', value: '' }
  }
}

function parseJsxElement(node: AnyNode, ctx: ParseCtx): ExprIR {
  const opening = node.openingElement
  const tagNode = opening.name
  let tag = 'unknown'
  if (tagNode.type === 'JSXIdentifier') tag = tagNode.name as string
  else if (tagNode.type === 'JSXMemberExpression') {
    tag = `${tagNode.object.name}.${tagNode.property.name}`
  }

  const attrs: AttrIR[] = []
  for (const attr of opening.attributes as AnyNode[]) {
    const ir = parseJsxAttr(attr, ctx)
    if (ir) attrs.push(ir)
  }

  const children: ChildIR[] = []
  for (const child of (node.children as AnyNode[]) ?? []) {
    const ir = parseJsxChild(child, ctx)
    if (ir) children.push(ir)
  }

  return { kind: 'jsx-element', tag, attrs, children }
}

function parseJsxAttr(node: AnyNode, ctx: ParseCtx): AttrIR | null {
  if (node.type !== 'JSXAttribute' || !node.name?.name) return null
  const rawName = node.name.name as string
  const value = node.value

  const exprValue: ExprIR =
    value?.type === 'JSXExpressionContainer'
      ? parseExpr(value.expression, ctx)
      : value?.type === 'Literal' || value?.type === 'StringLiteral'
        ? { kind: 'literal', value: value.value }
        : { kind: 'literal', value: true }

  if (rawName.startsWith('on') && rawName.length > 2 && rawName[2]! >= 'A' && rawName[2]! <= 'Z') {
    return { kind: 'event', name: rawName.slice(2).toLowerCase(), handler: exprValue }
  }
  return { kind: 'attr', name: rawName, value: exprValue }
}

function parseJsxChild(node: AnyNode, ctx: ParseCtx): ChildIR | null {
  if (node.type === 'JSXText') {
    // JSX whitespace handling per Babel / React convention:
    //
    //   - JSXText that's ALL whitespace + newlines is dropped
    //   - Multi-line text (formatted JSX with newlines between tags)
    //     collapses whitespace + trims edges — that's just layout
    //     whitespace, not content
    //   - Single-line text preserves whitespace AS-IS — including
    //     the trailing space in `<Text>Count: {count}</Text>` before
    //     the `{count}` expression. Without this, the emit produced
    //     `Text("Count:\(count)")` instead of `"Count: \(count)"`.
    //
    // The naive pre-PR-9 `.trim()` was correct for layout whitespace
    // but wrong for content-adjacent whitespace.
    const raw = node.value as string
    if (!/\S/.test(raw)) return null
    const v = /\n/.test(raw) ? raw.replace(/\s+/g, ' ').trim() : raw
    if (v === '') return null
    return { kind: 'text', value: v }
  }
  if (node.type === 'JSXExpressionContainer') {
    return { kind: 'expr', expr: parseExpr(node.expression, ctx) }
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return { kind: 'expr', expr: parseExpr(node, ctx) }
  }
  return null
}

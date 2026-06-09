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
  ModelDefnIR,
  ModuleDeclIR,
  ParseResult,
  RouteIR,
  StatementIR,
  StoreDefnIR,
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
  const stores: StoreDefnIR[] = []
  const models: ModelDefnIR[] = []

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
    // Gap 4 Strategy-B v1: `const useFoo = defineStore("foo", () => ...)`
    // detected at top-level scope and extracted as a StoreDefnIR.
    // The setup body's signal decls become fields on the emitted
    // singleton class. Tracked separately from moduleDecls because
    // the emit shape (class declaration at file scope, vs `var`/`let`
    // binding) is different.
    const sd = tryStoreDefnFromTopLevel(node, ctx)
    if (sd) {
      stores.push(sd)
      // Don't fall through to tryModuleDeclsFromTopLevel — the
      // defineStore call would otherwise also be parsed as a bare
      // module-level binding with an unresolved initializer.
      continue
    }
    // Gap 4 follow-up v2 — state-tree model. `const counter =
    // model({ state: { ... } }).create()` extracted as ModelDefnIR.
    // Emits a PyreonModel_<id> class at module scope + @State /
    // remember binding inside the consuming component.
    const md = tryModelDefnFromTopLevel(node, ctx)
    if (md) {
      models.push(md)
      continue
    }
    // Phase 2 follow-up: module-level mutable / immutable bindings.
    // `let nextId = 1`, `const APP_VERSION = '1.0.0'` etc. Closes the
    // TodoMVC `nextId undefined` typecheck blocker by emitting these
    // at file scope on the target.
    const mds = tryModuleDeclsFromTopLevel(node, ctx)
    if (mds) moduleDecls.push(...mds)
  }

  return { components, enums, structs, moduleDecls, stores, models, warnings: ctx.warnings }
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
/**
 * Gap 4 Strategy-B v1 — detect `const useFoo = defineStore("foo", () => { ... })`
 * at top-level scope and extract a StoreDefnIR.
 *
 * Bounded scope:
 *   - Setup body: ONLY `const X = signal(...)` declarations
 *   - Returned object: ONLY shorthand keys naming local signals
 *
 * Any other shape (computed in body, function in body, expression
 * keys in return, non-object return) falls through to null — the
 * top-level binding is then parsed as a regular moduleDecl (which
 * will currently emit a warning since the defineStore call isn't
 * recognized as a regular signal/etc; the silent-drop diagnostic
 * from #1444 covers that).
 */
function tryStoreDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): StoreDefnIR | null {
  // Walk through ExportNamedDeclaration to the VariableDeclaration.
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration') {
    varDecl = node
  } else if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  }
  if (!varDecl) return null

  // Expect a single `const X = ...` declarator.
  if (varDecl.kind !== 'const') return null
  const decls = (varDecl.declarations as AnyNode[]) ?? []
  if (decls.length !== 1) return null
  const decl = decls[0]
  if (!decl) return null
  if (decl.id?.type !== 'Identifier') return null
  const hookName = decl.id.name as string

  // Init must be a CallExpression to the bare identifier `defineStore`.
  const init = decl.init
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'defineStore') return null

  // Arg 1: string literal id.
  const args = (init.arguments as AnyNode[]) ?? []
  if (args.length < 2) return null
  const idArg = args[0]
  if (
    idArg?.type !== 'Literal' ||
    typeof idArg.value !== 'string'
  ) {
    ctx.warnings.push(
      `defineStore declaration \`${hookName}\`: first argument must be a string literal id. Falling back to silent-drop.`,
    )
    return null
  }
  const storeId = idArg.value

  // Arg 2: arrow function with a block body returning an object literal.
  const setup = args[1]
  if (
    setup?.type !== 'ArrowFunctionExpression' &&
    setup?.type !== 'FunctionExpression'
  ) {
    ctx.warnings.push(
      `defineStore \`${hookName}\`: setup argument must be a function expression. Falling back to silent-drop.`,
    )
    return null
  }
  const body = setup.body as AnyNode
  // Two shapes: BlockStatement with return, or expression body (`() => ({...})`)
  let returnObj: AnyNode | undefined
  const signalDecls: { name: string; type: TypeIR; initial: ExprIR }[] = []

  if (body?.type === 'BlockStatement') {
    const stmts = (body.body as AnyNode[]) ?? []
    let returnFound = false
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const') {
        // Extract `const X = signal(...)` decls.
        for (const d of (stmt.declarations as AnyNode[]) ?? []) {
          if (d.id?.type !== 'Identifier') continue
          const name = d.id.name as string
          const sigCall = d.init
          if (sigCall?.type !== 'CallExpression') continue
          if ((sigCall.callee?.name as string | undefined) !== 'signal') continue
          // Pull the initial value + type generic if present.
          const sigArgs = (sigCall.arguments as AnyNode[]) ?? []
          const initialNode = sigArgs[0]
          const initial: ExprIR = initialNode
            ? parseExpr(initialNode, ctx)
            : { kind: 'literal', value: 0 }
          // Infer type from generic OR initial value. `parseGenericTypeArg`
          // returns `{kind:'unknown'}` (not undefined) when no generic is
          // present, so we check for the unknown sentinel + fall back.
          const generic = parseGenericTypeArg(sigCall, ctx)
          const inferredType: TypeIR =
            generic.kind === 'unknown' ? inferTypeFromInitial(initial) : generic
          signalDecls.push({ name, type: inferredType, initial })
        }
      } else if (stmt.type === 'ReturnStatement') {
        returnObj = stmt.argument as AnyNode | undefined
        returnFound = true
        break
      } else {
        // Unsupported statement in setup body — bail with warning.
        ctx.warnings.push(
          `defineStore \`${hookName}\`: v1 supports ONLY \`const X = signal(...)\` decls in the setup body; saw \`${stmt.type}\`. Falling back to silent-drop.`,
        )
        return null
      }
    }
    if (!returnFound || !returnObj) {
      ctx.warnings.push(
        `defineStore \`${hookName}\`: setup function must return an object literal of signals.`,
      )
      return null
    }
  } else if (body?.type === 'ObjectExpression') {
    // Arrow body shape: `() => ({ ... })` — no signal decls possible
    // (no statements); only object literal whose values are inline
    // signal calls. Out of v1 scope — declare via the block-body form.
    ctx.warnings.push(
      `defineStore \`${hookName}\`: v1 requires the block-body form \`() => { const x = signal(...); return { x } }\`, not the expression-body form. Falling back to silent-drop.`,
    )
    return null
  } else {
    return null
  }

  // Unwrap optional parentheses on the return object.
  let unwrapped = returnObj
  while (unwrapped?.type === 'ParenthesizedExpression') {
    unwrapped = unwrapped.expression as AnyNode
  }
  if (unwrapped?.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `defineStore \`${hookName}\`: setup must return an object literal.`,
    )
    return null
  }

  // Validate the returned keys all match declared signal names.
  // Shorthand-only: `return { count, name }` — same identifier on both sides.
  const declaredNames = new Set(signalDecls.map((s) => s.name))
  const returnedNames: string[] = []
  for (const prop of (unwrapped.properties as AnyNode[]) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (prop.shorthand !== true) {
      ctx.warnings.push(
        `defineStore \`${hookName}\`: v1 supports ONLY shorthand keys in the returned object (\`return { x, y }\`, not \`return { x: x }\`).`,
      )
      return null
    }
    if (prop.key?.type !== 'Identifier') continue
    const k = prop.key.name as string
    if (!declaredNames.has(k)) {
      ctx.warnings.push(
        `defineStore \`${hookName}\`: returned key \`${k}\` doesn't match any local signal decl.`,
      )
      return null
    }
    returnedNames.push(k)
  }
  // Only keep fields that are EXPORTED in the return object.
  const exportedFields = signalDecls.filter((s) => returnedNames.includes(s.name))

  return { hookName, storeId, fields: exportedFields }
}

/**
 * Gap 4 follow-up v2 — `@pyreon/state-tree` `model({ state }).create()`
 * top-level recognizer. Extracts the literal initial state into a
 * `ModelDefnIR` so the emit pipeline can produce a per-model class
 * AT MODULE SCOPE plus a `@State` / `remember` binding.
 *
 * Shape (v2):
 *   const counter = model({
 *     state: { count: 0, label: 'counter' },
 *   }).create()
 *
 * Deferred:
 *   - actions / views
 *   - `.create(initialOverride)`
 *   - `.asHook(id)`
 *   - non-literal state values (computed defaults)
 *   - two-step shape `const Counter = model({...}); const c = Counter.create()`
 *
 * Bails (returns null + warning) when the chain doesn't match the
 * v2 shape — silent-drop falls through to the tier2 diagnostic.
 */
function tryModelDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): ModelDefnIR | null {
  // ExportNamedDeclaration → VariableDeclaration → VariableDeclarator
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
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const instanceName = declarator.id.name as string

  // RHS must be a CallExpression whose callee is `model({...}).create`.
  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const createCallee = init.callee as AnyNode | undefined
  if (createCallee?.type !== 'MemberExpression') return null
  if (createCallee.property?.type !== 'Identifier') return null
  if ((createCallee.property.name as string) !== 'create') return null
  // .create() must be called on a `model({...})` call.
  const modelCall = createCallee.object as AnyNode | undefined
  if (modelCall?.type !== 'CallExpression') return null
  if (modelCall.callee?.type !== 'Identifier') return null
  if ((modelCall.callee.name as string) !== 'model') return null

  const configArg = (modelCall.arguments as AnyNode[] | undefined)?.[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: model() config argument is not an object literal — v2 emit needs the literal { state: { ... } } shape. Falling back to silent-drop.`,
    )
    return null
  }

  // Locate the `state: { ... }` property.
  let stateNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (keyName === 'state') {
      stateNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    }
    // `actions`, `views` keys deliberately ignored in v2.
  }

  if (!stateNode || stateNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: \`state\` field is missing or not an object literal — required by v2 emit. Falling back to silent-drop.`,
    )
    return null
  }

  // Extract literal state fields { name, type, initial }.
  const fields: ModelDefnIR['fields'] = []
  for (const entry of (stateNode.properties as AnyNode[] | undefined) ?? []) {
    if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
    const eKey = entry.key as AnyNode | undefined
    const fieldName =
      eKey?.type === 'Identifier'
        ? (eKey.name as string)
        : eKey?.type === 'Literal'
          ? String(eKey.value)
          : undefined
    if (!fieldName) continue
    const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
    if (eVal?.type !== 'Literal') {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a literal value — v2 emit only supports string / number / boolean literals. Silently dropping this field.`,
      )
      continue
    }
    const v = eVal.value
    if (typeof v === 'string') {
      fields.push({ name: fieldName, type: 'string', initial: v })
    } else if (typeof v === 'number') {
      fields.push({ name: fieldName, type: 'number', initial: v })
    } else if (typeof v === 'boolean') {
      fields.push({ name: fieldName, type: 'boolean', initial: v })
    } else {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a string / number / boolean literal. Silently dropping.`,
      )
    }
  }

  if (fields.length === 0) {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: no recognizable state fields. Falling back to silent-drop.`,
    )
    return null
  }

  return { instanceName, modelId: instanceName, fields }
}

/** Tiny initial-value type inference for store signals.
 *  Matches the inference contract `tryDeclFromVarDeclarator` uses
 *  for component-scope signals. */
function inferTypeFromInitial(initial: ExprIR): TypeIR {
  if (initial.kind === 'literal') {
    if (typeof initial.value === 'number') return { kind: 'number' }
    if (typeof initial.value === 'string') return { kind: 'string' }
    if (typeof initial.value === 'boolean') return { kind: 'boolean' }
  }
  return { kind: 'unknown' }
}

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

  // Round-3 audit fix: an untyped `props` parameter (no `: { … }`
  // annotation) means `props` array stays empty. Member rewrites for
  // `props.X` references inside the body silently fail — the rewriter
  // doesn't know which props exist and which type each has. The
  // typecheck stays green on the TS side (TS accepts `function App(props)`
  // as `props: any`), but native emit produces unbound references that
  // `swiftc` / `kotlinc` reject with cryptic errors. Surface it loud at
  // the parser layer so the diagnostic names the component. Skips
  // bodies that never reference the param (legitimate no-props shape).
  warnIfUntypedPropsParam(name, fn.params as AnyNode[] | undefined, propsParamName, body, ctx)

  const decls: DeclIR[] = []
  let returnExpr: ExprIR | null = null

  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration') {
      for (const declarator of stmt.declarations as AnyNode[]) {
        const decl = tryDeclFromVarDeclarator(declarator, ctx)
        if (decl) decls.push(decl)
      }
    } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
      // Round-1 audit fix: previously the body walker only handled
      // `const fn = () => …`. The function-declaration form
      // `function del() {}` was silently dropped — the decl never
      // landed in `_functionNames`, so later `del()` calls in event
      // handlers emitted as `{ del }` (closure RETURNING the function
      // reference) instead of `{ del() }`. Same shape, same emit,
      // same fix as the const-arrow form via tryFunctionDecl (which
      // already accepts both shapes since FunctionDeclaration carries
      // the same `.params` / `.returnType` / `.body` API).
      const fnName = stmt.id.name as string
      const decl = tryFunctionDecl(fnName, stmt, ctx)
      if (decl) decls.push(decl)
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

/**
 * Round-3 audit fix: warn when a component declares a `props` parameter
 * without a type annotation. The parser captures `propsParamName` so
 * `props.X` member rewrites STRUCTURALLY work, but with no fields
 * extracted from the (missing) annotation the rewriter silently drops
 * everything — `props.title` references compile to unbound identifiers
 * on the native side.
 *
 * Fires only when:
 *   - the first param IS named `props` (or any identifier) — the
 *     conventional component shape; destructured params would already
 *     bail earlier and need a different fix
 *   - there's NO type annotation on the parameter
 *   - the parser captured the parameter name (so the omission isn't an
 *     unrelated bail like "no params")
 *   - the body actually references `<paramName>.X` somewhere reachable
 *     (closure / event handler / JSX expression — all count). A
 *     component with NO `props.X` reference at all is the legitimate
 *     no-props shape; warning there would be a false positive.
 *
 * Body scan: stack-based walker (no recursion) iterating every node's
 * own properties for any `MemberExpression` whose `object` is an
 * `Identifier` matching the param. TS type-only layers (`as any`,
 * `satisfies T`, `!`, parens) wrap the props identifier but their
 * inner `MemberExpression.object` still resolves to the same
 * Identifier — the walker hits them transparently because it descends
 * into every child property. A literal `(props as any).whatever`
 * therefore DOES fire (the silent-drop problem is identical when the
 * field name can't be enumerated against an annotation).
 */
function warnIfUntypedPropsParam(
  componentName: string,
  params: AnyNode[] | undefined,
  propsParamName: string | undefined,
  body: AnyNode[] | undefined,
  ctx: ParseCtx,
): void {
  if (!params || params.length === 0 || !propsParamName) return
  const firstParam = params[0]
  if (firstParam?.type !== 'Identifier') return
  // Annotated → handled by parseProps. Only the no-annotation shape is
  // the silent-drop case we warn about here.
  if (firstParam.typeAnnotation) return
  // Body never references `<propsParamName>.X` → legitimate no-props
  // shape, suppress the warning.
  if (!body || !bodyReferencesPropsParam(body, propsParamName)) return
  ctx.warnings.push(
    `Component ${componentName} has an untyped \`${propsParamName}\` parameter — type-annotate it (e.g. \`function ${componentName}(${propsParamName}: { title: string })\`) so PMTC can rewrite \`${propsParamName}.X\` references. Without the annotation, the parser cannot enumerate fields and member accesses silently drop.`,
  )
}

/**
 * Stack-based walker over a function body. Returns true if any
 * `MemberExpression` exists whose `object` (after unwrapping TS
 * type-only layers + parens) is an `Identifier` with name === paramName.
 * Descends into every child property regardless of node type —
 * closures, JSX expressions, conditionals all count as "reachable" by
 * design: the rewriter would emit unbound references for `props.X`
 * inside any of them. No new dep; uses a worklist to avoid recursion.
 *
 * Unwrap shapes recognised at the MemberExpression's object slot:
 *   - `ParenthesizedExpression` (`(props).x`)
 *   - `TSAsExpression`          (`(props as any).x` — common escape hatch)
 *   - `TSSatisfiesExpression`   (`(props satisfies X).x`)
 *   - `TSNonNullExpression`     (`props!.x`)
 *   - `TSTypeAssertion`         (`(<any>props).x` — legacy form)
 * Each layer carries its inner expression on `.expression`. Composes:
 * `((props as any) satisfies Y).x` reaches the bare `Identifier`.
 */
function bodyReferencesPropsParam(body: AnyNode[], paramName: string): boolean {
  const worklist: AnyNode[] = [...body]
  while (worklist.length > 0) {
    const node = worklist.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'MemberExpression') {
      const root = unwrapTypeLayers(node.object)
      if (root?.type === 'Identifier' && root.name === paramName) {
        return true
      }
    }
    // Push every child node value onto the worklist. AST nodes carry
    // their children in own enumerable properties — arrays of nodes
    // (e.g. `body`, `arguments`, `params`) AND single-node properties
    // (e.g. `object`, `argument`, `expression`). Primitive values
    // (strings, numbers, booleans) are skipped by the typeof guard at
    // the top of the loop.
    for (const key in node) {
      // Skip the `type` discriminator + oxc's position fields — none
      // carry child AST nodes, and skipping them saves work.
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') {
        continue
      }
      const value = node[key]
      if (Array.isArray(value)) {
        for (const item of value) worklist.push(item)
      } else if (value && typeof value === 'object') {
        worklist.push(value)
      }
    }
  }
  return false
}

/** Strip TS type-only wrappers + parens to reach the underlying expression. */
function unwrapTypeLayers(node: AnyNode | undefined): AnyNode | undefined {
  let current = node
  while (
    current &&
    (current.type === 'ParenthesizedExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSTypeAssertion')
  ) {
    current = current.expression
  }
  return current
}

/** Try to extract a signal / computed / function declaration from a `const x = …`. */
function tryDeclFromVarDeclarator(node: AnyNode, ctx: ParseCtx): DeclIR | null {
  const init = node.init as AnyNode | undefined
  // Round-3 audit fix: `const { copy, copied } = useClipboard()` is the
  // documented destructure form, but the parser ONLY supports the
  // single-binding shape today (`const cb = useClipboard()`). Pre-fix
  // the destructure form silently produced ZERO decl — the rewriter
  // dropped every `copy` / `copied` reference downstream with no
  // diagnostic, leaving authors confused about why their clipboard
  // code was inert. Warn at the destructure site so the path forward
  // is obvious.
  if (
    node.id?.type === 'ObjectPattern' &&
    init?.type === 'CallExpression' &&
    (init.callee?.name as string | undefined) === 'useClipboard'
  ) {
    ctx.warnings.push(
      'useClipboard() destructure form (`const { copy, copied } = useClipboard()`) is not yet supported on native — use the single-binding shape `const cb = useClipboard(); cb.copy(...)` / `cb.copied()` instead. The destructure shape silently produces no declaration and downstream references emit unbound. Tracked as a Phase-4 follow-up.',
    )
    return null
  }
  // Gap 4 PR-3 (2026-06-05 audit) — Strategy-B port for
  // `@pyreon/i18n/core`. `const i18n = createI18n({ locale, messages,
  // fallbackLocale? })` becomes a PyreonI18n reactive container; the
  // runtime port defines `t(key)`. Runs BEFORE the Tier-2 silent-drop
  // diagnostic block so `createI18n` is recognized as a real port.
  const i18nDecl = tryDeclFromCreateI18n(node, ctx)
  if (i18nDecl) return i18nDecl

  // Gap 4 PR-2 (2026-06-05 audit) — full Strategy-B port for
  // `@pyreon/machine`. `const m = createMachine({ initial, states })`
  // becomes a PyreonMachine reactive container; method calls
  // (`.send`/`.matches`/`.can`/`.nextEvents`) flow through unchanged
  // because the runtime port defines them. `m()` read-current-state
  // also works unchanged via Swift `callAsFunction()` / Kotlin
  // `operator fun invoke()`. Runs BEFORE the Tier-2 silent-drop
  // diagnostic block so `createMachine` is recognized as a real port
  // (no warning fires).
  const machineDecl = tryDeclFromCreateMachine(node, ctx)
  if (machineDecl) return machineDecl

  // Tier-2 silent-drop diagnostics from #1444 (Gap 4 PR-1) — kept for
  // the remaining 3 callees. `createI18n` and `createMachine` were
  // REMOVED from the list because they now have full ports via
  // tryDeclFromCreateI18n / tryDeclFromCreateMachine above.
  if (init?.type === 'CallExpression') {
    const calleeName = init.callee?.name as string | undefined
    const tier2StrategyB: Record<string, string> = {
      defineStore: '@pyreon/store',
      // `@pyreon/state-tree`'s public export is `model`, not
      // `createModel`. Earlier audit doc + diagnostic used the wrong
      // name → silent-drop never fired against real user code. Fixed
      // in Gap 4 follow-up (state-tree foundation PR).
      model: '@pyreon/state-tree',
      defineFeature: '@pyreon/feature',
    }
    if (calleeName && calleeName in tier2StrategyB) {
      const pkg = tier2StrategyB[calleeName]
      const bindingName =
        node.id?.type === 'Identifier'
          ? (node.id.name as string)
          : '(destructured)'
      ctx.warnings.push(
        `${calleeName}() declared (${pkg}, binding: \`${bindingName}\`) — Tier-2 package on native: parser ` +
          `recognition + runtime port not yet shipped. Setup function will not run on iOS/Android; downstream ` +
          `uses of \`${bindingName}\` emit as unresolved references and may fail swiftc/kotlinc validation. ` +
          `Use a per-target adapter (Layer 4: <NativeIOS> / <NativeAndroid>) to provide the same surface natively, ` +
          `or keep this code in a \`<Web>\`-only branch. Tracked in audit Gap 4; see ` +
          `docs/src/content/docs/multiplatform-libraries.md → "Tier 2 — pure-logic packages."`,
      )
      return null
    }
  }
  // Native readiness audit (2026-06, CRIT-4): `const data = useLoaderData<T>()`
  // is currently DROPPED on both targets — PMTC has no emit branch, AND
  // there's no diagnostic. The runtime `setLoaderData()` infrastructure
  // ships on PyreonRouter (Swift + Kotlin), but the loader auto-emit
  // that would WIRE a component-level `useLoaderData<T>()` call to it
  // is deferred — see docs/src/content/docs/multiplatform.md "Loader auto-emit is
  // intentionally deferred, not forgotten." A developer writing the
  // call gets a silent-drop: data signal is never populated, component
  // renders with undefined, no compile error, no runtime error. Warn
  // at the call site naming the binding so the path forward is obvious.
  //
  // Two shapes covered:
  //   (a) `const data = useLoaderData<User>()`  — Identifier binding
  //   (b) `const { user } = useLoaderData<{ user: User }>()` — destructure
  //       (also unsupported until loader auto-emit lands)
  if (init?.type === 'CallExpression') {
    const callee = init.callee?.name as string | undefined
    if (callee === 'useLoaderData') {
      // Phase B6 (native readiness audit): `const data = useLoaderData<T>()`
      // now emits READ-ONLY (was silent-drop pre-B6). The Identifier shape
      // emits a binding that reads the runtime container's loaderData entry
      // for the current path, type-cast to T. Auto-loader emit (firing
      // route.loader on navigation) remains future work — the warning
      // below names this gap so authors aren't surprised when their
      // useLoaderData hook stays `nil`/`null` without a host-side
      // setLoaderData() call.
      //
      // Destructure shape (`const { x } = useLoaderData<T>()`) STILL
      // silent-drops — the runtime read returns an OPAQUE T?, not a
      // shape the destructure can pattern-match against without
      // type-knowledge of T's fields. That's bigger Phase B+ work.
      const isIdentifier = node.id?.type === 'Identifier'
      const isObjectPattern = node.id?.type === 'ObjectPattern'

      // Both shapes warn. Identifier softens to "emit ships read-only,
      // auto-loader follow-up needed"; destructure keeps the original
      // silent-drop warning because the shape genuinely doesn't emit.
      const bindingDesc = isIdentifier
        ? `\`const ${node.id?.name as string} = useLoaderData<T>()\``
        : isObjectPattern
          ? '`const { ... } = useLoaderData<T>()`'
          : '`useLoaderData<T>()`'

      if (isIdentifier) {
        ctx.warnings.push(
          `useLoaderData<T>() declared (${bindingDesc}) — PMTC ships READ-ONLY emit (Phase B6): the binding reads PyreonRouter.loaderData[currentPath] cast to T. Auto-loader emit (firing a route's \`loader\` on navigation) is future work — populate loaderData via the runtime container's \`setLoaderData(path, value)\` method from your native host code today. Reference: docs/src/content/docs/multiplatform.md → "Loader auto-emit is intentionally deferred, not forgotten."`,
        )
        // Phase B6 IR — capture name + type generic. The emit reads
        // PyreonRouter.loaderData[currentPath] cast to T at the
        // declaration site (read-only).
        const name = node.id?.name as string
        const type = parseGenericTypeArg(init, ctx)
        return { kind: 'useLoaderData', name, type }
      }

      // Destructure (and other non-Identifier shapes) keep the original
      // silent-drop behavior + warning. Phase B6+ work would unwrap a
      // destructure against a known type — bigger scope.
      ctx.warnings.push(
        `useLoaderData<T>() declared (${bindingDesc}) — destructure form not yet emitted on native targets. Use the single-binding shape \`const data = useLoaderData<T>(); …data.x\` instead. Tracked as Phase B+ follow-up.`,
      )
      return null
    }
  }
  // `const { id } = useParams()` / `const { id: userId } = useParams<{...}>()`
  // — destructured router params. The ObjectPattern id has no `.name`, so this
  // must run BEFORE the name-based bail below (otherwise the decl is silently
  // dropped and the destructured locals reference undeclared identifiers).
  if (
    node.id?.type === 'ObjectPattern' &&
    init?.type === 'CallExpression' &&
    (init.callee?.name as string | undefined) === 'useParams'
  ) {
    const params: { key: string; local: string }[] = []
    for (const prop of (node.id.properties as AnyNode[] | undefined) ?? []) {
      if (prop?.type !== 'Property') continue
      const key = prop.key?.type === 'Identifier' ? (prop.key.name as string) : undefined
      const local =
        prop.value?.type === 'Identifier' ? (prop.value.name as string) : key
      if (key !== undefined && local !== undefined) params.push({ key, local })
    }
    return params.length > 0 ? { kind: 'params-destructure', params } : null
  }
  const name = node.id?.name as string | undefined
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

  // RX-1 — `@pyreon/rx` namespace lowering. Source like
  //   const active = rx.filter(todos, t => !t.done)
  //   const top5   = rx.take(active, 5)
  //   const cnt    = rx.count(active)
  // PMTC's recognition list previously knew only top-level callee names
  // (`signal`, `useStorage`, …). `rx.METHOD(...)` is a MemberExpression
  // callee, so the previous code path treated the whole declaration as
  // an unknown CallExpression and silently dropped it from emit (see
  // PR #1317's `tier2-rx-silent-drop.test.ts` regression-lock).
  //
  // This block recognises the `rx.*` namespace and rewrites each
  // supported method into the equivalent expression on the underlying
  // signal-carried collection — `rx.filter(s, p)` becomes a `computed`
  // whose body is `s().filter(p)`. The native collection methods on
  // Swift `[T]` and Kotlin `List<T>` carry identical names for the
  // v1 set (`filter` / `map` / `reverse`); per-method per-target
  // dispatch for the divergent set (`count`/`size`, `take`/`prefix`,
  // `every`/`allSatisfy`, …) is the immediate follow-up — the existing
  // computed-emit pipeline handles everything once the IR is built.
  //
  // Per-target compileability of the resulting emit is locked by the
  // hand-crafted proof in `docs/src/content/docs/multiplatform-libraries.md`
  // ("Compileability proof" — `swiftc -parse` + `kotlinc` both exit 0).
  const rxLowered = tryRxNamespaceLowering(name, init, ctx)
  if (rxLowered !== null) return rxLowered

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
  // Per-target emit lives in emitSwiftDecl / emitKotlinDecl. C5 extends
  // the createRouter case to extract the `routes` config array — the
  // native emit then produces real `.navigationDestination(for:)` /
  // `NavHost { composable(...) }` blocks instead of scaffold-only
  // instances. Conservative bail: a missing / non-literal / wrong-shape
  // routes arg → undefined `routes` → emit falls back to C4 bare-instance.
  if (calleeName === 'createRouter') {
    const routes = tryExtractRoutes(init.arguments?.[0], ctx)
    // Global guards — beforeEach / afterEach arrays on the router
    // config. Captures IDENTIFIER REFS only (conservative shape);
    // inline arrow bodies are dropped here, same as per-route
    // beforeEnter bails non-arrow-expression shapes.
    const beforeEach = tryExtractGuardRefArray(init.arguments?.[0], 'beforeEach')
    const afterEach = tryExtractGuardRefArray(init.arguments?.[0], 'afterEach')
    const decl: DeclIR = { kind: 'router', name }
    if (routes !== null) decl.routes = routes
    if (beforeEach.length > 0) decl.beforeEach = beforeEach
    if (afterEach.length > 0) decl.afterEach = afterEach
    return decl
  }
  if (calleeName === 'useNavigate') {
    return { kind: 'router-hook', name, hook: 'navigate' }
  }
  if (calleeName === 'useParams') {
    return { kind: 'router-hook', name, hook: 'params' }
  }
  // Phase 4 — `useFetch<T>('/url')`. The decoded result type comes from
  // the generic arg; the request path MUST be a string literal so it can
  // be baked into the emitted harness. Non-literal URLs (template strings,
  // identifiers) bail to undeclared — same conservative rule as useStorage.
  if (calleeName === 'useFetch') {
    const type = parseGenericTypeArg(init, ctx)
    const urlArg = init.arguments?.[0]
    if (
      !urlArg ||
      (urlArg.type !== 'Literal' && urlArg.type !== 'StringLiteral') ||
      typeof urlArg.value !== 'string'
    ) {
      ctx.warnings.push(
        `Declaration ${name}: useFetch url argument must be a string literal; got ${urlArg?.type ?? 'nothing'}.`,
      )
      return null
    }
    return { kind: 'fetch', name, type, url: urlArg.value }
  }
  // Phase 4.2 — `useForm({ initialValues })` from @pyreon/form. The config
  // arg is optional; when present we capture the string-keyed literal
  // `initialValues` to seed the native PyreonForm container. `onSubmit` /
  // `validators` are web-only function logic — ignored on native (submission
  // flows through the container's begin/endSubmit API). Always succeeds
  // (no bail): a bare `useForm()` or an unrecognised config shape yields an
  // empty `initialValues`, and the emit produces a default-constructed form.
  if (calleeName === 'useForm') {
    return { kind: 'form', name, initialValues: tryExtractFormInitialValues(init.arguments?.[0]) }
  }
  // Phase 4 — `useOnline()` from @pyreon/hooks → the PyreonNetworkStatus
  // reactive connectivity container. No arguments.
  if (calleeName === 'useOnline') {
    return { kind: 'network-status', name }
  }
  // Phase 4 — `usePermissions(['posts.edit', 'posts.*'])` from
  // @pyreon/permissions. The array of literal grant keys seeds the native
  // PyreonPermissions container. Always succeeds (no bail): a bare
  // `usePermissions()` or a non-literal arg yields an empty grant set and the
  // emit produces a default-constructed container.
  if (calleeName === 'usePermissions') {
    return { kind: 'permissions', name, grants: tryExtractStringArray(init.arguments?.[0]) }
  }
  // Phase 4 — `const clipboard = useClipboard()` from `@pyreon/hooks` →
  // the PyreonClipboard reactive wrapper. No arguments. V1 supports
  // the single-binding form only (the destructure shape
  // `const { copy, copied } = useClipboard()` is a documented
  // follow-up — needs the per-key rewrite that `params-destructure`
  // uses).
  if (calleeName === 'useClipboard') {
    return { kind: 'clipboard', name }
  }
  // Phase 4 — `const scheme = useColorScheme()` from `@pyreon/hooks`
  // → platform-native dark-mode read. No arguments. NO runtime port
  // needed — both SwiftUI (@Environment(\.colorScheme)) and Compose
  // (isSystemInDarkTheme()) ship the primitive. Emit returns the
  // same `"light" | "dark"` string shape the web hook uses.
  if (calleeName === 'useColorScheme') {
    return { kind: 'color-scheme', name }
  }
  return null
}

/**
 * v1 supported rx methods. Each name maps to per-target emit dispatch
 * in `emit-swift.ts` + `emit-kotlin.ts`. The list defines the closed
 * set; an unknown method name surfaces a directed warning and falls
 * through to the original silent-drop bug (strictly no regression vs
 * the original pre-RX-1 behaviour).
 *
 * v1 covers the full Strategy-A surface from the spec in
 * docs/src/content/docs/multiplatform-libraries.md — collection ops that lower to
 * native primitives on both Swift `[T]` and Kotlin `List<T>` without
 * a runtime port. The deferred set (`pipe` / `debounce` / `throttle`
 * / `combine` / `zip` / `merge` / `scan` / `distinct` / `search`)
 * carries state OR scheduling and needs Strategy B — runtime ports.
 *
 * Methods deliberately deferred from v1 (need bigger emit shapes):
 *   - `partition` (returns tuple)
 *   - `groupBy` / `keyBy` / `uniqBy` (key-extractor → dict)
 *   - `mapValues` (operates on dict, not list)
 *   - `sortBy` with string-key variant (needs cross-target key emit)
 *   - `sample` (RNG seeded per platform)
 *   - `chunk` (Swift needs stride-based slicing — verbose)
 */
const RX_V1_METHODS = new Set([
  'filter',
  'map',
  'reverse',
  'count',
  'sum',
  'min',
  'max',
  'first',
  'last',
  'take',
  'skip',
  'takeWhile',
  'dropWhile',
  'find',
  'some',
  'every',
  'unique',
  'compact',
  'flatten',
  'reduce',
  'average',
])

/**
 * RX — `@pyreon/rx` namespace lowering. See the long-form rationale at
 * the call site in `tryExtractDecl`.
 *
 * Detects `const name = rx.METHOD(signal, ...)` shapes and rewrites them
 * into a `computed` DeclIR whose body is a `kind: 'rx-call'` ExprIR.
 * The per-target emitters (`emit-swift.ts` / `emit-kotlin.ts`) dispatch
 * on the method name and produce idiomatic Swift / Kotlin native
 * collection calls.
 *
 * Returns `null` when:
 *   - the callee isn't a MemberExpression
 *   - the MemberExpression's object isn't a bare `rx` identifier
 *   - the rx method isn't in v1's supported set (warning fires)
 *   - the source argument is missing
 *
 * Null falls through to the existing `calleeName === 'signal' | ...`
 * recognition chain. Unknown methods get a directed warning instead of
 * the original silent-drop — strictly better than `main`.
 */
function tryRxNamespaceLowering(
  name: string,
  init: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const callee = init.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression') return null
  const obj = callee.object as AnyNode | undefined
  if (obj?.type !== 'Identifier' || (obj.name as string | undefined) !== 'rx') return null
  const prop = callee.property as AnyNode | undefined
  if (prop?.type !== 'Identifier') return null
  const methodName = prop.name as string | undefined
  if (!methodName) return null

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const sourceArg = args[0]
  if (!sourceArg) {
    ctx.warnings.push(
      `Declaration ${name}: rx.${methodName} requires a signal source as its first argument.`,
    )
    return null
  }
  if (!RX_V1_METHODS.has(methodName)) {
    ctx.warnings.push(
      `Declaration ${name}: rx.${methodName} is not yet lowered to native (v1 covers ${[...RX_V1_METHODS].join(' / ')}; remaining methods need Strategy B runtime ports — see docs/src/content/docs/multiplatform-libraries.md).`,
    )
    return null
  }

  // Build the rx-call IR. The source signal becomes `signalName()` (a
  // no-arg call expression that the per-target emit lowers to the
  // unwrapped state binding). Args are method args (predicate, count,
  // initial value, etc.) — passed through verbatim.
  //
  // The rx-call IR is target-agnostic: each emitter switches on
  // `method` and produces idiomatic Swift / Kotlin. See
  // `emitSwiftExpr` / `emitKotlinExpr` `case 'rx-call':` blocks.
  const sourceExpr = parseExpr(sourceArg, ctx)
  const sourceCall: ExprIR = { kind: 'call', callee: sourceExpr, args: [] }
  const restArgs = args.slice(1).map((a) => parseExpr(a, ctx))
  const rxCallExpr: ExprIR = {
    kind: 'rx-call',
    method: methodName,
    source: sourceCall,
    args: restArgs,
  }
  return { kind: 'computed', name, expr: rxCallExpr }
}

/**
 * Gap 4 PR-2 (2026-06-05 native-readiness audit) — `createMachine({
 * initial, states })` from `@pyreon/machine` → DeclIR.machine.
 *
 * Extracts the literal `initial` string + the literal `states` map
 * (state name → event map → next state name). Non-literal configs
 * fall through to null so the parent falls through to the Tier-2
 * silent-drop diagnostic (binding emits unresolved with a warning).
 *
 * The `as const` on `initial: 'idle' as const` is unwrapped via the
 * shared `unwrapTypeLayers` helper.
 *
 * Method calls on the binding (`m.send(...)` / `m.matches(...)` /
 * `m.can(...)` / `m.nextEvents()`) flow through emit as-is — the
 * PyreonMachine runtime container defines them. `m()` also works as
 * a current-state read via Swift `callAsFunction()` / Kotlin
 * `operator fun invoke()` — no compiler-side member-access rewriting
 * needed.
 */
function tryDeclFromCreateMachine(
  node: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const init = node.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const calleeName = init.callee?.name as string | undefined
  if (calleeName !== 'createMachine') return null
  if (node.id?.type !== 'Identifier') return null
  const name = node.id.name as string

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const configArg = args[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createMachine declaration \`${name}\`: config argument is not an object literal — emit needs the literal { initial, states } shape to bake the transition table. Falling back to silent-drop.`,
    )
    return null
  }

  // Walk the config object: pick out `initial: 'X'` and `states: { ... }`.
  let initial: string | undefined
  let statesNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'initial') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        initial = valueNode.value
      }
    } else if (keyName === 'states') {
      statesNode = valueNode
    }
  }

  if (!initial) {
    ctx.warnings.push(
      `createMachine declaration \`${name}\`: \`initial\` field is missing or not a string literal — required to seed PyreonMachine. Falling back to silent-drop.`,
    )
    return null
  }
  if (!statesNode || statesNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createMachine declaration \`${name}\`: \`states\` field is missing or not an object literal — required to bake the transition table. Falling back to silent-drop.`,
    )
    return null
  }

  // Parse the states map: { stateName: { on: { EVENT: nextState } }, ... }
  // Empty state objects (`done: {}`) are kept as states with no transitions —
  // they're valid terminal states.
  const transitions: Record<string, Record<string, string>> = {}
  for (const stateProp of (statesNode.properties as AnyNode[] | undefined) ?? []) {
    if (stateProp?.type !== 'Property' && stateProp?.type !== 'ObjectProperty') continue
    const stateKeyNode = stateProp.key as AnyNode | undefined
    const stateName =
      stateKeyNode?.type === 'Identifier'
        ? (stateKeyNode.name as string)
        : stateKeyNode?.type === 'Literal'
          ? String(stateKeyNode.value)
          : undefined
    if (!stateName) continue
    const stateConfig = unwrapTypeLayers(stateProp.value as AnyNode | undefined)
    transitions[stateName] = {}
    if (stateConfig?.type !== 'ObjectExpression') continue
    // Find `on: { EVENT: nextState }`
    for (const innerProp of (stateConfig.properties as AnyNode[] | undefined) ?? []) {
      if (innerProp?.type !== 'Property' && innerProp?.type !== 'ObjectProperty') continue
      const innerKeyNode = innerProp.key as AnyNode | undefined
      const innerKey =
        innerKeyNode?.type === 'Identifier'
          ? (innerKeyNode.name as string)
          : innerKeyNode?.type === 'Literal'
            ? String(innerKeyNode.value)
            : undefined
      if (innerKey !== 'on') continue
      const eventsMap = unwrapTypeLayers(innerProp.value as AnyNode | undefined)
      if (eventsMap?.type !== 'ObjectExpression') continue
      for (const eventProp of (eventsMap.properties as AnyNode[] | undefined) ?? []) {
        if (eventProp?.type !== 'Property' && eventProp?.type !== 'ObjectProperty') continue
        const evKeyNode = eventProp.key as AnyNode | undefined
        const eventName =
          evKeyNode?.type === 'Identifier'
            ? (evKeyNode.name as string)
            : evKeyNode?.type === 'Literal'
              ? String(evKeyNode.value)
              : undefined
        const evVal = unwrapTypeLayers(eventProp.value as AnyNode | undefined)
        if (
          eventName &&
          evVal?.type === 'Literal' &&
          typeof evVal.value === 'string'
        ) {
          transitions[stateName]![eventName] = evVal.value
        }
      }
    }
  }

  return { kind: 'machine', name, initial, transitions }
}

/**
 * Phase 4 — pull literal string elements out of an array argument
 * (`['a', 'b']`). Used to seed `usePermissions`' initial grant set. Returns
 * the string-literal entries; a missing / non-array / non-literal argument
 * yields an empty array so the caller never bails.
 */
/**
 * Gap 4 PR-3 — `createI18n({ locale, messages, fallbackLocale? })` from
 * `@pyreon/i18n/core` → DeclIR.i18n.
 *
 * Extracts the literal `locale` string + the literal `messages` map
 * (locale → key → value) + optional `fallbackLocale`. Non-literal
 * configs warn and fall through to silent-drop.
 *
 * v1 SCOPE: string keys, string values. Async loaders, nested message
 * objects beyond one-level (e.g. `{ user: { greeting: '...' } }`),
 * pluralization suffixes, interpolation, namespaces are deferred.
 * Top-level dot-keys ARE preserved verbatim so a `{ 'section.title':
 * 'Report' }` shape works for the lookup-by-flat-key v1 contract.
 */
function tryDeclFromCreateI18n(
  node: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const init = node.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const calleeName = init.callee?.name as string | undefined
  if (calleeName !== 'createI18n') return null
  if (node.id?.type !== 'Identifier') return null
  const name = node.id.name as string

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const configArg = args[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createI18n declaration \`${name}\`: config argument is not an object literal — emit needs the literal { locale, messages, fallbackLocale? } shape. Falling back to silent-drop.`,
    )
    return null
  }

  let locale: string | undefined
  let fallbackLocale: string | undefined
  let messagesNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'locale') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        locale = valueNode.value
      }
    } else if (keyName === 'fallbackLocale') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        fallbackLocale = valueNode.value
      }
    } else if (keyName === 'messages') {
      messagesNode = valueNode
    }
  }

  if (!locale) {
    ctx.warnings.push(
      `createI18n declaration \`${name}\`: \`locale\` field is missing or not a string literal — required to seed PyreonI18n. Falling back to silent-drop.`,
    )
    return null
  }
  if (!messagesNode || messagesNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createI18n declaration \`${name}\`: \`messages\` field is missing or not an object literal — required to bake the translation table. Falling back to silent-drop.`,
    )
    return null
  }

  // Parse `messages: { en: { hello: 'Hi' } }` into the nested record.
  const messages: Record<string, Record<string, string>> = {}
  for (const localeProp of (messagesNode.properties as AnyNode[] | undefined) ?? []) {
    if (localeProp?.type !== 'Property' && localeProp?.type !== 'ObjectProperty') continue
    const locKeyNode = localeProp.key as AnyNode | undefined
    const locName =
      locKeyNode?.type === 'Identifier'
        ? (locKeyNode.name as string)
        : locKeyNode?.type === 'Literal'
          ? String(locKeyNode.value)
          : undefined
    if (!locName) continue
    const dict = unwrapTypeLayers(localeProp.value as AnyNode | undefined)
    messages[locName] = {}
    if (dict?.type !== 'ObjectExpression') continue
    for (const entry of (dict.properties as AnyNode[] | undefined) ?? []) {
      if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
      const eKey = entry.key as AnyNode | undefined
      const k =
        eKey?.type === 'Identifier'
          ? (eKey.name as string)
          : eKey?.type === 'Literal'
            ? String(eKey.value)
            : undefined
      const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
      if (k && eVal?.type === 'Literal' && typeof eVal.value === 'string') {
        messages[locName]![k] = eVal.value
      }
      // Nested objects + interpolation tokens are v1-out-of-scope —
      // silently dropped at the per-key level (the IR still has the
      // locale entry).
    }
  }

  const result: DeclIR = { kind: 'i18n', name, locale, messages }
  if (fallbackLocale !== undefined) {
    return { ...result, fallbackLocale }
  }
  return result
}

function tryExtractStringArray(arg: AnyNode | undefined): string[] {
  if (!arg || arg.type !== 'ArrayExpression') return []
  const out: string[] = []
  for (const el of (arg.elements as AnyNode[] | undefined) ?? []) {
    if (
      el &&
      (el.type === 'Literal' || el.type === 'StringLiteral') &&
      typeof el.value === 'string'
    ) {
      out.push(el.value)
    }
  }
  return out
}

/**
 * Phase 4.2 — pull the literal `initialValues` map out of a
 * `useForm({ initialValues: { email: 'a@b.com' } })` config. Returns the
 * string-keyed string-literal pairs; everything else (missing config,
 * non-object `initialValues`, non-string entries) is silently dropped so
 * the caller always gets a (possibly empty) array — `useForm` never bails.
 */
function tryExtractFormInitialValues(
  arg: AnyNode | undefined,
): { key: string; value: string }[] {
  if (!arg || arg.type !== 'ObjectExpression') return []
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return []
  const ivProp = props.find(
    (p) =>
      p?.type === 'Property' &&
      p?.key?.type === 'Identifier' &&
      p?.key?.name === 'initialValues',
  )
  if (!ivProp || ivProp.value?.type !== 'ObjectExpression') return []
  const out: { key: string; value: string }[] = []
  for (const p of (ivProp.value.properties as AnyNode[] | undefined) ?? []) {
    if (p?.type !== 'Property') continue
    // Object keys are Identifiers (`email:`) or string literals (`'email':`).
    const key =
      (p.key?.type === 'Identifier' ? (p.key.name as string) : undefined) ??
      (typeof p.key?.value === 'string' ? (p.key.value as string) : undefined)
    const v = p.value
    if (
      key !== undefined &&
      (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
      typeof v.value === 'string'
    ) {
      out.push({ key, value: v.value })
    }
  }
  return out
}

/**
 * Phase C5 — extract the `routes: [...]` array from the first arg of a
 * `createRouter({...})` call. Returns null when the shape is anything
 * other than the canonical literal-config form, so the caller falls
 * back to the C4 bare-instance emit (back-compat).
 *
 * Recognised shape:
 *   createRouter({
 *     routes: [
 *       { path: '/', component: Home },
 *       { path: '/users/:id', component: User },
 *     ]
 *   })
 *
 * Bail conditions (return null):
 *   - first arg missing or not an ObjectExpression
 *   - `routes` property missing or not an ArrayExpression
 *   - any array element not an ObjectExpression
 *   - any element missing `path` (string literal) or `component` (expr)
 *
 * Bail is conservative — uncertain shapes drop ALL routes, keeping the
 * scaffold emit. The compiler never emits a partial route table.
 */
function tryExtractRoutes(arg: AnyNode | undefined, ctx: ParseCtx): RouteIR[] | null {
  if (!arg || arg.type !== 'ObjectExpression') return null
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return null
  const routesProp = props.find(
    (p) =>
      p?.type === 'Property' &&
      p?.key?.type === 'Identifier' &&
      p?.key?.name === 'routes',
  )
  if (!routesProp) return null
  return parseRouteArray(routesProp.value, ctx)
}

/**
 * Global-guards helper — extracts identifier refs from a `beforeEach: [fn1, fn2]`
 * / `afterEach: [fn1]` field on the createRouter config. Returns an empty
 * array if the field is absent / non-array / contains no identifier refs
 * (each silently dropped). Conservative: only IDENTIFIER REFS land in
 * the result; inline arrow bodies and member expressions are dropped
 * because they'd need closure-emit + capture machinery the per-route
 * boolean-guard shape doesn't carry into this PR.
 */
function tryExtractGuardRefArray(arg: AnyNode | undefined, key: string): string[] {
  if (!arg || arg.type !== 'ObjectExpression') return []
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return []
  const prop = props.find(
    (p) =>
      p?.type === 'Property' &&
      p?.key?.type === 'Identifier' &&
      p?.key?.name === key,
  )
  if (!prop) return []
  const value = prop.value as AnyNode | undefined
  if (!value || value.type !== 'ArrayExpression') return []
  const out: string[] = []
  for (const el of (value.elements as AnyNode[] | undefined) ?? []) {
    if (el?.type === 'Identifier' && typeof el.name === 'string') {
      out.push(el.name as string)
    }
    // Non-identifier elements (arrow expressions, member access, etc.)
    // are silently dropped — closure-emit is a documented follow-up.
  }
  return out
}

/**
 * Parse a literal array of route-config objects into RouteIR[]. Shared by
 * the top-level `routes:` extraction and the nested `children:` recursion
 * (Phase 3 nested routes). Conservative: any non-literal / wrong-shape
 * element bails the WHOLE array to null (the compiler never emits a partial
 * route table) — same discipline as the original tryExtractRoutes.
 */
function parseRouteArray(arr: AnyNode | undefined, ctx: ParseCtx): RouteIR[] | null {
  if (!arr || arr.type !== 'ArrayExpression') return null
  const out: RouteIR[] = []
  for (const el of (arr.elements as AnyNode[] | undefined) ?? []) {
    if (!el || el.type !== 'ObjectExpression') return null
    const elProps = el.properties as AnyNode[] | undefined
    if (!elProps) return null
    let path: string | undefined
    let component: ExprIR | undefined
    let redirect: string | undefined
    let guard: ExprIR | undefined
    let children: RouteIR[] | undefined
    for (const p of elProps) {
      if (p?.type !== 'Property') continue
      const key = p.key?.name as string | undefined
      if (key === 'path') {
        const v = p.value
        if (
          (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
          typeof v.value === 'string'
        ) {
          path = v.value
        }
      } else if (key === 'component') {
        component = parseExpr(p.value, ctx)
      } else if (key === 'redirect') {
        // Phase 3 — only a literal redirect target is captured. Function
        // redirects / `throw redirect()` are a later arc; they leave
        // `redirect` undefined here so the route still needs a component.
        const v = p.value
        if (
          (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
          typeof v.value === 'string'
        ) {
          redirect = v.value
        }
      } else if (key === 'beforeEnter') {
        // Phase 3 — boolean guard. Only an arrow with an EXPRESSION body
        // (`() => isAuthed()`) is captured; the body becomes the inline
        // dispatch condition. Block-body / async / throw-redirect guards
        // leave `guard` undefined → the route emits unguarded.
        const v = p.value
        if (v?.type === 'ArrowFunctionExpression' && v.body && v.body.type !== 'BlockStatement') {
          guard = parseExpr(v.body, ctx)
        } else if (v?.type === 'ArrowFunctionExpression' && v.body?.type === 'BlockStatement') {
          // Round-3 audit fix: a block-body arrow guard silently emits
          // an UNGUARDED route. Path is captured at this point (we're
          // inside the `path === '…'` branch's sibling), so name it in
          // the warning so the path forward is obvious.
          ctx.warnings.push(
            `Per-route \`beforeEnter\` guard for ${path !== undefined ? `route "${path}"` : 'a route'} is a block-body arrow — only expression-body arrows (\`() => isAuthed()\`) are extracted; this route emits UNGUARDED. Use the expression-body form or move the logic into a named function called from an expression-body arrow (\`() => checkAccess()\`).`,
          )
        }
      } else if (key === 'children') {
        // Phase 3 nested routes — recurse into the child array. A non-literal
        // / wrong-shape children array yields null → treated as no children
        // (the parent still needs its own component to render something).
        const parsed = parseRouteArray(p.value, ctx)
        if (parsed !== null && parsed.length > 0) children = parsed
      }
      // Other RouteRecord fields (name, meta, loader, etc.) are
      // intentionally ignored — the rest extends when a real app needs it.
    }
    // A route must render SOMETHING: its own component, a redirect target,
    // OR child routes (a pure layout grouping with no index component).
    if (
      path === undefined ||
      (component === undefined && redirect === undefined && children === undefined)
    ) {
      return null
    }
    const route: RouteIR = { path }
    if (component !== undefined) route.component = component
    if (redirect !== undefined) route.redirect = redirect
    if (guard !== undefined) route.guard = guard
    if (children !== undefined) route.children = children
    out.push(route)
  }
  return out
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

  // Round-1 audit fix: surface diagnostic warnings for primitives
  // missing their REQUIRED prop. Pre-fix, omitting (e.g.) `<Icon>`'s
  // `name` or `<Image>`'s `src` silently fell through to the generic
  // emit, producing unbuildable native code (`Icon(size: "lg")` — no
  // such SwiftUI type, no such Compose composable). Users got cryptic
  // `swiftc` / `kotlinc` errors with no Pyreon-side signal.
  //
  // The emit shape is UNCHANGED here (generic fallthrough remains; a
  // proper safe-fallback emit is a larger follow-up). What changes is
  // that the parser now NAMES the missing prop in `result.warnings`,
  // so consumers (CLI, IDE, build scripts) can surface it. Failing
  // loud BEFORE swiftc/kotlinc is the diagnostic-quality win.
  warnIfMissingRequiredProp(tag, attrs, ctx)

  // Round-3 audit fix: when a render callback inside <For>/<Show>
  // declares a hook (`signal()` / `computed()` / `useStorage()` /
  // `useFetch()` / `useForm()`), the parser silently drops it — the
  // ArrowFunctionExpression case in parseExpr only extracts the first
  // expression/return statement and ignores all the `const` decls
  // before it. So the hook body never runs at native runtime,
  // references to its binding emit unbound, and the user has no signal
  // pointing at the cause. Warn at the For/Show site so the path
  // forward (lift the decl to the parent component) is obvious.
  if (tag === 'For' || tag === 'Show') {
    warnIfHookInsideRenderCallback(tag, node.children as AnyNode[] | undefined, ctx)
  }

  return { kind: 'jsx-element', tag, attrs, children }
}

/**
 * Round-3 audit helper: scan a <For>/<Show> child's RAW arrow body
 * for hook calls. The walker only descends into the arrow's block
 * statements — nested JSX expressions / nested arrow bodies are left
 * alone (their hooks would already get flagged on the next pass if
 * they're inside their own For/Show, and otherwise are legitimate
 * event-handler closures).
 */
function warnIfHookInsideRenderCallback(
  tag: string,
  children: AnyNode[] | undefined,
  ctx: ParseCtx,
): void {
  if (!children) return
  // Set of hook identifiers we recognise as "component-scope only".
  // Same set the body parser extracts at the top level — if it's here,
  // it should have been declared in the parent component.
  const HOOK_NAMES = new Set([
    'signal',
    'computed',
    'useStorage',
    'useFetch',
    'useForm',
    'useClipboard',
    'useColorScheme',
    'usePermissions',
    'useOnline',
  ])
  for (const child of children) {
    if (child?.type !== 'JSXExpressionContainer') continue
    const expr = child.expression
    if (expr?.type !== 'ArrowFunctionExpression') continue
    if (expr.body?.type !== 'BlockStatement') continue
    for (const stmt of (expr.body.body as AnyNode[] | undefined) ?? []) {
      if (stmt?.type !== 'VariableDeclaration') continue
      for (const d of (stmt.declarations as AnyNode[] | undefined) ?? []) {
        const init = d?.init
        if (init?.type !== 'CallExpression') continue
        const callee = init.callee?.name as string | undefined
        if (callee && HOOK_NAMES.has(callee)) {
          ctx.warnings.push(
            `Hook \`${callee}(…)\` declared inside <${tag}> render callback — PMTC only extracts hooks at component-body scope. Lift the declaration to the parent component (above the <${tag}> JSX); the closure inside <${tag}> can reference the lifted binding.`,
          )
        }
      }
    }
  }
}

/**
 * Round-1 audit helper: when a canonical primitive is used without
 * its required prop, push a clear warning naming the tag + the
 * missing prop into `ctx.warnings`. The emit path is unchanged; this
 * is diagnostic-only.
 *
 * Scoped to the 3 most-hit shapes the audit found:
 *   - `<Icon>` without `name`   (Swift SF Symbols / Compose Icon both need it)
 *   - `<Image>` without `src`   (no image without a source)
 *   - `<Link>` without `to`     (no navigation target = broken nav)
 *
 * `<Field>` without `value` is deliberately NOT warned here — the
 * existing parse path bails to undeclared for non-signal value and
 * the emit produces a generic fall-through; a clean warning there
 * needs the signal-name set which isn't available at parse time
 * (lives in the emit context). Tracked as a separate follow-up.
 */
function warnIfMissingRequiredProp(tag: string, attrs: AttrIR[], ctx: ParseCtx): void {
  const hasAttr = (name: string): boolean =>
    attrs.some((a) => a.kind === 'attr' && a.name === name)
  if (tag === 'Icon' && !hasAttr('name')) {
    ctx.warnings.push(
      "<Icon> requires a `name` prop (e.g. `<Icon name=\"star\"/>`). Without it the emit falls through to generic and produces an unbuildable `Icon(…)` literal on both Swift and Kotlin.",
    )
  } else if (tag === 'Image' && !hasAttr('src')) {
    ctx.warnings.push(
      '<Image> requires a `src` prop (e.g. `<Image src="/a.png"/>`). Without it the emit falls through to generic and produces an unbuildable `Image(…)` / `AsyncImage(…)` call with no source.',
    )
  } else if (tag === 'Link' && !hasAttr('to')) {
    ctx.warnings.push(
      '<Link> requires a `to` prop (e.g. `<Link to="/users"/>`). Without it the nav target is missing on both targets — emit falls through to generic.',
    )
  }
  // Round-2 follow-up: warn on silent-no-op shapes (props that ARE
  // accepted in the type system but currently produce zero emit on
  // both targets). Each of these used to silently drop the prop with
  // no diagnostic — users wrote them assuming they worked.

  // <Press> without onPress → emit a clickable element with empty
  // action. Real-user trap: the element looks interactive but does
  // nothing on tap.
  if (tag === 'Press' && !attrs.some((a) => a.kind === 'event' && a.name === 'press')) {
    ctx.warnings.push(
      '<Press> without an `onPress` handler emits a no-op clickable element on both targets (button with empty action / Box with no-op clickable modifier). Add `onPress={fn}` or use the plain primitive directly.',
    )
  }

  // <Link prefetch=…> — accepted in the web type, silently dropped
  // on native (no equivalent for SwiftUI NavigationLink or Compose
  // navigation). Warn so users know it's a web-only optimization.
  if (tag === 'Link' && hasAttr('prefetch')) {
    ctx.warnings.push(
      '<Link prefetch={…}> is silently ignored on native targets — prefetch is a web-only optimization. The link still renders + navigates correctly; the hint just has no effect on iOS/Android.',
    )
  }

  // <Stack align=…> / <Inline align=…> / <Layer align=…> with an
  // UNKNOWN literal value silently falls back to the default
  // alignment. Warn for the 4 most common typo shapes.
  if (tag === 'Stack' || tag === 'Inline' || tag === 'Layer') {
    const alignAttr = attrs.find(
      (a) => a.kind === 'attr' && a.name === 'align',
    ) as Extract<AttrIR, { kind: 'attr' }> | undefined
    if (alignAttr && alignAttr.value.kind === 'literal') {
      const v = alignAttr.value.value
      if (typeof v === 'string') {
        // Canonical accepted values per canonical-primitives.ts
        // resolveAlign: 'start' / 'center' / 'end' / 'stretch'
        // (and the per-axis variants Layer uses).
        const validAligns = new Set([
          'start',
          'center',
          'end',
          'stretch',
          'top',
          'bottom',
          'leading',
          'trailing',
        ])
        if (!validAligns.has(v)) {
          ctx.warnings.push(
            `<${tag} align="${v}"> uses an unrecognized align value — silently falls back to the default alignment on both targets. Accepted: start / center / end / stretch (plus top/bottom/leading/trailing for <Layer>).`,
          )
        }
      }
    }
  }
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


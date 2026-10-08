import type { DeclIR, ExprIR, ModuleParseContext, TypeIR } from '@pyreon/native-compiler/plugin-api'
import type { StoreIR } from './types'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally.
type AnyNode = any

export function recognizeStore(
  node: AnyNode,
  ctx: ModuleParseContext,
): StoreIR | null {
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
  // A module-scope `const` resolves — a store id named once and shared with
  // whatever else keys off it is ordinary, and just as known at build time.
  // The id names the emitted singleton (`PyreonStore_<id>`), so every
  // character that is not an identifier character becomes `_`: a kebab-case
  // id like `'native-flow-probe'` — the ordinary web spelling — otherwise
  // emitted `PyreonStore_native-flow-probe`, which neither compiler parses.
  const rawStoreId = ctx.staticString(idArg)
  const storeId = rawStoreId === null ? null : rawStoreId.replace(/[^A-Za-z0-9_]/g, '_')
  if (storeId === null) {
    ctx.report(
      `defineStore declaration \`${hookName}\`: the id must be statically known — an inline string, or a module-scope \`const\` holding one. Falling back to silent-drop.`,
    )
    return null
  }

  // Arg 2: arrow function with a block body returning an object literal.
  const setup = args[1]
  if (
    setup?.type !== 'ArrowFunctionExpression' &&
    setup?.type !== 'FunctionExpression'
  ) {
    ctx.report(
      `defineStore \`${hookName}\`: setup argument must be a function expression. Falling back to silent-drop.`,
    )
    return null
  }
  // The concise-object arrow body `() => ({ ... })` parses as a
  // ParenthesizedExpression, NOT an ObjectExpression — and those parens are
  // MANDATORY syntax (`() => { ... }` would be a block). So the
  // `body?.type === 'ObjectExpression'` branch below could never be reached,
  // and the warning written for exactly that case was dead from the moment it
  // was written. The shape fell through to the silent `else { return null }`
  // and emitted UNCOMPILABLE passthrough: `private let useApp =
  // defineStore("app", { ((n: signal(1))) })`, referencing `defineStore` and
  // `signal` — neither of which exists in Swift. Zero warnings, both targets.
  //
  // Unwrap first so the branch is reachable. `while`, not `if`: `(( ... ))` is
  // legal and nests.
  let body = setup.body as AnyNode
  while (body?.type === 'ParenthesizedExpression') {
    body = body.expression as AnyNode
  }
  // Two shapes: BlockStatement with return, or expression body (`() => ({...})`)
  let returnObj: AnyNode | undefined
  const signalDecls: { name: string; type: TypeIR; initial: ExprIR }[] = []
  const computedDecls: { name: string; expr: ExprIR }[] = []
  const methodDecls: Extract<DeclIR, { kind: 'function' }>[] = []

  if (body?.type === 'BlockStatement') {
    const stmts = (body.body as AnyNode[]) ?? []
    let returnFound = false
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const') {
        // v2 — setup-body decls: `const X = signal(...)` (state),
        // `const X = computed(() => expr)` (derived), `const X =
        // (args) => …` (method). Anything else bails the whole store
        // loudly (the v1 silent-ish fallback emitted UNCOMPILABLE
        // passthrough — `private let useApp = defineStore(...)`).
        for (const d of (stmt.declarations as AnyNode[]) ?? []) {
          if (d.id?.type !== 'Identifier') continue
          const name = d.id.name as string
          const declInit = d.init as AnyNode | undefined
          if (declInit?.type === 'ArrowFunctionExpression') {
            methodDecls.push(ctx.functionDeclaration(name, declInit))
            continue
          }
          if (declInit?.type !== 'CallExpression') continue
          const calleeName = declInit.callee?.name as string | undefined
          if (calleeName === 'computed') {
            const arg = (declInit.arguments as AnyNode[] | undefined)?.[0]
            if (
              arg?.type !== 'ArrowFunctionExpression' ||
              arg.body?.type === 'BlockStatement'
            ) {
              // Block-body computeds in stores are a v3 follow-up —
              // bail LOUDLY (whole-store) rather than drop one decl.
              ctx.report(
                `defineStore \`${hookName}\`: computed \`${name}\` must be an expression-body arrow (\`computed(() => expr)\`) in v2. Falling back to silent-drop.`,
              )
              return null
            }
            computedDecls.push({ name, expr: ctx.expr(arg.body) })
            continue
          }
          if (calleeName !== 'signal') continue
          // Pull the initial value + type generic if present.
          const sigArgs = (declInit.arguments as AnyNode[]) ?? []
          const initialNode = sigArgs[0]
          const initial: ExprIR = initialNode
            ? ctx.expr(initialNode)
            : { kind: 'literal', value: 0 }
          // Infer type from generic OR initial value. `parseGenericTypeArg`
          // returns `{kind:'unknown'}` (not undefined) when no generic is
          // present, so we check for the unknown sentinel + fall back.
          const generic = (ctx.typeArgs(declInit)[0] ?? { kind: 'unknown' } as const)
          const inferredType: TypeIR =
            generic.kind === 'unknown' ? ctx.initialType(initial) : generic
          signalDecls.push({ name, type: inferredType, initial })
        }
      } else if (stmt.type === 'ReturnStatement') {
        returnObj = stmt.argument as AnyNode | undefined
        returnFound = true
        break
      } else {
        // Unsupported statement in setup body — bail with warning.
        ctx.report(
          `defineStore \`${hookName}\`: v2 supports ONLY \`const X = signal(...)\` / \`const X = computed(() => …)\` / \`const X = (args) => …\` decls in the setup body; saw \`${stmt.type}\`. Falling back to silent-drop.`,
        )
        return null
      }
    }
    if (!returnFound || !returnObj) {
      ctx.report(
        `defineStore \`${hookName}\`: setup function must return an object literal of signals.`,
      )
      return null
    }
  } else if (body?.type === 'ObjectExpression') {
    // Arrow body shape: `() => ({ ... })` — no signal decls possible
    // (no statements); only object literal whose values are inline
    // signal calls. Out of v1 scope — declare via the block-body form.
    ctx.report(
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
    ctx.report(
      `defineStore \`${hookName}\`: setup must return an object literal.`,
    )
    return null
  }

  // Validate the returned keys all match declared setup decls
  // (signals, computeds, or methods).
  // Shorthand-only: `return { count, name }` — same identifier on both sides.
  const declaredNames = new Set([
    ...signalDecls.map((s) => s.name),
    ...computedDecls.map((c) => c.name),
    ...methodDecls.map((m) => m.name),
  ])
  for (const prop of (unwrapped.properties as AnyNode[]) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (prop.shorthand !== true) {
      ctx.report(
        `defineStore \`${hookName}\`: only shorthand keys are supported in the returned object (\`return { x, y }\`, not \`return { x: x }\`).`,
      )
      return null
    }
    if (prop.key?.type !== 'Identifier') continue
    const k = prop.key.name as string
    if (!declaredNames.has(k)) {
      ctx.report(
        `defineStore \`${hookName}\`: returned key \`${k}\` doesn't match any setup-body decl.`,
      )
      return null
    }
  }
  // v2: ALL setup decls land on the singleton (not just returned ones)
  // — a method may write a non-returned signal, and a computed may read
  // one; filtering to the exported subset (the v1 behavior) silently
  // broke those bodies.
  const result: StoreIR = { hookName, storeId, fields: signalDecls }
  if (computedDecls.length > 0) result.computeds = computedDecls
  if (methodDecls.length > 0) result.methods = methodDecls
  return result
}


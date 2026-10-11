import { hasDynamicKey, staticPropKey, unwrapTypeLayers, type ModuleParseContext } from '@pyreon/native-compiler/plugin-api'
import type { ModelIR } from './types'
// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally.
type AnyNode = any

export function recognizeModel(
  node: AnyNode,
  ctx: ModuleParseContext,
): ModelIR | null {
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

  // RHS must be a CallExpression whose callee is `<chain>.create`.
  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const createCallee = init.callee as AnyNode | undefined
  if (createCallee?.type !== 'MemberExpression') return null
  if (createCallee.property?.type !== 'Identifier') return null
  if ((createCallee.property.name as string) !== 'create') return null

  // Walk the builder chain back to the `model({...})` root, collecting the
  // `.views(f)` / `.actions(f)` blocks on the way. The chain is the
  // CANONICAL web shape — a model with no `.actions()` cannot mutate its
  // own state, so a recognizer that only matched the bare
  // `model({state}).create()` form matched the one shape a real model
  // never has, and every chained model fell through to a verbatim emit
  // (`model((state: __Obj0(count: 0))).actions(…)` — none of which exists
  // on either target) with no diagnostic at all.
  const chainBlocks: { kind: 'views' | 'actions'; arg: AnyNode | undefined }[] = []
  let cursor = createCallee.object as AnyNode | undefined
  while (
    cursor?.type === 'CallExpression' &&
    cursor.callee?.type === 'MemberExpression' &&
    cursor.callee.property?.type === 'Identifier'
  ) {
    const blockName = cursor.callee.property.name as string
    if (blockName !== 'views' && blockName !== 'actions') {
      ctx.report(
        `model declaration \`${instanceName}\`: builder step \`.${blockName}()\` is not supported natively (only \`.views()\` and \`.actions()\` lower). Falling back to silent-drop.`,
      )
      return null
    }
    chainBlocks.push({
      kind: blockName,
      arg: (cursor.arguments as AnyNode[] | undefined)?.[0],
    })
    cursor = cursor.callee.object as AnyNode | undefined
  }
  // The chain was collected outward-in; restore source order so a later
  // block's `self` sees the earlier one's members (the web's cumulative
  // visibility rule).
  chainBlocks.reverse()

  // Root of the chain must be the bare `model({...})` call.
  const modelCall = cursor
  if (modelCall?.type !== 'CallExpression') return null
  if (modelCall.callee?.type !== 'Identifier') return null
  if ((modelCall.callee.name as string) !== 'model') return null

  const configArg = (modelCall.arguments as AnyNode[] | undefined)?.[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `model declaration \`${instanceName}\`: model() config argument is not an object literal — v2 emit needs the literal { state: { ... } } shape. Falling back to silent-drop.`,
    )
    return null
  }

  // Locate the `state: { ... }` property.
  let stateNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `model declaration \`${instanceName}\`: model() config`)
      return null
    }
    const keyName = staticPropKey(prop)
    if (keyName === 'state') {
      stateNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    }
    // `actions`, `views` keys deliberately ignored in v2.
  }

  if (!stateNode || stateNode.type !== 'ObjectExpression') {
    ctx.report(
      `model declaration \`${instanceName}\`: \`state\` field is missing or not an object literal — required by v2 emit. Falling back to silent-drop.`,
    )
    return null
  }

  // Extract literal state fields { name, type, initial }.
  const fields: ModelIR['fields'] = []
  for (const entry of (stateNode.properties as AnyNode[] | undefined) ?? []) {
    if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(entry)) {
      ctx.warnDynamicKey(entry, `model declaration \`${instanceName}\`: state`)
      continue
    }
    const fieldName = staticPropKey(entry)
    if (!fieldName) continue
    const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
    if (eVal?.type !== 'Literal') {
      ctx.report(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a literal value — v2 emit only supports string / number / boolean literals. Silently dropping this field.`,
      )
      continue
    }
    const v = eVal.value
    if (
      typeof v !== 'string' &&
      typeof v !== 'number' &&
      typeof v !== 'boolean'
    ) {
      ctx.report(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a string / number / boolean literal. Silently dropping.`,
      )
      continue
    }
    // Type comes from the SEED, via the same inference the store uses —
    // so `{ total: 2.5 }` is a Double rather than an Int the seed cannot
    // fit. (Encoding the seed as a raw literal + a three-value type tag
    // is what forced the old `Int` default.)
    const initial = ctx.expr(eVal)
    fields.push({ name: fieldName, type: ctx.initialType(initial), initial })
  }

  if (fields.length === 0) {
    ctx.report(
      `model declaration \`${instanceName}\`: no recognizable state fields. Falling back to silent-drop.`,
    )
    return null
  }

  // `.views()` / `.actions()` blocks. Both take `(self) => ({ … })`; the
  // difference is only what the members become on the emitted singleton
  // (computed properties vs methods), which mirrors how `defineStore`
  // already lowers its `computed(...)` decls vs its arrow decls.
  const views: NonNullable<ModelIR['views']> = []
  const methods: NonNullable<ModelIR['methods']> = []
  for (const block of chainBlocks) {
    const factory = unwrapTypeLayers(block.arg)
    if (
      factory?.type !== 'ArrowFunctionExpression' &&
      factory?.type !== 'FunctionExpression'
    ) {
      ctx.report(
        `model declaration \`${instanceName}\`: \`.${block.kind}()\` argument must be a \`(self) => ({ … })\` factory. Falling back to silent-drop.`,
      )
      return null
    }
    const selfParamNode = (factory.params as AnyNode[] | undefined)?.[0]
    if (selfParamNode && selfParamNode.type !== 'Identifier') {
      // Destructuring `self` ({ count }) would snapshot the members at
      // factory time on web too — refuse rather than emit something whose
      // reactivity silently differs from the web's.
      ctx.report(
        `model declaration \`${instanceName}\`: \`.${block.kind}((self) => …)\` must bind \`self\` as a plain parameter, not a destructure. Falling back to silent-drop.`,
      )
      return null
    }
    const selfParam = selfParamNode ? (selfParamNode.name as string) : 'self'
    let factoryBody = factory.body as AnyNode | undefined
    while (factoryBody?.type === 'ParenthesizedExpression') {
      factoryBody = factoryBody.expression as AnyNode
    }
    if (factoryBody?.type !== 'ObjectExpression') {
      ctx.report(
        `model declaration \`${instanceName}\`: \`.${block.kind}()\` must return an object literal directly (\`(self) => ({ … })\`). Falling back to silent-drop.`,
      )
      return null
    }
    for (const member of (factoryBody.properties as AnyNode[] | undefined) ?? []) {
      if (member?.type !== 'Property' && member?.type !== 'ObjectProperty') continue
      if (hasDynamicKey(member)) {
        ctx.warnDynamicKey(member, `model declaration \`${instanceName}\`: \`.${block.kind}()\` member`)
        return null
      }
      const memberName = staticPropKey(member)
      if (!memberName) continue
      const mVal = unwrapTypeLayers(member.value as AnyNode | undefined)
      if (
        mVal?.type !== 'ArrowFunctionExpression' &&
        mVal?.type !== 'FunctionExpression'
      ) {
        ctx.report(
          `model declaration \`${instanceName}\`: \`.${block.kind}()\` member \`${memberName}\` must be a function. Falling back to silent-drop.`,
        )
        return null
      }
      if (block.kind === 'views') {
        // A view is a zero-arg reader (`doubled: () => self.count() * 2`).
        // Its EXPRESSION becomes the computed property's body.
        let viewBody = mVal.body as AnyNode | undefined
        while (viewBody?.type === 'ParenthesizedExpression') {
          viewBody = viewBody.expression as AnyNode
        }
        if (!viewBody || viewBody.type === 'BlockStatement') {
          ctx.report(
            `model declaration \`${instanceName}\`: view \`${memberName}\` must be an expression-body arrow (\`() => expr\`). Falling back to silent-drop.`,
          )
          return null
        }
        views.push({ name: memberName, expr: ctx.expr(viewBody), selfParam })
        continue
      }
      methods.push({ ...ctx.functionDeclaration(memberName, mVal), selfParam })
    }
  }

  const result: ModelIR = { instanceName, modelId: instanceName, fields }
  if (views.length > 0) result.views = views
  if (methods.length > 0) result.methods = methods
  return result
}

/** Tiny initial-value type inference for store signals.
 *  Matches the inference contract `tryDeclFromVarDeclarator` uses
 *  for component-scope signals. */

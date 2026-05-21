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
  ExprIR,
  ParseResult,
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

  for (const node of ast.program.body as AnyNode[]) {
    const comp = tryComponentFromTopLevel(node, ctx)
    if (comp) components.push(comp)
  }

  return { components, warnings: ctx.warnings }
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

/** Try to extract a signal/computed declaration from a `const x = …`. */
function tryDeclFromVarDeclarator(node: AnyNode, ctx: ParseCtx): DeclIR | null {
  const name = node.id?.name as string | undefined
  const init = node.init as AnyNode | undefined
  if (!name || !init) return null
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
  if (calleeName === 'computed') {
    const arg = init.arguments?.[0]
    if (!arg || arg.type !== 'ArrowFunctionExpression') {
      ctx.warnings.push(
        `Declaration ${name}: computed expected an arrow function argument; got ${arg?.type ?? 'nothing'}.`,
      )
      return null
    }
    const body = arg.body
    const expr: ExprIR = parseExpr(body, ctx)
    return { kind: 'computed', name, expr }
  }
  return null
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
      const op = node.operator as ExprIR & { kind: 'binary' } extends infer T
        ? T extends { op: infer O }
          ? O
          : never
        : never
      // narrow to the supported ops
      const known = ['+', '-', '*', '/', '%'] as const
      if (!known.includes(node.operator)) {
        ctx.warnings.push(`Unsupported binary operator: ${node.operator}.`)
      }
      return {
        kind: 'binary',
        op: (known.includes(node.operator) ? node.operator : '+') as (typeof known)[number],
        left: parseExpr(node.left, ctx),
        right: parseExpr(node.right, ctx),
        // satisfy TS — op variable above is for narrowing reference
        ...(op !== op ? {} : {}),
      }
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
      const fields = (node.properties as AnyNode[])
        .filter((p) => p.type === 'Property' && p.key?.name)
        .map((p) => ({ name: p.key.name as string, value: parseExpr(p.value, ctx) }))
      return { kind: 'object', fields }
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
    const v = (node.value as string).trim()
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

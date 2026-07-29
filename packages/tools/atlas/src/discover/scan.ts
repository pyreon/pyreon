/**
 * Real component discovery — extract components + their prop types from source,
 * so Atlas catalogs a project's ACTUAL components (not a hand-written registry).
 *
 * `scanSource` is a pure, AST-based extractor (no filesystem): it finds exported
 * PascalCase function components and reads their props type (an inline type
 * literal, or a same-file interface / type alias) into `ComponentIntelligence`.
 * Imported types / generics are out of this first slice (they resolve to
 * `unknown`); the fs wrapper lives in `./discover`.
 */
import ts from 'typescript'
import type { ComponentIntelligence, PropShape, PropType, VariantAxis } from '../core'
import { inferControls } from '../core'

type PropsTypeNode = ts.TypeLiteralNode | ts.InterfaceDeclaration

/** The three shapes a component can be declared in. */
type ComponentFnNode = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression

const isPascal = (name: string): boolean => /^[A-Z]/.test(name)

/** Map a TS type node to Atlas's `PropType` (best-effort, syntactic). */
function toPropType(type: ts.TypeNode | undefined): PropType {
  if (!type) return 'unknown'
  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword:
      return 'string'
    case ts.SyntaxKind.NumberKeyword:
      return 'number'
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean'
  }
  if (ts.isFunctionTypeNode(type)) return 'accessor'
  if (ts.isUnionTypeNode(type)) {
    const literals: string[] = []
    for (const member of type.types) {
      if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
        literals.push(member.literal.text)
      } else {
        return 'unknown' // a non-string-literal union member → give up on the union
      }
    }
    if (literals.length > 0) return { union: literals }
  }
  return 'unknown'
}

/** Read a props type's members into `PropShape[]`. */
function membersToShapes(members: ts.NodeArray<ts.TypeElement>): PropShape[] {
  const shapes: PropShape[] = []
  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name)) continue
    const optional = member.questionToken !== undefined
    const shape: PropShape = { name: member.name.text, type: toPropType(member.type) }
    if (optional) shape.optional = true
    shapes.push(shape)
  }
  return shapes
}

/** A literal a default can be read from. Anything else is not a knowable default. */
function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  // A negative number is a PrefixUnaryExpression, not a NumericLiteral.
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text)
  }
  return undefined
}

/**
 * Read each prop's default out of the component BODY.
 *
 * Pyreon components do not destructure props — destructuring captures a
 * getter's value once and silently kills reactivity, which is why the
 * anti-pattern catalog forbids it — so there is no `({ size = 'md' })` to read.
 * The idiomatic shape is a fallback at the use site:
 *
 *     <DemoButton variant={props.variant ?? 'solid'} size={props.size ?? 'md'} />
 *
 * That is what this reads. `||` counts too: an author writing it means the same
 * thing, even though it also replaces `''` and `0`.
 *
 * FIRST occurrence wins. A prop defaulted differently in two places has no
 * single default, and picking the last one read would make the answer depend on
 * traversal order — better to report the one the reader meets first than to
 * invent a resolution rule nobody asked for.
 *
 * Defaults matter beyond the controls panel: a prop with one is NOT required,
 * and `required` drives both the agent guide and the static a11y check. Without
 * this, `label: string` with a `props.label ?? 'Save'` fallback is reported as
 * a required prop the scenario failed to supply.
 */
function readBodyDefaults(fn: ComponentFnNode, shapes: PropShape[]): void {
  const param = fn.parameters[0]
  if (!param || !ts.isIdentifier(param.name)) return
  const propsName = param.name.text
  const byName = new Map(shapes.map((s) => [s.name, s]))

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === propsName &&
      ts.isIdentifier(node.left.name)
    ) {
      const shape = byName.get(node.left.name.text)
      const value = literalValue(node.right)
      if (shape && value !== undefined && shape.defaultValue === undefined) {
        shape.defaultValue = value
      }
    }
    node.forEachChild(visit)
  }
  if (fn.body) visit(fn.body)
}

/** Resolve the props-type node for a component's first parameter. */
function resolvePropsType(
  param: ts.ParameterDeclaration | undefined,
  types: Map<string, PropsTypeNode>,
): PropsTypeNode | undefined {
  const type = param?.type
  if (!type) return undefined
  if (ts.isTypeLiteralNode(type)) return type
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return types.get(type.typeName.text)
  }
  return undefined
}

/** Build a `ComponentIntelligence` from a name + its props type node. */
function toComponent(
  name: string,
  propsType: PropsTypeNode | undefined,
  source: string,
  fn?: ComponentFnNode,
): ComponentIntelligence {
  const members = propsType
    ? ts.isInterfaceDeclaration(propsType)
      ? propsType.members
      : propsType.members
    : ts.factory.createNodeArray<ts.TypeElement>([])
  const shapes = membersToShapes(members)
  if (fn) readBodyDefaults(fn, shapes)
  const controls = inferControls(shapes)
  const axes: VariantAxis[] = shapes
    .filter((s) => typeof s.type === 'object')
    .map((s) => ({ name: s.name, values: (s.type as { union: readonly string[] }).union }))
  return { name, controls, axes, reactivity: [], scenarios: [], tags: [], source }
}

/** Extract a component from a top-level statement, if it is one. */
function extractComponent(node: ts.Node, types: Map<string, PropsTypeNode>, source: string): ComponentIntelligence | undefined {
  const isExported = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

  // export function Button(props: P) { … }
  if (ts.isFunctionDeclaration(node) && node.name && isPascal(node.name.text) && isExported(node)) {
    return toComponent(node.name.text, resolvePropsType(node.parameters[0], types), source, node)
  }
  // export const Button = (props: P) => …   /   export const Button = function (props: P) { … }
  if (ts.isVariableStatement(node) && isExported(node)) {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !isPascal(decl.name.text)) continue
      const init = decl.initializer
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        return toComponent(decl.name.text, resolvePropsType(init.parameters[0], types), source, init)
      }
    }
  }
  return undefined
}

/** Extract every exported component + its prop controls from one source string. */
export function scanSource(code: string, fileName = 'component.tsx'): ComponentIntelligence[] {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  // pass 1 — collect same-file interfaces + object type aliases
  const types = new Map<string, PropsTypeNode>()
  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node)) types.set(node.name.text, node)
    else if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) types.set(node.name.text, node.type)
  })

  // pass 2 — extract components
  const out: ComponentIntelligence[] = []
  sf.forEachChild((node) => {
    const comp = extractComponent(node, types, fileName)
    if (comp) out.push(comp)
  })
  return out
}

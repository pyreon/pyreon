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
function toComponent(name: string, propsType: PropsTypeNode | undefined, source: string): ComponentIntelligence {
  const members = propsType
    ? ts.isInterfaceDeclaration(propsType)
      ? propsType.members
      : propsType.members
    : ts.factory.createNodeArray<ts.TypeElement>([])
  const shapes = membersToShapes(members)
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
    return toComponent(node.name.text, resolvePropsType(node.parameters[0], types), source)
  }
  // export const Button = (props: P) => …   /   export const Button = function (props: P) { … }
  if (ts.isVariableStatement(node) && isExported(node)) {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !isPascal(decl.name.text)) continue
      const init = decl.initializer
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        return toComponent(decl.name.text, resolvePropsType(init.parameters[0], types), source)
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

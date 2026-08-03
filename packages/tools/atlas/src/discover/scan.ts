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
  return { name, controls, axes, scenarios: [], tags: [], source }
}

/**
 * Unwrap a component out of the expressions people actually write.
 *
 * `memo(forwardRef(Button))`, `styled(Base)`, `observer(Button)` — a wrapper
 * call whose component argument is the thing being exported. Recursion is
 * depth-bounded because the input is arbitrary source: a pathological nest must
 * not be able to blow the stack of a scan.
 *
 * A wrapper's props are read from the INNER function, which is the only place
 * they are written down; a `forwardRef` puts them on its second parameter's
 * sibling, and the common shapes all keep them on the first parameter of the
 * function being wrapped.
 */
function unwrapComponentExpression(
  expression: ts.Expression,
  depth = 0,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (depth > 4) return undefined
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression
  if (ts.isCallExpression(expression)) {
    // ONLY a bare-identifier callee — `memo(…)`, `forwardRef(…)`, `observer(…)`.
    //
    // A METHOD call is excluded because a rocketstyle component is exactly
    // that: `chipBase.attrs({…}).theme((t) => ({…}))`. Unwrapping it finds the
    // THEME CALLBACK and reads `t` as the component's props — which is bad
    // twice over. The component is catalogued with nonsense props, and because
    // the static pass now claims the name, the rocketstyle pass skips it and
    // its real `.variants()` axes are never discovered. Measured on the
    // workshop example: 43 scenarios collapsed to 29, silently.
    //
    // `React.memo(…)` is a member call too and is therefore missed. That is the
    // deliberate side of the trade: a missed wrapper is a component absent from
    // the catalog, while a mis-unwrapped chain is a component present with
    // fabricated props AND a working discovery path suppressed.
    if (ts.isIdentifier(expression.expression)) {
      for (const argument of expression.arguments) {
        const found = unwrapComponentExpression(argument, depth + 1)
        if (found) return found
      }
    }
  }
  // `Button as FC<Props>` / `(Button)` / `Button!`
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return unwrapComponentExpression(expression.expression, depth + 1)
  }
  if (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapComponentExpression(expression.expression, depth + 1)
  }
  return undefined
}

/**
 * The props type of a `const Button: FC<Props> = …` style annotation.
 *
 * The props live in the TYPE ARGUMENT, not on the parameter — which is why the
 * parameter-only reader saw nothing and every control came back `unknown` for
 * one of the most common ways to declare a component.
 */
function propsFromTypeAnnotation(
  type: ts.TypeNode | undefined,
  types: Map<string, PropsTypeNode>,
): PropsTypeNode | undefined {
  if (!type || !ts.isTypeReferenceNode(type)) return undefined
  const argument = type.typeArguments?.[0]
  if (!argument) return undefined
  if (ts.isTypeLiteralNode(argument)) return argument
  if (ts.isTypeReferenceNode(argument) && ts.isIdentifier(argument.typeName)) {
    return types.get(argument.typeName.text)
  }
  return undefined
}

/** Extract a component from a top-level statement, if it is one. */
function extractComponent(node: ts.Node, types: Map<string, PropsTypeNode>, source: string): ComponentIntelligence | undefined {
  const isExported = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const isDefault = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)

  // export function Button(props: P) { … }   — including `export default`
  if (ts.isFunctionDeclaration(node) && isExported(node)) {
    // `export default function Button()` has a name; `export default function()`
    // does not, and takes the FILE's name — which is what the import site will
    // call it anyway.
    const name = node.name?.text ?? (isDefault(node) ? fileBaseName(source) : undefined)
    if (name && isPascal(name)) {
      return toComponent(name, resolvePropsType(node.parameters[0], types), source, node)
    }
  }

  // export const Button = (props: P) => …
  // export const Button: FC<P> = (props) => …
  // export const Button = memo(forwardRef((props: P, ref) => …))
  if (ts.isVariableStatement(node) && isExported(node)) {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !isPascal(decl.name.text)) continue
      const init = decl.initializer
      if (!init) continue
      const fn = unwrapComponentExpression(init)
      if (!fn) continue
      // The parameter's own type wins; the `FC<Props>` annotation is the
      // fallback, because a component that has both means the parameter.
      const props =
        resolvePropsType(fn.parameters[0], types) ?? propsFromTypeAnnotation(decl.type, types)
      return toComponent(decl.name.text, props, source, fn)
    }
  }

  // export default Button   — a named function or const declared above.
  if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
    // Deliberately NOT emitted here: the declaration it points at is a separate
    // statement this walk visits on its own, so emitting would produce the
    // component twice under the same name. Handled by making the declaration
    // itself discoverable rather than by following the re-export.
    return undefined
  }

  return undefined
}

/**
 * A PascalCase name from a file path — `button-group.tsx` → `ButtonGroup`.
 *
 * Only used for an anonymous `export default function()`, where there is no
 * name in the source and the file name is what every import site chooses.
 */
export function fileBaseName(source: string): string {
  const base = (source.split(/[/\\]/).pop() ?? source).replace(/\.[jt]sx?$/, '')
  return base
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/** Extract every exported component + its prop controls from one source string. */
export function scanSource(code: string, fileName = 'component.tsx'): ComponentIntelligence[] {
  // ScriptKind from the EXTENSION: in a `.ts` file `<T>(x) => …` is a generic
  // arrow, and parsing it as TSX reads that same text as a JSX element — the
  // file then fails to parse and its components vanish silently.
  const kind = /\.tsx?$/.test(fileName) && !fileName.endsWith('.tsx') ? ts.ScriptKind.TS : ts.ScriptKind.TSX
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind)

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

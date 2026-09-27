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
import { collectImportedTypes, findTypeDeclaration, isPropsShaped } from './resolve-types'
import type { ComponentIntelligence, PropShape, PropType, VariantAxis } from '../core'
import { inferControls } from '../core'

/**
 * A props type as written: an interface, or any type node an alias can name
 * (a literal, an intersection, a reference to another props type). Members are
 * read by `collectMembers`, which follows `extends` and `&`.
 */
type PropsTypeNode = ts.InterfaceDeclaration | ts.TypeNode

/**
 * Resolve a props type by NAME — same-file first, then imported.
 *
 * A function rather than the old `Map`, because an imported type is a
 * filesystem lookup that must stay lazy: a component whose props are declared
 * locally should never trigger one.
 */
type TypeLookup = (name: string) => PropsTypeNode | undefined

/** The three shapes a component can be declared in. */
type ComponentFnNode = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression

const isPascal = (name: string): boolean => /^[A-Z]/.test(name)

/**
 * `undefined` / `null` members of a union carry no information about which
 * VALUES a prop takes — they only say it may be absent, which `?` already
 * records. Under `exactOptionalPropertyTypes` the idiomatic spelling of an
 * optional prop is `size?: 'sm' | 'md' | undefined`, and treating the
 * `undefined` member as "not a string literal" gave up on the whole union: the
 * prop became `unknown` and its variant axis — every scenario it seeds —
 * vanished from the catalog.
 */
function isNullish(member: ts.TypeNode): boolean {
  if (member.kind === ts.SyntaxKind.UndefinedKeyword) return true
  if (ts.isLiteralTypeNode(member) && member.literal.kind === ts.SyntaxKind.NullKeyword) return true
  return false
}

/** Map a TS type node to Atlas's `PropType` (best-effort, syntactic). */
function toPropType(type: ts.TypeNode | undefined): PropType {
  if (!type) return 'unknown'
  if (ts.isParenthesizedTypeNode(type)) return toPropType(type.type)
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
    const members = type.types.filter((m) => !isNullish(m))
    // `boolean | undefined` → boolean; `(() => void) | undefined` → accessor.
    if (members.length === 1) return toPropType(members[0])
    const literals: string[] = []
    for (const member of members) {
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

/**
 * A property's name, when it is one a JSX attribute can spell.
 *
 * Quoted names are ordinary for props — `'aria-label': string`,
 * `'data-testid'?: string` — and were skipped outright because only an
 * identifier was accepted.
 */
function propertyName(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text
  return undefined
}

/** Read a props type's members into `PropShape[]`. A later member of the same name wins. */
function membersToShapes(members: readonly ts.TypeElement[]): PropShape[] {
  const byName = new Map<string, PropShape>()
  for (const member of members) {
    if (!ts.isPropertySignature(member)) continue
    const name = propertyName(member.name)
    if (name === undefined) continue
    const optional = member.questionToken !== undefined
    const shape: PropShape = { name, type: toPropType(member.type) }
    if (optional) shape.optional = true
    // Delete first so an override takes the OVERRIDER's position — an
    // interface's own member restating an inherited one is the one to show.
    byName.delete(name)
    byName.set(name, shape)
  }
  return [...byName.values()]
}

/** How deep `extends` / `&` / alias chains are followed — bounds a cycle. */
const MAX_TYPE_DEPTH = 8

/**
 * Every member a props type declares, including INHERITED ones.
 *
 * `interface P extends Base { … }` read only its own body, so every prop
 * declared on `Base` was missing; `type P = A & { … }` is not a type literal,
 * so it yielded nothing at all. Both are the ordinary way to share a prop set,
 * so both are followed — through the SAME lookup a direct reference uses.
 *
 * An inherited name is first resolved in the declaring node's OWN file, then
 * through the scanned file's lookup: an imported `interface Props extends
 * Base` names a `Base` that lives beside it, not beside the component.
 */
function collectMembers(
  node: PropsTypeNode,
  lookup: TypeLookup,
  lookupBase?: BaseLookup,
  depth = 0,
  seen = new Set<ts.Node>(),
): ts.TypeElement[] {
  if (depth > MAX_TYPE_DEPTH || seen.has(node)) return []
  seen.add(node)
  const resolveName = (name: string): PropsTypeNode | undefined =>
    findTypeInFile(node.getSourceFile(), name) ?? (lookupBase ? lookupBase(node, name) : lookup(name))
  const followRef = (ref: ts.TypeNode): ts.TypeElement[] => {
    const name = ts.isTypeReferenceNode(ref) && ts.isIdentifier(ref.typeName) ? ref.typeName.text : undefined
    if (name === undefined) return collectMembers(ref, lookup, lookupBase, depth + 1, seen)
    const target = resolveName(name)
    return target ? collectMembers(target, lookup, lookupBase, depth + 1, seen) : []
  }

  if (ts.isInterfaceDeclaration(node)) {
    const inherited: ts.TypeElement[] = []
    for (const clause of node.heritageClauses ?? []) {
      for (const heritage of clause.types) {
        if (!ts.isIdentifier(heritage.expression)) continue
        const target = resolveName(heritage.expression.text)
        if (target) inherited.push(...collectMembers(target, lookup, lookupBase, depth + 1, seen))
      }
    }
    return [...inherited, ...node.members]
  }
  if (ts.isTypeLiteralNode(node)) return [...node.members]
  if (ts.isParenthesizedTypeNode(node)) return collectMembers(node.type, lookup, lookupBase, depth + 1, seen)
  if (ts.isIntersectionTypeNode(node)) return node.types.flatMap(followRef)
  if (ts.isTypeReferenceNode(node)) return followRef(node)
  return []
}

/** A props-shaped declaration in one source file, by name. */
function findTypeInFile(sf: ts.SourceFile, name: string): PropsTypeNode | undefined {
  let found: PropsTypeNode | undefined
  sf.forEachChild((n) => {
    if (found) return
    if (ts.isInterfaceDeclaration(n) && n.name.text === name) found = n
    else if (ts.isTypeAliasDeclaration(n) && n.name.text === name && isPropsShaped(n.type)) found = n.type
  })
  return found
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
  lookup: TypeLookup,
): PropsTypeNode | undefined {
  const type = param?.type
  if (!type) return undefined
  if (ts.isTypeLiteralNode(type) || ts.isIntersectionTypeNode(type) || ts.isParenthesizedTypeNode(type)) {
    return type
  }
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return lookup(type.typeName.text)
  }
  return undefined
}

/**
 * Resolves a base type named in an `extends` / `&` of `node`, from the file
 * `node` itself lives in. A props type imported from another file names bases
 * that file imports, not ones the scanned component imports — so once a hop has
 * crossed files, the scanned file's own lookup is the wrong one.
 */
export type BaseLookup = (node: PropsTypeNode, name: string) => PropsTypeNode | undefined

/** Build a `ComponentIntelligence` from a name + its props type node. */
function toComponent(
  name: string,
  propsType: PropsTypeNode | undefined,
  source: string,
  lookup: TypeLookup,
  fn?: ComponentFnNode,
  lookupBase?: BaseLookup,
): ComponentIntelligence {
  const shapes = membersToShapes(propsType ? collectMembers(propsType, lookup, lookupBase) : [])
  if (fn) readBodyDefaults(fn, shapes)
  const controls = inferControls(shapes)
  const axes: VariantAxis[] = shapes
    .filter((s) => typeof s.type === 'object')
    .map((s) => ({ name: s.name, values: (s.type as { union: readonly string[] }).union }))
  const content = contentFromProps(name, shapes)
  return { name, controls, axes, scenarios: [], tags: [], source, ...(content ? { content } : {}) }
}

/**
 * The content seed for a TYPED component: only what its own props declare.
 *
 * A function component states its content channel in its type — `children`,
 * or a `label` — and a scan cannot read a tag off it the way rocketstyle
 * discovery can. So the seed is conservative: the first of those two props the
 * component declares, when it carries no default of its own, gets the
 * component's NAME. A component that declares neither is left alone; guessing
 * a prop it does not have would put a control on the panel that does nothing.
 */
function contentFromProps(name: string, shapes: readonly PropShape[]): Record<string, unknown> | undefined {
  for (const key of ['children', 'label'] as const) {
    const shape = shapes.find((s) => s.name === key)
    if (!shape || shape.defaultValue !== undefined) continue
    if (shape.type === 'string' || shape.type === 'unknown') return { [key]: name }
  }
  return undefined
}

/**
 * Unwrap a component out of the expressions Pyreon code actually writes.
 *
 * The wrapper that matters here is `nativeCompat(Component)` — the compat
 * marker. The props are on the INNER function, which is the only place they are
 * written down.
 *
 * Recursion is depth-bounded because the input is arbitrary source: a
 * pathological nest must not be able to blow the stack of a scan.
 */
function unwrapComponentExpression(
  expression: ts.Expression,
  depth = 0,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (depth > 4) return undefined
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    // A ZERO-parameter function is a component at the top level (`const Logo =
    // () => <svg/>`) but a THUNK when it is an argument — `lazy(() =>
    // import('./Heavy'))` passes a loader, not a component. Unwrapping that
    // loader catalogued the lazy boundary itself as a propless component:
    // present in the sidebar, nothing useful to render. Same false-positive
    // class as the rocketstyle theme callback, just quieter.
    if (depth > 0 && expression.parameters.length === 0) return undefined
    return expression
  }
  if (ts.isCallExpression(expression)) {
    // ONLY a bare-identifier callee — `nativeCompat(…)` and friends.
    //
    // A METHOD call is excluded because a rocketstyle component is exactly
    // that: `chipBase.attrs({…}).theme((t) => ({…}))`. Unwrapping it finds the
    // THEME CALLBACK and reads `t` as the component's props — which is bad
    // twice over. The component is catalogued with nonsense props, and because
    // the static pass now claims the name, the rocketstyle pass skips it and
    // its real `.variants()` axes are never discovered. Measured on the
    // workshop example: 43 scenarios collapsed to 29, silently.
    //
    // A MEMBER-call wrapper is therefore missed. That is the deliberate side of
    // the trade: a missed wrapper is a component absent from the catalog, while
    // a mis-unwrapped chain is a component present with fabricated props AND a
    // working discovery path suppressed.
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
 * The props type of a `const Button: ComponentFn<Props> = …` annotation.
 *
 * The props live in the TYPE ARGUMENT, not on the parameter — which is why the
 * parameter-only reader saw nothing and every control came back `unknown` for
 * one of the most common ways to declare a component.
 */
function propsFromTypeAnnotation(
  type: ts.TypeNode | undefined,
  lookup: TypeLookup,
): PropsTypeNode | undefined {
  if (!type || !ts.isTypeReferenceNode(type)) return undefined
  const argument = type.typeArguments?.[0]
  if (!argument) return undefined
  if (ts.isTypeLiteralNode(argument) || ts.isIntersectionTypeNode(argument)) return argument
  if (ts.isTypeReferenceNode(argument) && ts.isIdentifier(argument.typeName)) {
    return lookup(argument.typeName.text)
  }
  return undefined
}

/** Extract the components a top-level statement declares (zero or more). */
function extractComponents(
  node: ts.Node,
  lookup: TypeLookup,
  source: string,
  lookupBase?: BaseLookup,
): ComponentIntelligence[] {
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
      return [toComponent(name, resolvePropsType(node.parameters[0], lookup), source, lookup, node, lookupBase)]
    }
  }

  // export const Button = (props: P) => …
  // export const Button: FC<P> = (props) => …
  // export const Button = memo(forwardRef((props: P, ref) => …))
  //
  // EVERY declarator: `export const A = …, B = …` declares two components, and
  // returning on the first one catalogued A and silently dropped B.
  if (ts.isVariableStatement(node) && isExported(node)) {
    const found: ComponentIntelligence[] = []
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !isPascal(decl.name.text)) continue
      const init = decl.initializer
      if (!init) continue
      const fn = unwrapComponentExpression(init)
      if (!fn) continue
      // The parameter's own type wins; the `FC<Props>` annotation is the
      // fallback, because a component that has both means the parameter.
      const props =
        resolvePropsType(fn.parameters[0], lookup) ?? propsFromTypeAnnotation(decl.type, lookup)
      found.push(toComponent(decl.name.text, props, source, lookup, fn, lookupBase))
    }
    return found
  }

  // export default Button   — a named function or const declared above.
  if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
    // Deliberately NOT emitted here: the declaration it points at is a separate
    // statement this walk visits on its own, so emitting would produce the
    // component twice under the same name. Handled by making the declaration
    // itself discoverable rather than by following the re-export.
    return []
  }

  return []
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
export interface ScanOptions {
  /**
   * Resolves a props type imported from another file.
   *
   * Injected rather than done here so `scanSource` stays PURE — it takes a
   * string and returns data, which is what makes its failure modes testable
   * without a disk. The filesystem half lives in `./resolve-types`, and
   * `discoverComponents` supplies it.
   *
   * Omitted, an imported props type resolves to `unknown` exactly as before.
   */
  resolveImportedType?: (
    typeName: string,
    imports: import('./resolve-types').ImportedTypes,
    fromFile: string,
  ) => PropsTypeNode | undefined
}

export function scanSource(
  code: string,
  fileName = 'component.tsx',
  options: ScanOptions = {},
): ComponentIntelligence[] {
  // ScriptKind from the EXTENSION: in a `.ts` file `<T>(x) => …` is a generic
  // arrow, and parsing it as TSX reads that same text as a JSX element — the
  // file then fails to parse and its components vanish silently.
  const kind = /\.tsx?$/.test(fileName) && !fileName.endsWith('.tsx') ? ts.ScriptKind.TS : ts.ScriptKind.TSX
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind)

  // pass 1 — collect same-file interfaces + type aliases. Every alias, not
  // just object literals: `type P = Base & { … }` is a props type too, and
  // `collectMembers` decides what it can read out of each shape.
  const types = new Map<string, PropsTypeNode>()
  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node)) types.set(node.name.text, node)
    else if (ts.isTypeAliasDeclaration(node) && isPropsShaped(node.type)) types.set(node.name.text, node.type)
  })

  // pass 1b — the types this file IMPORTS. Resolved lazily: a component whose
  // props type is declared locally never pays for the lookup.
  const imported = collectImportedTypes(sf)
  const resolve = options.resolveImportedType
  const lookup: TypeLookup = (name) => {
    const local = types.get(name)
    if (local) return local
    if (!resolve || !imported.bySpecifier.has(name)) return undefined
    return resolve(name, imported, fileName)
  }

  // A base type is looked up from the file its DERIVED type lives in — which,
  // once a hop has crossed into an imported file, is not this one.
  const lookupBase: BaseLookup = (from, name) => {
    const home = from.getSourceFile()
    if (home === sf) return lookup(name)
    // Reaching another file at all means a resolver took us there.
    return findTypeDeclaration(home, name) ?? resolve?.(name, collectImportedTypes(home), home.fileName)
  }

  // pass 2 — extract components
  const out: ComponentIntelligence[] = []
  sf.forEachChild((node) => {
    out.push(...extractComponents(node, lookup, fileName, lookupBase))
  })
  return out
}

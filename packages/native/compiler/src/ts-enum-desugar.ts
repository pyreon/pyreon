/**
 * TypeScript `enum` declarations, desugared into shapes PMTC already lowers — before any recognizer reads the AST.
 *
 * A TS `enum` emitted NOTHING (a named warning said so), and every `Filter.Done` that read it then failed the native
 * build. Rather than give the emitters a second enum model, the two kinds of enum reduce to what they already are at
 * runtime:
 *
 * - a STRING enum (`enum Filter { All = 'all', Done = 'done' }`) is a closed set of strings — exactly the
 *   string-literal union `type Filter = 'all' | 'done'`, which lowers to a native `enum Filter: String` / `enum class`.
 *   The declaration becomes that alias, and each `Filter.Done` becomes the literal `'done'`, which the enum-typed
 *   positions already lower to `.done` / `Filter.done`.
 * - a NUMERIC enum (`enum Dir { Up, Down = 5, Left }`) is a set of numbers — `Dir.Left` is `6` on the web, and a
 *   `Dir`-typed value is a `number`. Every type reference `Dir` becomes `number` and each member its number, with
 *   TypeScript's auto-increment; the declaration itself goes away.
 *
 * What does not reduce is named and left alone (the existing "NOT compiled to native" warning still fires for it): a
 * mixed string / number enum, a computed or non-literal initializer, and a reverse lookup (`Dir[0]`), which only a
 * numeric enum's runtime object supports.
 */

type AnyNode = Record<string, unknown> & { type?: string }

interface EnumInfo {
  readonly kind: 'string' | 'number'
  readonly members: ReadonlyMap<string, string | number>
}

function memberName(m: AnyNode): string | undefined {
  const id = m.id as AnyNode | undefined
  if (id?.type === 'Identifier') return id.name as string
  if (id?.type === 'Literal' && typeof id.value === 'string') return id.value
  return undefined
}

/** A literal initializer's value: a string, a number, or a negated number. */
function literalValue(n: AnyNode | null | undefined): string | number | undefined {
  if (!n) return undefined
  if (n.type === 'Literal' && (typeof n.value === 'string' || typeof n.value === 'number')) return n.value
  if (n.type === 'UnaryExpression' && n.operator === '-') {
    const inner = literalValue(n.argument as AnyNode)
    return typeof inner === 'number' ? -inner : undefined
  }
  return undefined
}

function classify(decl: AnyNode): EnumInfo | undefined {
  const members = ((decl.body as AnyNode | undefined)?.members ?? decl.members) as AnyNode[] | undefined
  if (!members || members.length === 0) return undefined
  const out = new Map<string, string | number>()
  let next = 0
  let kind: 'string' | 'number' | undefined
  for (const m of members) {
    const name = memberName(m)
    if (name === undefined || m.computed === true) return undefined
    const init = m.initializer as AnyNode | null | undefined
    let value: string | number | undefined
    if (init === null || init === undefined) {
      // Auto-increment continues only after a numeric member (a string member must be followed by an initializer).
      if (kind === 'string') return undefined
      value = next
    } else {
      value = literalValue(init)
      if (value === undefined) return undefined
    }
    const k = typeof value === 'string' ? 'string' : 'number'
    if (kind !== undefined && kind !== k) return undefined
    kind = k
    if (typeof value === 'number') next = value + 1
    out.set(name, value)
  }
  return kind === undefined ? undefined : { kind, members: out }
}

function literalNode(value: string | number): AnyNode {
  return typeof value === 'number' && value < 0
    ? { type: 'UnaryExpression', operator: '-', prefix: true, argument: { type: 'Literal', value: -value, raw: String(-value) } }
    : { type: 'Literal', value, raw: JSON.stringify(value) }
}

function aliasFor(decl: AnyNode, info: EnumInfo): AnyNode {
  const typeAnnotation: AnyNode = {
    type: 'TSUnionType',
    types: [...new Set(info.members.values())].map((v) => ({ type: 'TSLiteralType', literal: literalNode(v) })),
  }
  return {
    type: 'TSTypeAliasDeclaration',
    id: decl.id,
    typeParameters: null,
    typeAnnotation,
    declare: false,
    start: decl.start,
    end: decl.end,
  }
}

/** The member a `E.M` / `E['M']` expression reads, when `E` is a desugared enum. */
function readMember(node: AnyNode, enums: ReadonlyMap<string, EnumInfo>): string | number | undefined {
  if (node.type !== 'MemberExpression') return undefined
  const obj = node.object as AnyNode | undefined
  if (obj?.type !== 'Identifier') return undefined
  const info = enums.get(obj.name as string)
  if (info === undefined) return undefined
  const prop = node.property as AnyNode | undefined
  const key =
    node.computed === true
      ? prop?.type === 'Literal' && typeof prop.value === 'string'
        ? prop.value
        : undefined
      : prop?.type === 'Identifier'
        ? (prop.name as string)
        : undefined
  return key === undefined ? undefined : info.members.get(key)
}

/**
 * Desugar every top-level string / numeric `enum` in `program` IN PLACE. Returns warnings for the reads that cannot
 * be desugared (a reverse lookup `E[expr]`).
 */
export function desugarTsEnums(program: AnyNode): string[] {
  const body = program.body as AnyNode[] | undefined
  if (!body) return []
  const enums = new Map<string, EnumInfo>()
  for (let i = 0; i < body.length; i++) {
    const top = body[i]!
    const decl = top.type === 'ExportNamedDeclaration' ? (top.declaration as AnyNode | undefined) : top
    if (decl?.type !== 'TSEnumDeclaration' || decl.declare === true) continue
    const name = (decl.id as AnyNode | undefined)?.name as string | undefined
    const info = name === undefined ? undefined : classify(decl)
    if (name === undefined || info === undefined) continue
    enums.set(name, info)
    // A numeric enum leaves no declaration (its type references become `number`); an empty statement keeps indices.
    const replacement = info.kind === 'string' ? aliasFor(decl, info) : { type: 'EmptyStatement', start: decl.start, end: decl.end }
    if (top.type === 'ExportNamedDeclaration' && info.kind === 'string') top.declaration = replacement
    else body[i] = replacement
  }
  if (enums.size === 0) return []
  const warnings: string[] = []
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = visit(node[i])
      return node
    }
    if (!node || typeof node !== 'object') return node
    const n = node as AnyNode
    const value = readMember(n, enums)
    if (value !== undefined) return { ...literalNode(value), start: n.start, end: n.end }
    // A numeric enum's TYPE is `number` wherever it is named (`signal<Dir>(…)`, `(d: Dir) => …`).
    if (
      n.type === 'TSTypeReference' &&
      (n.typeName as AnyNode | undefined)?.type === 'Identifier' &&
      enums.get((n.typeName as AnyNode).name as string)?.kind === 'number'
    ) {
      return { type: 'TSNumberKeyword', start: n.start, end: n.end }
    }
    if (
      n.type === 'MemberExpression' &&
      n.computed === true &&
      (n.object as AnyNode | undefined)?.type === 'Identifier' &&
      enums.has((n.object as AnyNode).name as string)
    ) {
      warnings.push(
        `\`${(n.object as AnyNode).name as string}[…]\`: a reverse or computed lookup on a TS enum has no native lowering — read a member by name (\`${(n.object as AnyNode).name as string}.Member\`).`,
      )
    }
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue
      const child = n[k]
      if (child && typeof child === 'object') n[k] = visit(child)
    }
    return n
  }
  visit(program)
  return warnings
}

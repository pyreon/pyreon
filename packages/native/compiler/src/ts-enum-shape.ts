/**
 * Which TypeScript `enum` declarations PMTC can lower: the classifier behind
 * `ts-enum-desugar.ts`. A string enum, or a numeric enum whose members are
 * literals (with auto-increment), reduces to what it is at runtime; a mixed
 * string / number enum, a computed member or a non-literal initializer does
 * not. Kept in its own dependency-free module so the light
 * `@pyreon/native-compiler/audit` entry asks the SAME question the compiler
 * does (`native-audit.ts`), instead of a second, drifting rule.
 */
export type AnyNode = Record<string, unknown> & { type?: string }

export interface EnumInfo {
  readonly kind: 'string' | 'number'
  readonly members: ReadonlyMap<string, string | number>
}

export function memberName(m: AnyNode): string | undefined {
  const id = m.id as AnyNode | undefined
  if (id?.type === 'Identifier') return id.name as string
  if (id?.type === 'Literal' && typeof id.value === 'string') return id.value
  return undefined
}

/** A literal initializer's value: a string, a number, or a negated number. */
export function literalValue(n: AnyNode | null | undefined): string | number | undefined {
  if (!n) return undefined
  if (n.type === 'Literal' && (typeof n.value === 'string' || typeof n.value === 'number')) return n.value
  if (n.type === 'UnaryExpression' && n.operator === '-') {
    const inner = literalValue(n.argument as AnyNode)
    return typeof inner === 'number' ? -inner : undefined
  }
  return undefined
}

export function classify(decl: AnyNode): EnumInfo | undefined {
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

/** Whether PMTC lowers this `enum` declaration (see `classify`). */
export function isLowerableTsEnum(decl: AnyNode): boolean {
  return decl.declare !== true && classify(decl) !== undefined
}

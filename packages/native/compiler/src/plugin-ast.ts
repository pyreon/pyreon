/**
 * Pure ESTree helpers shared by the parser and by package-owned plugins (re-exported from
 * `@pyreon/native-compiler/plugin-api`). None reads parser state.
 */

type AnyNode = any

/** Walk `ExportNamedDeclaration → VariableDeclaration` OR a bare
 * `VariableDeclaration`, yielding the declarators. Shared by the http
 * collectors. */
export function topLevelDeclarators(node: AnyNode): AnyNode[] {
  const varDecl =
    node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
      ? node.declaration
      : node.type === 'VariableDeclaration'
        ? node
        : undefined
  return (varDecl?.declarations as AnyNode[] | undefined) ?? []
}

export function readObjectProp(obj: AnyNode | undefined, name: string): AnyNode | undefined {
  if (obj?.type !== 'ObjectExpression') return undefined
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    if (staticPropKey(prop) === name) return prop.value as AnyNode | undefined
  }
  return undefined
}

/** Collect every string/number/boolean-literal property of an ObjectExpression
 * into a `name → String(value)` record. Non-literal values are dropped (the
 * caller decides whether a missing key is fatal). */
export function readLiteralEntries(obj: AnyNode | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (obj?.type !== 'ObjectExpression') return out
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    const key = staticPropKey(prop)
    if (typeof key !== 'string') continue
    const v = prop.value as AnyNode | undefined
    const val = v?.value
    if (
      (v?.type === 'Literal' ||
        v?.type === 'StringLiteral' ||
        v?.type === 'NumericLiteral' ||
        v?.type === 'BooleanLiteral') &&
      (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
    ) {
      out[key] = String(val)
    }
  }
  return out
}

/**
 * The raw value NODE of each non-computed property of an object literal.
 *
 * The node-level twin of {@link readLiteralEntries}, which collapses each
 * value to a string and therefore cannot distinguish "absent" from "present
 * but not a literal" — the exact distinction runtime path params turn on: a
 * MISSING param can only bail, while a present-but-reactive one lowers to
 * native string interpolation.
 */
export function readEntryNodes(obj: AnyNode | undefined): Record<string, AnyNode> {
  const out: Record<string, AnyNode> = {}
  if (obj?.type !== 'ObjectExpression') return out
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    const key = propName(prop)
    if (typeof key !== 'string') continue
    const v = prop.value as AnyNode | undefined
    if (v) out[key] = v
  }
  return out
}

/** The literal value of a string/number/boolean literal node, else undefined. */
export function literalScalar(v: AnyNode | undefined): string | number | boolean | undefined {
  const val = v?.value
  if (
    (v?.type === 'Literal' ||
      v?.type === 'StringLiteral' ||
      v?.type === 'NumericLiteral' ||
      v?.type === 'BooleanLiteral') &&
    (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
  ) {
    return val
  }
  return undefined
}

/** The statically-known property name of an object-literal `Property`, else undefined. */
export function propName(prop: AnyNode): string | undefined {
  return staticPropKey(prop)
}

/**
 * The STATICALLY-KNOWN key of an object-literal / object-pattern property.
 *
 * A non-computed identifier key → its name; a string/number literal key
 * (`{ 'a-b': 1 }`, `{ 0: 1 }`, and the computed `{ ['a']: 1 }`) → its value.
 * Anything else — above all a COMPUTED identifier key `{ [kind]: … }`, whose
 * key is the RUNTIME VALUE of `kind`, not the string "kind" — is NOT
 * statically known and returns undefined.
 *
 * Every literal-config reader in this file goes through here. The class it
 * closes: readers tested `key.type === 'Identifier'` without `prop.computed`,
 * so `{ [kind]: v }` was silently read as the literal key "kind". Pair it with
 * {@link hasDynamicKey} to NAME the entry rather than silently skip it.
 */
export function staticPropKey(prop: AnyNode | undefined): string | undefined {
  if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') return undefined
  const key = prop.key as AnyNode | undefined
  if (!key) return undefined
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') {
    return prop.computed === true ? undefined : (key.name as string)
  }
  const v = key.value
  if (
    (key.type === 'Literal' || key.type === 'StringLiteral' || key.type === 'NumericLiteral') &&
    (typeof v === 'string' || typeof v === 'number')
  ) {
    return String(v)
  }
  // `` { [`a`]: … } `` — a template literal with NO substitutions is a static
  // string, exactly like `['a']`.
  if (
    prop.computed === true &&
    key.type === 'TemplateLiteral' &&
    ((key.expressions as AnyNode[] | undefined)?.length ?? 0) === 0
  ) {
    const cooked = (key.quasis as AnyNode[] | undefined)?.[0]?.value?.cooked
    if (typeof cooked === 'string') return cooked
  }
  return undefined
}

/**
 * True when a property's key is a computed expression that is NOT a literal
 * (`{ [kind]: … }`, `{ [\`a${b}\`]: … }`) — i.e. the key only exists at
 * runtime, so no compile-time reader can know which entry it is.
 */
export function hasDynamicKey(prop: AnyNode | undefined): boolean {
  if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') return false
  return prop.computed === true && staticPropKey(prop) === undefined
}

/** Source text of a dynamic key, for warnings (`[kind]`). */
export function dynamicKeyText(prop: AnyNode, ctx: { source: string }): string {
  const k = prop.key as AnyNode | undefined
  const text =
    k && typeof k.start === 'number' && typeof k.end === 'number'
      ? ctx.source.slice(k.start, k.end)
      : 'expr'
  return `[${text}]`
}

/** Strip TS type-only wrappers + parens to reach the underlying expression. */
export function unwrapTypeLayers(node: AnyNode | undefined): AnyNode | undefined {
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

/** True for `null`, `undefined`, or an absent node — the entries the web drops. */
export function isNullishLiteral(v: AnyNode | undefined): boolean {
  if (v === undefined || v === null) return true
  if (v.type === 'NullLiteral') return true
  if ((v.type === 'Literal' || v.type === 'NullLiteral') && v.value === null) return true
  return v.type === 'Identifier' && v.name === 'undefined'
}

/**
 * Evaluate a JSON-shaped literal AST node to its runtime value.
 *
 * Returns a WRAPPER (`{ value }`) rather than the value itself so a literal
 * `null` / `false` / `0` is distinguishable from "not a literal".
 */
export function readJsonLiteral(node: AnyNode | undefined): { value: unknown } | undefined {
  if (node === undefined) return undefined
  if (node.type === 'NullLiteral' || ((node.type === 'Literal') && node.value === null)) {
    return { value: null }
  }
  const scalar = literalScalar(node)
  if (scalar !== undefined) return { value: scalar }
  // `-1` parses as a unary expression, not a numeric literal.
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
    const inner = literalScalar(node.argument as AnyNode | undefined)
    if (typeof inner === 'number') return { value: node.operator === '-' ? -inner : inner }
    return undefined
  }
  if (node.type === 'ArrayExpression') {
    const items: unknown[] = []
    for (const el of (node.elements as AnyNode[] | undefined) ?? []) {
      const read = readJsonLiteral(el)
      if (read === undefined) return undefined
      items.push(read.value)
    }
    return { value: items }
  }
  if (node.type === 'ObjectExpression') {
    const obj: Record<string, unknown> = {}
    for (const prop of (node.properties as AnyNode[] | undefined) ?? []) {
      const key = propName(prop)
      if (key === undefined) return undefined
      const read = readJsonLiteral(prop.value as AnyNode | undefined)
      if (read === undefined) return undefined
      obj[key] = read.value
    }
    return { value: obj }
  }
  return undefined
}


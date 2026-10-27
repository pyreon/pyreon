import {
  isCanonicalPrimitive,
  resolveThemeToken,
  unwrapTypeLayers,
  type ThemeTable,
  type ExprIR,
} from '@pyreon/native-compiler/plugin-api'
import type { StyledComponentIR } from './types'
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

export function parseStyledDefn(
  node: AnyNode,
  ctx: { warnings: string[]; theme: ThemeTable },
  factory = 'styled',
): StyledComponentIR | null {
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration') varDecl = node
  else if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  }
  if (!varDecl || varDecl.kind !== 'const') return null
  const decls = (varDecl.declarations as AnyNode[]) ?? []
  if (decls.length !== 1) return null
  const decl = decls[0]
  if (decl?.id?.type !== 'Identifier') return null
  const name = decl.id.name as string
  const init = unwrapTypeLayers(decl.init)
  if (init?.type !== 'TaggedTemplateExpression') return null
  // The tag must be `styled(<Prim>)`.
  const tagCall = unwrapTypeLayers(init.tag)
  // `styled.div\`…\`` (the web's Proxy form) names an HTML tag by construction, so it can never lower; without
  // this it fell through to the core's generic "tagged template literal is not supported", which names the wrong
  // cause. Give it the same explanation as `styled('div')`.
  if (
    tagCall?.type === 'MemberExpression' &&
    tagCall.computed !== true &&
    tagCall.object?.type === 'Identifier' &&
    tagCall.object.name === factory &&
    tagCall.property?.type === 'Identifier'
  ) {
    const tag = tagCall.property.name as string
    ctx.warnings.push(
      `${factory}.${tag} on '${name}': only styled() wrapping a CANONICAL @pyreon/primitives ` +
        `component (Stack/Text/Button/Press/Field/…) lowers to native — '${tag}' has no native ` +
        `primitive, so <${name}> was left unresolved. Wrap a canonical primitive instead (\`${factory}(Stack)\`), or use a Layer-4 adapter.`,
    )
    return null
  }
  if (tagCall?.type !== 'CallExpression') return null
  const callee = tagCall.callee
  if (callee?.type !== 'Identifier' || callee.name !== factory) return null
  const firstArg = unwrapTypeLayers((tagCall.arguments as AnyNode[])?.[0])
  if (!firstArg) return null
  let prim: string | null = null
  let printedArg = ''
  if (firstArg.type === 'Identifier') {
    prim = firstArg.name as string
    printedArg = prim
  } else if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
    prim = firstArg.value as string
    printedArg = `'${prim}'`
  }
  if (!prim) return null
  if (!isCanonicalPrimitive(prim)) {
    ctx.warnings.push(
      `styled(${printedArg}) on '${name}': only styled() wrapping a CANONICAL @pyreon/primitives ` +
        `component (Stack/Text/Button/Press/Field/…) lowers to native — '${prim}' has no native ` +
        `primitive, so <${name}> was left unresolved. Wrap a canonical primitive, or use a Layer-4 adapter.`,
    )
    return null
  }
  const quasi = init.quasi
  if (quasi?.type !== 'TemplateLiteral') return null
  return { name, tag: prim, styleObject: cssTemplateToStyleObject(quasi, name, ctx) }
}

/** kebab-case CSS property → the camelCase key the inline-style connector reads. */
function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
}

/**
 * A `styled()` CSS template to a style-object `ExprIR` (camelCase keys, literal
 * values). Static declarations lower verbatim; a declaration whose value is a
 * single THEME-TOKEN interpolation (`background: ${(t) => t.color.primary}`) is
 * RESOLVED via the theme-native frontend to its value. Any other interpolation
 * (a complex/runtime expression) is dropped + warned.
 */
function cssTemplateToStyleObject(
  quasi: AnyNode,
  declName: string,
  ctx: { warnings: string[]; theme: ThemeTable },
): Extract<ExprIR, { kind: 'object' }> {
  const quasis = (quasi.quasis as AnyNode[]) ?? []
  const expressions = (quasi.expressions as AnyNode[]) ?? []

  // Interleave quasis + interpolations into declarations, splitting on a text
  // `;` (an interpolation stays attached to the declaration it sits in).
  type Part = { t: 'text'; v: string } | { t: 'expr'; node: AnyNode }
  const decls: Part[][] = [[]]
  const pushText = (s: string) => {
    let buf = ''
    for (const ch of s) {
      if (ch === ';') {
        if (buf) decls[decls.length - 1]!.push({ t: 'text', v: buf })
        decls.push([])
        buf = ''
      } else buf += ch
    }
    if (buf) decls[decls.length - 1]!.push({ t: 'text', v: buf })
  }
  for (let i = 0; i < quasis.length; i++) {
    // Tagged templates retain raw CSS even when a CSS escape is invalid JS
    // (for example \\2014). An absent cooked value must not erase its siblings.
    pushText(quasis[i]?.value?.cooked ?? quasis[i]?.value?.raw ?? '')
    if (i < expressions.length) decls[decls.length - 1]!.push({ t: 'expr', node: expressions[i] })
  }

  const fields: { name: string; value: ExprIR }[] = []
  const droppedInterp: string[] = []
  for (const decl of decls) {
    let colonPart = -1
    let colonAt = -1
    for (let i = 0; i < decl.length; i++) {
      const p = decl[i]!
      if (p.t === 'text') {
        const idx = p.v.indexOf(':')
        if (idx !== -1) {
          colonPart = i
          colonAt = idx
          break
        }
      }
    }
    if (colonPart === -1) continue
    const propRaw = (
      decl
        .slice(0, colonPart)
        .map((p) => (p.t === 'text' ? p.v : ''))
        .join('') + (decl[colonPart] as { t: 'text'; v: string }).v.slice(0, colonAt)
    ).trim()
    if (!propRaw || !/^[-a-zA-Z][-a-zA-Z0-9]*$/.test(propRaw)) continue
    const name = kebabToCamel(propRaw)

    const valueParts: Part[] = []
    const tail = (decl[colonPart] as { t: 'text'; v: string }).v.slice(colonAt + 1)
    if (tail.length > 0) valueParts.push({ t: 'text', v: tail })
    for (let i = colonPart + 1; i < decl.length; i++) valueParts.push(decl[i]!)

    const exprs = valueParts.filter((p): p is { t: 'expr'; node: AnyNode } => p.t === 'expr')
    const textBlank = valueParts.every((p) => p.t !== 'text' || p.v.trim() === '')

    if (exprs.length === 0) {
      const valueRaw = valueParts
        .map((p) => (p.t === 'text' ? p.v : ''))
        .join('')
        .trim()
      if (!valueRaw) continue
      const num = /^[+-]?\d+(?:\.\d+)?$/.test(valueRaw) ? Number(valueRaw) : null
      fields.push({ name, value: { kind: 'literal', value: num !== null ? num : valueRaw } })
    } else if (exprs.length === 1 && textBlank) {
      const tok = resolveThemeToken(exprs[0]!.node, ctx.theme)
      if (tok !== null) fields.push({ name, value: { kind: 'literal', value: tok } })
      else droppedInterp.push(propRaw)
    } else {
      droppedInterp.push(propRaw)
    }
  }
  if (droppedInterp.length > 0) {
    ctx.warnings.push(
      `styled(...) '${declName}': value(s) [${droppedInterp.join(', ')}] use an interpolation that isn't a ` +
        `resolvable theme token — only static values + \`t.<group>.<entry>\` tokens lower to native (dropped).`,
    )
  }
  return { kind: 'object', fields, spreads: [] }
}

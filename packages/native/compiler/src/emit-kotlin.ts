// Pyreon IR → Kotlin / Jetpack Compose source.
//
// Mirrors emit-swift.ts but produces idiomatic Compose. Signals map to
// `var x by remember { mutableStateOf(initial) }`, computeds to
// `derivedStateOf { ... }`, JSX elements to Composable function calls.

import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  DeclIR,
  ExprIR,
  TypeIR,
} from './types'

export function emitKotlin(components: ComponentIR[]): string {
  return components.map(emitKotlinComponent).join('\n\n')
}

interface KotlinCtx {
  /** Anonymous object types synthesized as named data classes. */
  synthesizedDataClasses: { name: string; fields: { name: string; type: TypeIR }[] }[]
  /** Component name, used to derive synthesized data class names. */
  componentName: string
}

// Module-scoped state for the active component's props-param-name —
// same pattern as emit-swift.ts. Set at the start of each component
// emit so the `member` case can rewrite `props.title` → `title`.
// Reset to undefined after each component.
let _activePropsParamName: string | undefined

function emitKotlinComponent(c: ComponentIR): string {
  _activePropsParamName = c.propsParamName
  const ctx: KotlinCtx = { synthesizedDataClasses: [], componentName: c.name }
  // First pass: walk decls, synthesizing data classes for anonymous object
  // types found in array-of-object signals. The decls themselves are
  // emitted in the second pass so the synthesized type names are stable.
  const declTexts = c.decls.map((d) => emitKotlinDecl(d, ctx))
  const lines: string[] = []
  for (const synth of ctx.synthesizedDataClasses) {
    lines.push(emitKotlinDataClass(synth))
    lines.push('')
  }
  // Props become Composable function parameters. Compose canonical
  // pattern — parent code calls `Card(title = "...", body = "...")`,
  // params are immutable per call.
  const propsList = c.props
    .map((p) => `${p.name}: ${kotlinType(p.type, ctx, p.name)}`)
    .join(', ')
  lines.push(`@Composable`)
  lines.push(`fun ${c.name}(${propsList}) {`)
  for (const declText of declTexts) {
    lines.push(`  ${declText}`)
  }
  lines.push(`  ${emitKotlinExpr(c.returnExpr, 2)}`)
  lines.push(`}`)
  _activePropsParamName = undefined
  return lines.join('\n')
}

function emitKotlinDataClass(synth: {
  name: string
  fields: { name: string; type: TypeIR }[]
}): string {
  const params = synth.fields.map((f) => `val ${f.name}: ${kotlinType(f.type)}`).join(', ')
  return `data class ${synth.name}(${params})`
}

function emitKotlinDecl(d: DeclIR, ctx: KotlinCtx): string {
  if (d.kind === 'signal') {
    const initial = emitKotlinExpr(d.initial, 0)
    // For empty-array initials, Kotlin's `listOf()` returns `List<Nothing>`,
    // which can't be added to. Use the type annotation to emit an explicit
    // generic on `mutableStateOf<List<T>>(listOf())`. Non-array types use
    // plain `mutableStateOf` and let Kotlin infer.
    if (d.type.kind === 'array' && d.initial.kind === 'array' && d.initial.elements.length === 0) {
      return `var ${d.name} by remember { mutableStateOf<${kotlinType(d.type, ctx, d.name)}>(listOf()) }`
    }
    return `var ${d.name} by remember { mutableStateOf(${initial}) }`
  }
  // computed → derivedStateOf, accessed via the `by` delegate.
  return `val ${d.name} by remember { derivedStateOf { ${emitKotlinExpr(d.expr, 0)} } }`
}

function kotlinType(t: TypeIR, ctx?: KotlinCtx, signalName?: string): string {
  switch (t.kind) {
    case 'number':
      return 'Int'
    case 'string':
      return 'String'
    case 'boolean':
      return 'Boolean'
    case 'array':
      return `List<${kotlinType(t.element, ctx, signalName)}>`
    case 'object': {
      // Anonymous object types are synthesized as named data classes per
      // component. Class name derives from the component + signal name:
      // `Sum` + `items` → `SumItem`. Idempotent across decls in the same
      // component (same shape ⇒ same name).
      if (!ctx) return 'Any'
      const fields = t.fields
      const name = synthesizeDataClassName(ctx.componentName, signalName)
      const existing = ctx.synthesizedDataClasses.find((s) => s.name === name)
      if (!existing) ctx.synthesizedDataClasses.push({ name, fields })
      return name
    }
    default:
      return 'Any'
  }
}

function synthesizeDataClassName(componentName: string, signalName?: string): string {
  // `TodoList` + `items` → `TodoListItem`
  // `TodoList` + `entries` → `TodoListEntry`
  // Fallback: `TodoListData`
  if (!signalName) return `${componentName}Data`
  const stripped = signalName.endsWith('s') ? signalName.slice(0, -1) : signalName
  return componentName + stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

function emitKotlinExpr(e: ExprIR, indent: number): string {
  switch (e.kind) {
    case 'literal':
      if (typeof e.value === 'string') return JSON.stringify(e.value)
      if (typeof e.value === 'boolean') return e.value ? 'true' : 'false'
      return String(e.value)
    case 'identifier':
      return e.name
    case 'call': {
      // `signal.set(x)` → `signal = x` (Kotlin's `by mutableStateOf` is a var).
      if (e.callee.kind === 'member' && e.callee.property === 'set') {
        const target = emitKotlinExpr(e.callee.object, indent)
        const value = e.args[0] ? emitKotlinExpr(e.args[0], indent) : '0'
        return `${target} = ${value}`
      }
      // Bare signal call `count()` → `count` (the delegated `by` makes it a plain read).
      if (e.callee.kind === 'identifier' && e.args.length === 0) {
        return e.callee.name
      }
      const callee = emitKotlinExpr(e.callee, indent)
      const args = e.args.map((a) => emitKotlinExpr(a, indent)).join(', ')
      return `${callee}(${args})`
    }
    case 'member': {
      // Rewrite `<propsParamName>.X` → `X`. The active component's
      // props-param binding is exposed as direct function parameters
      // in the Composable signature, so the user-source `props.title`
      // becomes a bare `title` reference in the function body.
      if (
        _activePropsParamName !== undefined &&
        e.object.kind === 'identifier' &&
        e.object.name === _activePropsParamName
      ) {
        return e.property
      }
      return `${emitKotlinExpr(e.object, indent)}.${e.property}`
    }
    case 'binary':
      return `${emitKotlinExpr(e.left, indent)} ${e.op} ${emitKotlinExpr(e.right, indent)}`
    case 'arrow':
      if (e.params.length === 0) return `{ ${emitKotlinExpr(e.body, indent)} }`
      return `{ ${e.params.join(', ')} -> ${emitKotlinExpr(e.body, indent)} }`
    case 'jsx-element':
      return emitKotlinJsx(e, indent)
    case 'jsx-fragment': {
      const pad = ' '.repeat(indent + 2)
      const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
      return `Column {\n${body}\n${' '.repeat(indent)}}`
    }
    case 'array':
      return `listOf(${e.elements.map((el) => emitKotlinExpr(el, indent)).join(', ')})`
    case 'object': {
      const fields = e.fields.map((f) => `${f.name} = ${emitKotlinExpr(f.value, indent)}`).join(', ')
      return `(${fields})`
    }
    case 'paren':
      return `(${emitKotlinExpr(e.inner, indent)})`
  }
}

function emitKotlinJsx(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag
  if (tag === 'For') return emitKotlinFor(e, indent)
  if (tag === 'Show') return emitKotlinShow(e, indent)
  if (tag === 'Text') return emitKotlinText(e, indent)
  if (tag === 'Button') return emitKotlinButton(e, indent)
  return emitKotlinGeneric(e, indent)
}

function emitKotlinText(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  if (e.children.length === 0) return `Text(text = "")`
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return `Text(text = ${JSON.stringify(e.children[0]!.value)})`
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') parts.push(escapeKotlinInterp(c.value))
    else parts.push(`\${${emitKotlinExpr(c.expr, indent)}}`)
  }
  return `Text(text = "${parts.join('')}")`
}

function emitKotlinButton(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const onClick = e.attrs.find((a) => a.kind === 'event' && a.name === 'click') as
    | Extract<AttrIR, { kind: 'event' }>
    | undefined
  const labelText = extractStaticText(e.children)
  const action = onClick ? emitKotlinAction(onClick.handler, indent) : '{}'
  const pad = ' '.repeat(indent + 2)
  if (labelText !== null) {
    return `Button(onClick = ${action}) {\n${pad}Text(${JSON.stringify(labelText)})\n${' '.repeat(indent)}}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Button(onClick = ${action}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitKotlinAction(handler: ExprIR, indent: number): string {
  if (handler.kind === 'arrow') {
    return `{ ${emitKotlinExpr(handler.body, indent)} }`
  }
  return `{ ${emitKotlinExpr(handler, indent)} }`
}

function emitKotlinFor(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const each = e.attrs.find((a) => a.kind === 'attr' && a.name === 'each') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const by = e.attrs.find((a) => a.kind === 'attr' && a.name === 'by') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const renderArrow = e.children.find(
    (c) => c.kind === 'expr' && c.expr.kind === 'arrow',
  ) as Extract<ChildIR, { kind: 'expr' }> | undefined

  const items = each ? emitKotlinSignalRead(each.value) : 'items'
  const idPath = by && by.value.kind === 'arrow' ? extractMemberPath(by.value.body) : 'id'

  if (!renderArrow || renderArrow.expr.kind !== 'arrow') {
    return `LazyColumn {\n${' '.repeat(indent + 2)}items(${items}, key = { it.${idPath} }) {}\n${' '.repeat(indent)}}`
  }
  const arrow = renderArrow.expr as Extract<ExprIR, { kind: 'arrow' }>
  const param = arrow.params[0] ?? 'item'
  const body = arrow.body
  const pad = ' '.repeat(indent + 4)
  const close = ' '.repeat(indent + 2)
  const outerClose = ' '.repeat(indent)
  return (
    `LazyColumn {\n` +
    `${' '.repeat(indent + 2)}items(${items}, key = { it.${idPath} }) { ${param} ->\n` +
    `${pad}${emitKotlinExpr(body, indent + 4)}\n` +
    `${close}}\n` +
    `${outerClose}}`
  )
}

function emitKotlinShow(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const when = e.attrs.find((a) => a.kind === 'attr' && a.name === 'when') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const cond = when ? emitKotlinSignalRead(when.value) : 'true'
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `if (${cond}) {\n${body}\n${' '.repeat(indent)}}`
}

function emitKotlinGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const attrPairs = e.attrs
    .filter((a) => a.kind === 'attr')
    .map((a) => {
      const aa = a as Extract<AttrIR, { kind: 'attr' }>
      return `${aa.name} = ${emitKotlinExpr(aa.value, indent)}`
    })
    .join(', ')
  if (e.children.length === 0) {
    return attrPairs ? `${e.tag}(${attrPairs})` : `${e.tag}()`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  if (attrPairs) {
    return `${e.tag}(${attrPairs}) {\n${contentLines}\n${' '.repeat(indent)}}`
  }
  return `${e.tag} {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitKotlinChild(c: ChildIR, indent: number): string {
  if (c.kind === 'text') return `Text(text = ${JSON.stringify(c.value)})`
  return emitKotlinExpr(c.expr, indent)
}

function emitKotlinSignalRead(e: ExprIR): string {
  if (e.kind === 'identifier') return e.name
  return emitKotlinExpr(e, 0)
}

function extractStaticText(children: ChildIR[]): string | null {
  if (children.length === 0) return ''
  if (children.length === 1 && children[0]!.kind === 'text') return children[0]!.value
  return null
}

function extractMemberPath(expr: ExprIR): string {
  if (expr.kind === 'member') return expr.property
  return 'id'
}

function escapeKotlinInterp(s: string): string {
  // Escape backslashes, double-quotes, and `$` (Kotlin's interp marker).
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')
}

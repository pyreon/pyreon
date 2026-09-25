/**
 * Render props and view-typed props — the part of a component's contract that
 * is a VIEW, not a value.
 *
 * Pyreon writes it three ways, and they are one concept:
 *
 *   children: VNodeChild                          // a slot: `<Card>…</Card>`
 *   children: (user: User | undefined) => unknown // function-as-children
 *   render: (item: Item) => VNodeChild            // a render prop
 *
 * Before this module each target lowered them as VALUES. Swift declared
 * `let children: (User?) -> Void` and the call site interpolated the closure
 * into a `Text` — a debug description on screen, or a type error; Kotlin
 * declared a plain `(User?) -> Unit`, which is not `@Composable`, so the body
 * could not call a composable from it. `VNodeChild` itself reached both
 * targets as a type name neither has.
 *
 * The native shape is the same idea both platforms already use for their own
 * containers: a SwiftUI view takes a generic `@ViewBuilder let x: (T) -> C`
 * (with `C: View` a type parameter of the struct, inferred from the call
 * site), and a Compose function takes `x: @Composable (T) -> Unit`. A bare
 * `VNodeChild` is the zero-argument case of the same thing.
 *
 * This file only CLASSIFIES — which props are slots, which bindings are
 * functions returning a view — so the two emitters cannot disagree about it.
 * Each emitter owns its own spelling.
 */

import { exprContainsJsx } from './expr-utils'
import { liftInlineObjectStructs } from './inline-object-structs'
import type { ComponentIR, DeclIR, ExprIR, ModuleDeclIR, StructIR, TypeIR } from './types'

/**
 * Type names that mean "a view". `VNodeChild` is Pyreon's; the others are
 * what a TS author reaches for out of habit, and they denote the same thing.
 */
const VIEW_TYPE_NAMES: ReadonlySet<string> = new Set([
  'VNodeChild',
  'VNode',
  'JSX.Element',
  'Element',
])

/** `T | null | undefined` → `T` (only when exactly one non-nullish branch). */
function stripNullish(t: TypeIR): { type: TypeIR; optional: boolean } {
  if (t.kind !== 'union') return { type: t, optional: false }
  const rest = t.branches.filter((b) => b.kind !== 'null' && b.kind !== 'undefined')
  if (rest.length === 1 && rest.length < t.branches.length) return { type: rest[0]!, optional: true }
  return { type: t, optional: false }
}

/** Is `t` a type that denotes a view (`VNodeChild`, `JSX.Element`, …)? */
export function isViewType(t: TypeIR): boolean {
  const { type } = stripNullish(t)
  return type.kind === 'typeRef' && type.args.length === 0 && VIEW_TYPE_NAMES.has(type.name)
}

export interface SlotProp {
  /** The prop name — also the native property / parameter name. */
  name: string
  /** Callback parameter types, in order. Empty for a bare `VNodeChild` slot. */
  params: TypeIR[]
  /** Callback parameter names from the declaration (for struct naming only). */
  paramNames: (string | undefined)[]
  /**
   * The prop is a VIEW, not a function returning one — `children: VNodeChild`.
   * The body reads it bare (`{props.children}`), and the native side still
   * needs a closure it can invoke, so a reference lowers to `children()`.
   */
  bare: boolean
  /** `render?: …` — the caller may omit it. */
  optional: boolean
}

/** Unwrap parens. */
function unparen(e: ExprIR): ExprIR {
  return e.kind === 'paren' ? unparen(e.inner) : e
}

/**
 * The prop name `e` refers to, when it is a reference to one of the
 * component's props: `props.render` (member of the props parameter) or a bare
 * `render` (the emitters rewrite `props.x` to `x`, so a component body whose
 * prop was already rewritten reads it bare).
 */
export function propRefName(e: ExprIR, propsParamName: string | undefined): string | null {
  const x = unparen(e)
  if (x.kind === 'identifier') return x.name
  if (
    x.kind === 'member' &&
    propsParamName !== undefined &&
    x.object.kind === 'identifier' &&
    x.object.name === propsParamName
  ) {
    return x.property
  }
  return null
}

/**
 * Names of props the body INVOKES in view position — the component's return
 * expression, or a JSX child of it. This is the evidence for a function prop
 * whose declared return type says nothing (`=> unknown`, or no annotation):
 * the body rendering its result is what makes it a render prop.
 */
function viewInvokedProps(c: ComponentIR): Set<string> {
  const out = new Set<string>()
  const visit = (e: ExprIR): void => {
    const x = unparen(e)
    switch (x.kind) {
      case 'call': {
        const name = propRefName(x.callee, c.propsParamName)
        if (name !== null) out.add(name)
        return
      }
      case 'ternary':
        visit(x.then)
        visit(x.otherwise)
        return
      case 'logical':
        visit(x.right)
        return
      case 'arrow':
        // `return () => …` — the reactive-accessor return shape.
        if (x.body !== undefined) visit(x.body)
        return
      case 'jsx-element':
      case 'jsx-fragment':
        for (const ch of x.children) if (ch.kind === 'expr') visit(ch.expr)
        return
      default:
        return
    }
  }
  visit(c.returnExpr)
  return out
}

/**
 * The component's slot props, in declaration order.
 *
 * A function-typed prop is a slot when its declared return type is a view, OR
 * when it says nothing about its return (`unknown` — how `=> unknown` and an
 * unannotated return both parse) and the body renders its result. A function
 * prop returning a VALUE (`format: (n: number) => string`) is never a slot.
 */
export function slotPropsOf(c: ComponentIR): SlotProp[] {
  const invoked = viewInvokedProps(c)
  const out: SlotProp[] = []
  for (const p of c.props) {
    const { type, optional } = stripNullish(p.type)
    if (isViewType(type)) {
      out.push({ name: p.name, params: [], paramNames: [], bare: true, optional })
      continue
    }
    if (type.kind !== 'function') continue
    const ret = type.returnType
    const viewReturn = isViewType(ret)
    const silentReturn = ret.kind === 'unknown'
    if (!viewReturn && !(silentReturn && invoked.has(p.name))) continue
    out.push({
      name: p.name,
      params: type.params.map((q) => q.type),
      paramNames: type.params.map((q) => q.name),
      bare: false,
      optional,
    })
  }
  return out
}

/**
 * Does `e` build a view? The structural answer only — an element, a fragment,
 * or a conditional / short-circuit whose branch is one. Calls are the
 * emitters' business (they know which names are view helpers and slots).
 */
export function isViewShaped(e: ExprIR): boolean {
  const x = unparen(e)
  if (x.kind === 'jsx-element' || x.kind === 'jsx-fragment') return true
  if (x.kind === 'ternary') return isViewShaped(x.then) || isViewShaped(x.otherwise)
  if (x.kind === 'logical') return isViewShaped(x.right)
  return false
}

/**
 * A function that returns a view, callable by name — the `renderRow` a render
 * prop is handed by reference, or a helper called as `{renderRow(x)}`.
 *
 * Lowered as `@ViewBuilder func` (Swift) / `@Composable fun` (Kotlin). Every
 * parameter must be annotated: a Swift function parameter has no inference, so
 * an unannotated one has no spelling at all.
 */
export interface ViewHelper {
  name: string
  params: { name: string; type: TypeIR }[]
  body: ExprIR
}

/** A component-scope `const renderX = (u: T) => <…/>` / `function renderX(u: T) { return <…/> }`. */
export function viewHelperFromDecl(d: DeclIR): ViewHelper | null {
  if (d.kind !== 'function') return null
  if (d.body.length !== 1) return null
  const only = d.body[0]!
  if (only.kind !== 'return' || only.expr === undefined) return null
  if (!isViewShaped(only.expr)) return null
  if (d.params.some((p) => p.type.kind === 'unknown' || p.defaultValue !== undefined)) return null
  return { name: d.name, params: d.params.map((p) => ({ name: p.name, type: p.type })), body: only.expr }
}

/** A file-scope `const renderX = (u: T) => <…/>`. */
export function viewHelperFromModuleDecl(md: ModuleDeclIR): ViewHelper | null {
  const init = md.initial
  if (md.mutable || init.kind !== 'arrow') return null
  if (init.stmts !== undefined && init.stmts.length > 0) return null
  if (!isViewShaped(init.body)) return null
  const types = init.paramTypes ?? []
  const params: { name: string; type: TypeIR }[] = []
  for (const [i, name] of init.params.entries()) {
    const t = types[i]
    if (t === undefined || t.kind === 'unknown') return null
    params.push({ name, type: t })
  }
  return { name: md.name, params, body: init.body }
}

/** Every file-scope view helper, keyed by name. */
export function moduleViewHelpers(moduleDecls: readonly ModuleDeclIR[]): Map<string, ViewHelper> {
  const out = new Map<string, ViewHelper>()
  for (const md of moduleDecls) {
    const h = viewHelperFromModuleDecl(md)
    if (h !== null) out.set(h.name, h)
  }
  return out
}

/**
 * Is `e` an inline render callback — an arrow whose result is a view? The
 * call-site half of the classification, decided LOCALLY so it works when the
 * receiving component lives in another file (PMTC resolves nothing across
 * files, and generated clients put their data components in their own module).
 */
export function isRenderArrow(e: ExprIR): e is Extract<ExprIR, { kind: 'arrow' }> {
  const x = unparen(e)
  if (x.kind !== 'arrow') return false
  if (x.stmts !== undefined && x.stmts.length > 0) return x.stmts.some((s) => s.kind === 'return' && s.expr !== undefined && exprContainsJsx(s.expr))
  return isViewShaped(x.body)
}

/** The named warning for a block-bodied render callback. Same text on both targets. */
export function blockBodiedRenderCallbackWarning(where: string): string {
  return (
    `${where}: a render callback with a BLOCK body (\`(x) => { …; return <…/> }\`) is not lowered ` +
    `to native — a view builder takes one expression, not statements. An empty view is emitted in its ` +
    `place. Use an expression body (\`(x) => <…/>\`), and move any derivation into the receiving ` +
    `component or a \`computed\`.`
  )
}

/** A render-prop value that is none of the lowerable shapes. */
export function unlowerableRenderValueWarning(where: string): string {
  return (
    `${where}: this render prop is not an inline arrow (\`(x) => <…/>\`), a JSX-returning function ` +
    `declared in this file with annotated parameters, or a render prop forwarded from the enclosing ` +
    `component. PMTC cannot see what it renders, so it is passed through verbatim and will not compile ` +
    `on native. Inline the callback, or declare it in this file with typed parameters.`
  )
}

/** Swift only — an optional render slot has no spelling that keeps the generic inferable. */
export function optionalSlotSwiftWarning(component: string, prop: string): string {
  return (
    `${component}: the render prop \`${prop}\` is OPTIONAL. On iOS a render prop is a generic ` +
    `\`@ViewBuilder\` closure whose view type is inferred from the caller's closure, and a caller that ` +
    `omits it leaves nothing to infer it from — so it is emitted as REQUIRED, and a call site that ` +
    `leaves it out does not compile. Make it required, or give the omitting callers an explicit empty ` +
    `callback. (Android keeps it optional.)`
  )
}

function pascal(s: string): string {
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

/**
 * Give an inline object type in a render callback's parameter list a NAME.
 *
 * `render: (item: { title: string }) => VNodeChild` has no native spelling for
 * `{ title: string }`. Left anonymous, each target invented its own answer and
 * they disagreed with the call site: Swift collapsed a one-field shape to the
 * bare field type (`(String) -> …`) while the body built `__Obj0(title:)`, and
 * Kotlin synthesized `PickerRender` while the body built `__Obj0` — two
 * compile errors from one line of shared source.
 *
 * Lifting it to a declared struct (`PickerRenderItem`, named after the
 * component, the prop and the parameter) gives the declaration and the object
 * literal the body passes ONE type to agree on: the literal resolves to a
 * declared struct by its shape, and the emitters also pass the parameter type
 * as the literal's expected type. Mutates the component props in place.
 */
export function liftSlotParamStructs(
  components: ComponentIR[],
  declared: ReadonlySet<string>,
  warnings: string[],
): StructIR[] {
  const taken = new Set<string>([...declared, ...components.map((c) => c.name)])
  const out: StructIR[] = []
  for (const c of components) {
    for (const slot of slotPropsOf(c)) {
      if (slot.bare || !slot.params.some(containsObject)) continue
      const prop = c.props.find((p) => p.name === slot.name)!
      const { type: fnType, optional } = stripNullish(prop.type)
      if (fnType.kind !== 'function') continue
      const owner = `${c.name}${pascal(slot.name)}`
      const pseudo: StructIR = {
        name: owner,
        fields: fnType.params.map((q, i) => ({ name: q.name ?? `arg${i}`, type: q.type })),
      }
      const lifted = liftInlineObjectStructs(pseudo, taken)
      warnings.push(...lifted.warnings)
      for (const st of lifted.lifted) taken.add(st.name)
      out.push(...lifted.lifted)
      const params = fnType.params.map((q, i) => ({ ...q, type: lifted.struct.fields[i]!.type }))
      const next: TypeIR = { ...fnType, params }
      prop.type = optional ? { kind: 'union', branches: [next, { kind: 'undefined' }] } : next
    }
  }
  return out
}

function containsObject(t: TypeIR): boolean {
  switch (t.kind) {
    case 'object':
      return t.fields.length > 0
    case 'array':
    case 'set':
      return containsObject(t.element)
    case 'map':
      return containsObject(t.value)
    case 'union':
      return t.branches.some(containsObject)
    default:
      return false
  }
}

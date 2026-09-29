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
import { exits, narrowExpr } from './optional-narrowing'
import type { ComponentIR, DeclIR, ExprIR, ModuleDeclIR, StatementIR, StructIR, TypeIR } from './types'

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
export function unparenExpr(e: ExprIR): ExprIR {
  return e.kind === 'paren' ? unparenExpr(e.inner) : e
}
const unparen = unparenExpr

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
        // `return () => …` — the reactive-accessor return shape, and its
        // block-bodied form, whose view is every `return` it can reach.
        if (x.stmts !== undefined && x.stmts.length > 0) {
          const plan = planViewBlock(x.stmts)
          if (plan !== null) for (const v of viewBlockViews(plan)) visit(v)
          return
        }
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

/**
 * A view helper's parameter must have a native spelling. Unannotated has none;
 * an INLINE object type (`(p: { x: string }) => …`) is the component-props
 * shape, which is a component, not a helper — and lowering it here would type
 * the parameter as a degenerate tuple / `Any`.
 */
function isHelperParamType(t: TypeIR): boolean {
  return t.kind !== 'unknown' && !containsObject(t)
}

/** A component-scope `const renderX = (u: T) => <…/>` / `function renderX(u: T) { return <…/> }`. */
export function viewHelperFromDecl(d: DeclIR): ViewHelper | null {
  if (d.kind !== 'function') return null
  if (d.body.length !== 1) return null
  const only = d.body[0]!
  if (only.kind !== 'return' || only.expr === undefined) return null
  if (!isViewShaped(only.expr)) return null
  if (d.params.some((p) => !isHelperParamType(p.type) || p.defaultValue !== undefined)) return null
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
    if (t === undefined || !isHelperParamType(t)) return null
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
  if (x.stmts !== undefined && x.stmts.length > 0) return returnsJsx(x.stmts)
  return isViewShaped(x.body)
}

/** Does any `return` reachable in `stmts` (through nested `if`s) build JSX? */
function returnsJsx(stmts: readonly StatementIR[]): boolean {
  return stmts.some(
    (s) =>
      (s.kind === 'return' && s.expr !== undefined && exprContainsJsx(s.expr)) ||
      (s.kind === 'if' && (returnsJsx(s.then) || (s.elseBody !== undefined && returnsJsx(s.elseBody)))),
  )
}

/**
 * A BLOCK-bodied view — `(u) => { const n = u.name; if (!n) return <Empty/>; return <Text>{n}</Text> }`,
 * or the same body under a reactive accessor — as a tree both targets can
 * lower into their own view builder.
 *
 * A view builder is not a function body: it takes DECLARATIONS and
 * CONDITIONALS, and its "result" is the views its branches produce, with no
 * `return`. So a statement list lowers exactly when it has that shape —
 *
 *   - `const x = …`                       → a local (`let` / `val`),
 *   - `if (c) return A` then the rest     → `if c { A } else { rest }`,
 *   - `if (c) { … return A } else { … return B }` → the same, both arms planned,
 *   - a final `return view`               → the view (`return null` → nothing).
 *
 * Anything else — an assignment, a loop, a mutable local, a side-effecting
 * expression statement, an `if` that falls through — has no view-builder
 * spelling and returns null, and the caller names it.
 */
export type ViewBlock =
  | { kind: 'let'; stmt: Extract<StatementIR, { kind: 'let' }>; rest: ViewBlock }
  | { kind: 'if'; cond: ExprIR; then: ViewBlock; otherwise: ViewBlock }
  | { kind: 'view'; expr: ExprIR }
  | { kind: 'empty' }

export function planViewBlock(stmts: readonly StatementIR[]): ViewBlock | null {
  const [s, ...rest] = stmts
  if (s === undefined) return { kind: 'empty' }
  switch (s.kind) {
    case 'let': {
      if (s.mutable === true || s.methodMutated === true) return null
      const r = planViewBlock(rest)
      return r === null ? null : { kind: 'let', stmt: s, rest: r }
    }
    case 'return': {
      if (s.expr === undefined) return { kind: 'empty' }
      const e = unparen(s.expr)
      if (e.kind === 'literal' && e.value == null) return { kind: 'empty' }
      return { kind: 'view', expr: s.expr }
    }
    case 'if': {
      if (!exits(s.then)) return null
      const then = planViewBlock(s.then)
      if (then === null) return null
      if (s.elseBody !== undefined) {
        if (!exits(s.elseBody)) return null
        const otherwise = planViewBlock(s.elseBody)
        return otherwise === null ? null : { kind: 'if', cond: s.cond, then, otherwise }
      }
      const otherwise = planViewBlock(rest)
      return otherwise === null ? null : { kind: 'if', cond: s.cond, then, otherwise }
    }
    default:
      return null
  }
}

/** The views a block can produce (its leaves). */
export function viewBlockViews(b: ViewBlock): ExprIR[] {
  switch (b.kind) {
    case 'let':
      return viewBlockViews(b.rest)
    case 'if':
      return [...viewBlockViews(b.then), ...viewBlockViews(b.otherwise)]
    case 'view':
      return [b.expr]
    case 'empty':
      return []
  }
}

/** Every expression a block reads — for "does it read X" and binder naming. */
export function viewBlockExprs(b: ViewBlock): ExprIR[] {
  switch (b.kind) {
    case 'let':
      return [b.stmt.expr, ...viewBlockExprs(b.rest)]
    case 'if':
      return [b.cond, ...viewBlockExprs(b.then), ...viewBlockExprs(b.otherwise)]
    case 'view':
      return [b.expr]
    case 'empty':
      return []
  }
}

/** Names the block declares — a narrowing binder must not collide with one. */
export function viewBlockLocals(b: ViewBlock): string[] {
  switch (b.kind) {
    case 'let':
      return [b.stmt.name, ...viewBlockLocals(b.rest)]
    case 'if':
      return [...viewBlockLocals(b.then), ...viewBlockLocals(b.otherwise)]
    default:
      return []
  }
}

/**
 * `b` with every read of `subject` replaced by `binder` — the branch an
 * optional test narrowed. Null when any expression cannot be rewritten, or
 * when the block declares a local of the binder's name (it would shadow it).
 */
export function narrowViewBlock(b: ViewBlock, subject: ExprIR, binder: string): ViewBlock | null {
  if (viewBlockLocals(b).includes(binder)) return null
  const go = (x: ViewBlock): ViewBlock | null => {
    switch (x.kind) {
      case 'let': {
        const expr = narrowExpr(x.stmt.expr, subject, binder)
        const rest = go(x.rest)
        return expr === null || rest === null ? null : { kind: 'let', stmt: { ...x.stmt, expr }, rest }
      }
      case 'if': {
        const cond = narrowExpr(x.cond, subject, binder)
        const then = go(x.then)
        const otherwise = go(x.otherwise)
        return cond === null || then === null || otherwise === null ? null : { kind: 'if', cond, then, otherwise }
      }
      case 'view': {
        const expr = narrowExpr(x.expr, subject, binder)
        return expr === null ? null : { kind: 'view', expr }
      }
      case 'empty':
        return x
    }
  }
  return go(b)
}

/** The named warning for a block-bodied render callback that has no view-builder shape. Same text on both targets. */
export function blockBodiedRenderCallbackWarning(where: string): string {
  return (
    `${where}: this render callback's BLOCK body (\`(x) => { …; return <…/> }\`) is not lowered to native. ` +
    `A view builder takes declarations and conditionals, not statements, so a block body lowers only when ` +
    `it is \`const\` declarations, early \`if (…) return …\` branches and a final \`return\` — this one has ` +
    `something else (an assignment, a loop, a mutable local, an expression statement, or an \`if\` that ` +
    `falls through). An empty view is emitted in its place. Move that work into a \`computed\` or the ` +
    `receiving component.`
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

/**
 * Swift only — an optional render slot that could not get its per-subset
 * initializers (`reason`), so it is emitted REQUIRED.
 */
export function optionalSlotSwiftWarning(component: string, prop: string, reason: string): string {
  return (
    `${component}: the render prop \`${prop}\` is OPTIONAL, and on iOS an optional render prop needs one ` +
    `initializer per combination of provided slots — here ${reason}. It is emitted as REQUIRED, so a ` +
    `call site that leaves it out does not compile. Make it required, or give the omitting callers an ` +
    `explicit empty callback. (Android keeps it optional.)`
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
  existing: readonly StructIR[],
  warnings: string[],
): StructIR[] {
  const taken = new Set<string>([...declared, ...components.map((c) => c.name)])
  const out: StructIR[] = []
  // Structurally identical shapes are ONE type in TypeScript, so they must be
  // one struct natively: `Shell` forwarding its `render` to `Picker` passes a
  // `(ShellRenderItem) -> C` where `(PickerRenderItem) -> C` is expected, and
  // swiftc rejects it, although the TS was one type written twice. A lifted
  // shape that matches an existing struct field-for-field reuses its name.
  const byShape = new Map<string, string>()
  for (const st of existing) byShape.set(shapeKey(st.fields), st.name)
  const rename = new Map<string, string>()
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
      // Innermost first, so a nested shape is renamed before its parent's
      // key is computed.
      for (const st of lifted.lifted) {
        taken.add(st.name)
        const fields = st.fields.map((f) => ({ ...f, type: renameRefs(f.type, rename) }))
        const key = shapeKey(fields)
        const same = byShape.get(key)
        if (same !== undefined) {
          rename.set(st.name, same)
          continue
        }
        byShape.set(key, st.name)
        out.push({ ...st, fields })
      }
      const params = fnType.params.map((q, i) => ({
        ...q,
        type: renameRefs(lifted.struct.fields[i]!.type, rename),
      }))
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

function shapeKey(fields: readonly { name: string; type: TypeIR }[]): string {
  return JSON.stringify([...fields].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)))
}

function renameRefs(t: TypeIR, rename: ReadonlyMap<string, string>): TypeIR {
  switch (t.kind) {
    case 'typeRef': {
      const to = rename.get(t.name)
      return { ...t, name: to ?? t.name, args: t.args.map((a) => renameRefs(a, rename)) }
    }
    case 'array':
    case 'set':
      return { ...t, element: renameRefs(t.element, rename) }
    case 'map':
      return { ...t, value: renameRefs(t.value, rename) }
    case 'union':
      return { ...t, branches: t.branches.map((b) => renameRefs(b, rename)) }
    default:
      return t
  }
}

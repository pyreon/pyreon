// Shared ExprIR tree utilities consumed by BOTH emitters.
//
// First resident: identifier substitution for the `.update(fn)`
// lowering — `x.update((list) => list.map(...))` lowers to
// `x = <fn body with `list` replaced by the read of x>`, producing the
// SAME idiomatic native emit the hand-written `.set(x().map(...))`
// form produces (no IIFE, no closure-invocation noise).

import type { AttrIR, ChildIR, DeclIR, ExprIR, StructIR, TypeIR } from './types'

/**
 * Per-component map of `const name → scalar-literal value` for COMPONENT-SCOPE
 * consts, so a static-attr resolver (`<Image src={logo}>`, `<WebView html=…>`,
 * font, background) can resolve a named component-body const the same way it
 * already resolves a module-level one. Handles transitive aliases in source
 * order (`const a = '/x'; const b = a` → both resolve) — one forward pass
 * suffices because a `const` must be declared before it's referenced.
 *
 * Reads the `value` DeclIR (plain component-body consts; shipped with the
 * value-const widening). Only string / number / boolean literals + identifier
 * aliases to an already-known const are captured; anything else is skipped
 * (the static-attr path then falls through to its existing "needs static"
 * behavior, unchanged).
 */
export function buildComponentConstMap(decls: DeclIR[]): Map<string, string | number | boolean> {
  const map = new Map<string, string | number | boolean>()
  for (const d of decls) {
    if (d.kind !== 'value') continue
    const e = d.expr
    if (
      e.kind === 'literal' &&
      (typeof e.value === 'string' || typeof e.value === 'number' || typeof e.value === 'boolean')
    ) {
      map.set(d.name, e.value)
    } else if (e.kind === 'identifier') {
      const aliased = map.get(e.name)
      if (aliased !== undefined) map.set(d.name, aliased)
    }
  }
  return map
}

/**
 * True for an ExprIR whose surface form is a multi-operand operator
 * expression (binary / comparison / logical / ternary). Used by the
 * bitwise-op emit to decide whether an operand needs wrapping parens so
 * the JS-parsed grouping survives a target whose operator precedence
 * differs (Swift binds `&` tighter than `+`, the reverse of JS; Kotlin
 * infix functions bind looser than arithmetic). A simple atom (identifier /
 * literal / call / member / index / paren) never needs extra parens.
 */
/**
 * What a `ref={…}` attribute means to the SORTABLE lowering, if anything.
 *
 * `@pyreon/dnd`'s `useSortable` returns REF CALLBACKS the web author attaches
 * to DOM nodes (`ref={s.containerRef}` / `ref={s.itemRef(item.id)}`). On
 * native there are no DOM refs, but those two attributes are exactly the
 * places the drag behaviour belongs — so the SAME source lowers to a view
 * modifier on each target instead of being dropped.
 *
 * Defined here rather than in either emitter because both must agree on the
 * shape byte-for-byte; a per-emitter re-derivation is how the two backends
 * drift (the auto-call reachability class).
 *
 * Returns `null` for every other `ref` value, so an unrelated ref keeps the
 * existing behaviour (silently ignored on native) rather than mis-lowering.
 */
export type SortableRefBinding =
  | { kind: 'container'; state: string }
  | { kind: 'item'; state: string; key: ExprIR }

export function classifySortableRef(
  value: ExprIR,
  sortableNames: ReadonlySet<string>,
): SortableRefBinding | null {
  // `ref={s.containerRef}` — a bare member read.
  if (
    value.kind === 'member' &&
    value.property === 'containerRef' &&
    value.object.kind === 'identifier' &&
    sortableNames.has(value.object.name)
  ) {
    return { kind: 'container', state: value.object.name }
  }
  // `ref={s.itemRef(key)}` — a one-argument call on the member.
  if (
    value.kind === 'call' &&
    value.callee.kind === 'member' &&
    value.callee.property === 'itemRef' &&
    value.callee.object.kind === 'identifier' &&
    sortableNames.has(value.callee.object.name) &&
    value.args.length === 1
  ) {
    return { kind: 'item', state: value.callee.object.name, key: value.args[0] as ExprIR }
  }
  return null
}

export function isCompoundExpr(e: ExprIR): boolean {
  return (
    e.kind === 'binary' ||
    e.kind === 'comparison' ||
    e.kind === 'logical' ||
    e.kind === 'ternary'
  )
}

/**
 * True if the access CHAIN rooted at `e` contains an optional member link
 * (`a?.b`) anywhere along its object/callee spine. Drives `?.` PROPAGATION
 * in the emitters: once an optional link appears, every subsequent access
 * must also be `?.` — required for Kotlin (a plain `.c` on a nullable is a
 * type error) and valid for Swift. So `a?.b.c` emits `a?.b?.c` on both.
 */
export function chainHasOptional(e: ExprIR): boolean {
  if (e.kind === 'member') return e.optional === true || chainHasOptional(e.object)
  if (e.kind === 'index') return chainHasOptional(e.object)
  if (e.kind === 'call') return chainHasOptional(e.callee)
  return false
}

/** TypeIR for a SCALAR literal value (string / number / boolean), else null. */
export function scalarLiteralType(e: ExprIR): TypeIR | null {
  if (e.kind !== 'literal') return null
  if (typeof e.value === 'string') return { kind: 'string' }
  if (typeof e.value === 'number') {
    return { kind: 'number', float: !Number.isInteger(e.value) }
  }
  if (typeof e.value === 'boolean') return { kind: 'boolean' }
  return null // null literal — can't type a field from it
}

/**
 * Anonymous all-scalar-literal object EXPRESSION (`{ id: 1, name: 'a' }`) →
 * the name of a SYNTHESIZED struct/data-class for that shape, creating +
 * registering it on first sight (in the caller-owned `structs` / `keys`
 * state). Returns null when ANY field value is not a scalar literal — the
 * caller keeps its existing tuple emit (no regression). Without this, an
 * anonymous object degrades to a labelled tuple, which is illegal Swift for
 * a single field and breaks tuple key-paths (`ForEach(id:)`) + Codable.
 *
 * SHARED by both emitters so the synthesized names (`__Obj0`, `__Obj1`, …)
 * line up across targets: identical algorithm + identical source traversal
 * order → identical name assignment. Shape key = sorted `name:typekind`
 * pairs (so same-shape literals share one struct; same-names-different-scalar-
 * types get distinct structs).
 *
 * Field types come from `scalarLiteralType` (a literal value) OR, when the
 * optional `inferField` callback is supplied, from inferring a NON-literal
 * field's expression — so `{ id: count(), name: label() }` (signal reads)
 * synthesizes a struct too, not just `{ id: 1, name: 'a' }`. Only SCALAR
 * inferred kinds (number / string / boolean) are accepted: the shapeKey
 * distinguishes those precisely, whereas array / typeRef / nested-object
 * kinds collide on the lossy key, so an inferred non-scalar bails (→ the
 * caller keeps its tuple emit, unchanged). A field that is neither a scalar
 * literal nor a scalar-inferred expression returns null (no regression).
 * `inferField` is a callback (not an `InferenceCtx` import) so this module
 * stays dependency-free of `infer-type` — the caller, which already imports
 * `inferType`, passes `(e) => inferType(e, ctx)`.
 */
/**
 * A DECLARED struct whose fields are a superset of the literal's, where every
 * field the literal omits is OPTIONAL. Returns its name, or null.
 *
 * The exact field-set index that both emitters consult first cannot see this
 * case, and the gap is common rather than exotic: a type with an optional field
 * is ordinary TS, and a literal that simply does not set it is the normal way
 * to write one. `type T = { a: string; b?: string }` with `signal<T>({ a: 'x' })`
 * missed the index, fell through to synthesis, and emitted
 * `var v: T = __Obj0(a: "x")` — a type the annotation says it is not. Swift
 * rejects that outright, so the shape simply did not build; a recursive type
 * (a ProseMirror document, where the leaf node has `text` and the branch has
 * `content`) hits it at every level.
 *
 * Ambiguity BAILS rather than guessing: if two declared structs both accept the
 * literal, there is no type context here to choose between them, and picking
 * one would be a silent mis-construction. Same rule the exact index already
 * uses for a field-set collision.
 */
export function subsetStructName(
  literalFields: readonly string[],
  structs: readonly StructIR[],
  isOptional: (t: TypeIR) => boolean,
): string | null {
  const given = new Set(literalFields)
  let found: string | null = null
  for (const s of structs) {
    const names = new Set(s.fields.map((f) => f.name))
    // Every field the literal sets must exist on the struct...
    let ok = true
    for (const g of given) {
      if (!names.has(g)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    // ...and every field it does NOT set must be optional.
    for (const f of s.fields) {
      if (!given.has(f.name) && !isOptional(f.type)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    if (found !== null) return null // ambiguous — two structs accept it
    found = s.name
  }
  return found
}

/**
 * One piece of a JSON literal lowering: either static JSON text, or a runtime
 * expression whose encoded form goes in that slot.
 */
export type JsonLiteralPart = { static: string } | { dyn: ExprIR }

/**
 * Lower an object/array literal that sits in a JSON POSITION straight to JSON,
 * instead of routing it through struct synthesis.
 *
 * `<WebView data={…}>` immediately hands its value to `PyreonJSON.encode` /
 * `PyreonJson.encode`, so the value IS JSON — building a native struct for it is
 * a detour, and the detour fails on exactly the payloads JSON exists to carry.
 * An ECharts option object (`{ xAxis: { type: 'category', data: days }, yAxis:
 * {}, series: [{ type: 'bar', data: revenue() }] }`) has heterogeneous nested
 * shapes and empty objects; no struct can be synthesized for it, so the emit
 * fell back to a tuple — which is invalid Kotlin, and on Swift a non-`Codable`
 * value that `encode` cannot serialize. That is why `examples/native-viz`, the
 * charts webview example, did not build on Android.
 *
 * Static parts become JSON text at COMPILE time; anything else (a signal read,
 * a call, an identifier) becomes a hole the emitter fills with an `encode(…)`
 * interpolation, so live data still flows. Returns null if any part cannot be
 * represented — the caller then keeps its existing path unchanged.
 *
 * `undefined` maps to JSON `null`: JSON has no undefined, and omitting the key
 * instead would silently change the object's SHAPE, which a hosted page reading
 * `Object.keys` would see.
 */
export function buildJsonLiteralParts(expr: ExprIR): JsonLiteralPart[] | null {
  const parts: JsonLiteralPart[] = []
  const pushStatic = (text: string): void => {
    const last = parts[parts.length - 1]
    if (last !== undefined && 'static' in last) last.static += text
    else parts.push({ static: text })
  }
  const walk = (e: ExprIR): boolean => {
    if (e.kind === 'literal') {
      const v = e.value
      if (v === null || v === undefined) pushStatic('null')
      else if (typeof v === 'string') pushStatic(JSON.stringify(v))
      else pushStatic(String(v))
      return true
    }
    if (e.kind === 'array') {
      pushStatic('[')
      for (let i = 0; i < e.elements.length; i++) {
        if (i > 0) pushStatic(',')
        if (!walk(e.elements[i]!)) return false
      }
      pushStatic(']')
      return true
    }
    if (e.kind === 'object') {
      // A spread cannot be resolved to JSON text at compile time.
      if ((e.spreads?.length ?? 0) > 0) return false
      pushStatic('{')
      for (let i = 0; i < e.fields.length; i++) {
        if (i > 0) pushStatic(',')
        pushStatic(`${JSON.stringify(e.fields[i]!.name)}:`)
        if (!walk(e.fields[i]!.value)) return false
      }
      pushStatic('}')
      return true
    }
    if (e.kind === 'paren') return walk(e.inner)
    // Anything else is a runtime value — leave a hole for the emitter to fill
    // with its own `encode(…)` interpolation.
    parts.push({ dyn: e })
    return true
  }
  if (expr.kind !== 'object' && expr.kind !== 'array') return null
  return walk(expr) ? parts : null
}

/**
 * Why a field value cannot be given a struct-field type — the ONE place that
 * knows, so both emitters produce the same message for the same shape.
 *
 * Returns null when the value IS typeable (the caller should not warn).
 *
 * This exists because the failure is a CLASS, not a shape. The first cut of
 * this diagnostic enumerated the one shape that had been observed (an empty
 * array field) in the parser; a sweep across the synthesis frontier then found
 * five more that fail identically and just as silently — `null` and `undefined`
 * fields, a NESTED empty array, a mixed scalar array, an array of arrays. Every
 * one of them is an ordinary data model (`{ id, parent: null }` is a tree
 * node), and each would have needed its own parser rule. Asking the bail site
 * itself is one rule that covers all of them, and the next one too.
 */
export function explainUntypeableField(value: ExprIR): string | null {
  if (value.kind === 'array') {
    if (value.elements.length === 0) {
      return 'an empty array literal carries no element type, and guessing one would be contradicted by the first non-empty assignment'
    }
    const first = value.elements[0]!
    if (first.kind === 'array') {
      return 'an array of arrays has no synthesized element struct — nested list types are outside the synthesis frontier'
    }
    // Compare the literal VALUE types, not the IR kind — `1` and `'two'` are
    // both `kind: 'literal'`, so a kind comparison reports a mixed array as
    // homogeneous and falls through to the generic message.
    const kindOf = (el: ExprIR): string =>
      el.kind === 'literal' ? `literal:${typeof el.value}` : el.kind
    if (value.elements.some((el) => kindOf(el) !== kindOf(first))) {
      return 'the array mixes element types, so it has no single element type'
    }
    return 'the array element type could not be resolved'
  }
  if (value.kind === 'literal' && (value.value === null || value.value === undefined)) {
    return 'a `null`/`undefined` literal carries no type — native structs need a concrete (optional) field type, so annotate the declaration to say what it is optional OF'
  }
  if (value.kind === 'object') {
    return 'a nested object literal whose own fields are not all typeable (check the nested fields for the same causes)'
  }
  return null
}

export function synthLiteralStructName(
  fields: { name: string; value: ExprIR }[],
  structs: StructIR[],
  keys: Map<string, string>,
  inferField?: (e: ExprIR) => TypeIR,
): string | null {
  if (fields.length === 0) return null
  const typed: { name: string; type: TypeIR }[] = []
  for (const f of fields) {
    const t = synthFieldType(f.value, structs, keys, inferField)
    if (t === null) return null
    typed.push({ name: f.name, type: t })
  }
  const shapeKey = typed
    .map((f) => `${f.name}:${typeShapeKey(f.type)}`)
    .slice()
    .sort()
    .join(',')
  const existing = keys.get(shapeKey)
  if (existing !== undefined) return existing
  const name = `__Obj${structs.length}`
  structs.push({ name, fields: typed })
  keys.set(shapeKey, name)
  return name
}

/**
 * A field value's synthesized struct-field TypeIR — the recursive core of
 * `synthLiteralStructName`. A scalar literal / scalar-inferred expression maps
 * to its scalar kind (the original flat behavior); a NESTED all-scalar object
 * literal recurses to its OWN synthesized `__ObjN` struct and the field is
 * typed `typeRef` to it; an array of nested objects (or of scalar literals)
 * synthesizes the element type. Anything else (a function, a spread-bearing
 * object, a mixed / un-inferable array, a bare identifier the ctx can't type)
 * returns null → the CALLER keeps its tuple emit, unchanged (no regression).
 */
function synthFieldType(
  value: ExprIR,
  structs: StructIR[],
  keys: Map<string, string>,
  inferField?: (e: ExprIR) => TypeIR,
): TypeIR | null {
  const scalar = scalarLiteralType(value)
  if (scalar !== null) return scalar
  if (inferField !== undefined) {
    const inferred = inferField(value)
    if (
      inferred.kind === 'string' ||
      inferred.kind === 'boolean' ||
      inferred.kind === 'number'
    ) {
      return inferred
    }
  }
  // NESTED object literal → recurse into its own synthesized struct.
  if (value.kind === 'object' && (value.spreads?.length ?? 0) === 0) {
    const nested = synthLiteralStructName(value.fields, structs, keys, inferField)
    return nested === null ? null : { kind: 'typeRef', name: nested, args: [] }
  }
  // Array literal → array of the (homogeneous) element type — nested objects
  // (`[{ sub: {…} }]`) synthesize an element struct; scalar-literal elements
  // give a scalar element.
  if (value.kind === 'array') {
    const el = synthArrayElementType(value.elements, structs, keys, inferField)
    return el === null ? null : { kind: 'array', element: el }
  }
  return null
}

function synthArrayElementType(
  elements: ExprIR[],
  structs: StructIR[],
  keys: Map<string, string>,
  inferField?: (e: ExprIR) => TypeIR,
): TypeIR | null {
  if (elements.length === 0) return null
  // Array of object literals → element struct (first-element shape convention;
  // a mixed-shape array is out of scope and would emit divergent structs, so
  // require EVERY element to be an object literal).
  if (elements.every((e) => e.kind === 'object')) {
    const first = elements[0] as Extract<ExprIR, { kind: 'object' }>
    const nested = synthLiteralStructName(first.fields, structs, keys, inferField)
    return nested === null ? null : { kind: 'typeRef', name: nested, args: [] }
  }
  // Array of scalar literals → scalar element (require homogeneous kind).
  const firstScalar = scalarLiteralType(elements[0]!)
  if (
    firstScalar !== null &&
    elements.every((e) => {
      const s = scalarLiteralType(e)
      return s !== null && s.kind === firstScalar.kind
    })
  ) {
    return firstScalar
  }
  return null
}

/**
 * Deterministic per-field shape token for `synthLiteralStructName`'s dedup key.
 * A `typeRef` (a nested synthesized struct) carries the nested struct NAME —
 * itself derived from the nested shape — so two different nested shapes under
 * the same field name never collide on the lossy key (the collision the
 * scalar-only key had). Recursive over arrays.
 */
function typeShapeKey(t: TypeIR): string {
  switch (t.kind) {
    case 'number':
      return t.float === true ? 'number.f' : 'number'
    case 'string':
      return 'string'
    case 'boolean':
      return 'boolean'
    case 'typeRef':
      return `ref:${t.name}`
    case 'array':
      return `arr:${typeShapeKey(t.element)}`
    default:
      return t.kind
  }
}

/**
 * True when `expr` is safe to EMIT TWICE without re-running work or changing
 * meaning — a bare identifier, a signal/store READ (a zero-arg call like
 * `nums()` / `useApp()`, which lowers to a free @State / singleton read), or a
 * member/field access on such a base. Anything containing a method CALL WITH
 * ARGS (`filter(...)`, `map(...)`, `slice(...)`) is NOT re-readable — emitting
 * it twice would re-run that work. Used by the seedless-`.reduce(fn)` Swift
 * lowering (`obj.dropFirst().reduce(obj[0], fn)` names `obj` twice).
 */
/**
 * Does this access chain contain an OPTIONAL link (`a?.b` / `a?.[i]`)?
 * Syntactic — no inference dependency (the type layer doesn't yet wrap
 * optional-member results in a union, so a type-based check under-detects).
 * Used by the safe-index emit to route optional-RECEIVER chains: Kotlin
 * composes fully (`?.getOrNull`); Swift's guarded idiom can't (a `Bool?`
 * condition) and falls back to the warned nil-propagating subscript.
 */
export function exprHasOptionalLink(expr: ExprIR): boolean {
  if (expr.kind === 'member') {
    return expr.optional === true || exprHasOptionalLink(expr.object)
  }
  if (expr.kind === 'index') {
    return expr.optional === true || exprHasOptionalLink(expr.object)
  }
  if (expr.kind === 'call') return exprHasOptionalLink(expr.callee)
  if (expr.kind === 'paren') return exprHasOptionalLink(expr.inner)
  return false
}

export function isReReadableExpr(expr: ExprIR): boolean {
  // A scalar literal named twice is free — trivially re-readable.
  if (expr.kind === 'literal') return true
  if (expr.kind === 'identifier') return true
  // zero-arg call = signal / store / hook read — re-reading is free
  if (expr.kind === 'call' && expr.args.length === 0) return isReReadableExpr(expr.callee)
  // member/field access on a re-readable base (`obj.field`, `store.tasks`)
  if (expr.kind === 'member') return isReReadableExpr(expr.object)
  if (expr.kind === 'paren') return isReReadableExpr(expr.inner)
  return false
}

/**
 * True when `name` occurs as a FREE identifier anywhere in `expr`. Mirrors
 * `substituteIdentifier`'s total recursion (every node kind covered) but
 * returns a boolean and never mutates. A nested arrow that re-binds `name` in
 * its params shadows it — occurrences under that arrow are BOUND, not free, so
 * the subtree is skipped. Conservative for the callers that use it (the
 * `Array.from({length}, (el, i) => …)` element-param guard): a false "yes"
 * only defers a lowering to a warning, never mis-emits.
 */
export function exprReferencesIdent(expr: ExprIR, name: string): boolean {
  switch (expr.kind) {
    case 'new-collection':
      if (expr.seed !== undefined) return exprReferencesIdent(expr.seed, name)
      return (
        expr.entries?.some(
          ([k, v]) => exprReferencesIdent(k, name) || exprReferencesIdent(v, name),
        ) ?? false
      )
    // A SizedMap constructor carries only literal options (cap + flag), so it
    // can never reference an identifier, be hoisted around one, or need a
    // param rewrite. Enumerated rather than left to a default so the
    // exhaustiveness check keeps working for the NEXT ExprIR member.
    case 'new-sized-map':
      return false
    case 'literal':
      return false
    case 'identifier':
      return expr.name === name
    case 'call':
      return (
        exprReferencesIdent(expr.callee, name) ||
        expr.args.some((a) => exprReferencesIdent(a, name))
      )
    case 'member':
      return exprReferencesIdent(expr.object, name)
    case 'index':
      return exprReferencesIdent(expr.object, name) || exprReferencesIdent(expr.index, name)
    case 'binary':
    case 'comparison':
    case 'logical':
      return exprReferencesIdent(expr.left, name) || exprReferencesIdent(expr.right, name)
    case 'unary':
    case 'update':
      return exprReferencesIdent(expr.argument, name)
    case 'ternary':
      return (
        exprReferencesIdent(expr.cond, name) ||
        exprReferencesIdent(expr.then, name) ||
        exprReferencesIdent(expr.otherwise, name)
      )
    case 'arrow':
      // Shadow boundary — a nested arrow re-binding `name` makes the inner
      // occurrences BOUND (a different variable), so they don't count.
      if (expr.params.includes(name)) return false
      return exprReferencesIdent(expr.body, name)
    case 'rx-call':
      return (
        exprReferencesIdent(expr.source, name) ||
        expr.args.some((a) => exprReferencesIdent(a, name))
      )
    case 'array':
      return expr.elements.some((el) => exprReferencesIdent(el, name))
    case 'template':
      return expr.exprs.some((ex) => exprReferencesIdent(ex, name))
    case 'object':
      return (
        expr.fields.some((f) => exprReferencesIdent(f.value, name)) ||
        (expr.spreads !== undefined && expr.spreads.some((sp) => exprReferencesIdent(sp, name)))
      )
    case 'paren':
      return exprReferencesIdent(expr.inner, name)
    case 'await':
      return exprReferencesIdent(expr.expr, name)
    case 'json-stringify':
      return exprReferencesIdent(expr.arg, name)
    case 'toast-call':
    case 'announce-call':
      return exprReferencesIdent(expr.message, name)
    case 'schema-validate':
      // The schema is compile-time constant; only its validated ARG can
      // reference a free identifier.
      return exprReferencesIdent(expr.arg, name)
    case 'spread':
      return exprReferencesIdent(expr.argument, name)
    case 'jsx-element':
      return (
        expr.attrs.some((a) =>
          a.kind === 'attr'
            ? exprReferencesIdent(a.value, name)
            : a.kind === 'event'
              ? exprReferencesIdent(a.handler, name)
              : false,
        ) || childrenReferenceIdent(expr.children, name)
      )
    case 'jsx-fragment':
      return childrenReferenceIdent(expr.children, name)
  }
}

function childrenReferenceIdent(children: ChildIR[], name: string): boolean {
  // Only expression children carry identifiers; `text` children never do.
  // JSX inside these callbacks is nonsense, but the walker stays total so the
  // helper is reusable.
  for (const c of children) {
    if (c.kind !== 'text' && exprReferencesIdent(c.expr, name)) return true
  }
  return false
}

/**
 * Replace every free occurrence of identifier `name` in `expr` with
 * `replacement`. Returns null (CONSERVATIVE BAIL) when a nested arrow
 * shadows `name` — substituting inside the shadow would change
 * meaning, and distinguishing free-vs-bound occurrences across the
 * shadow boundary isn't worth the complexity for the `.update` shapes
 * real sources write (the param name and inner-callback param names
 * never collide in practice; a collision falls back to the caller's
 * no-lowering path with a warning).
 *
 * JSX subtrees recurse through attr/event/child expression slots —
 * JSX inside an `.update` callback is nonsense, but the walker stays
 * total so future callers can reuse it for other lowerings.
 */
export function substituteIdentifier(
  expr: ExprIR,
  name: string,
  replacement: ExprIR,
): ExprIR | null {
  switch (expr.kind) {
    case 'new-sized-map':
      return expr
    case 'new-collection': {
      if (expr.seed !== undefined) {
        const seed = substituteIdentifier(expr.seed, name, replacement)
        if (seed === null) return null // bail-propagation, like every other case
        return { ...expr, seed }
      }
      if (expr.entries !== undefined) {
        const entries: [ExprIR, ExprIR][] = []
        for (const [k, v] of expr.entries) {
          const nk = substituteIdentifier(k, name, replacement)
          const nv = substituteIdentifier(v, name, replacement)
          if (nk === null || nv === null) return null
          entries.push([nk, nv])
        }
        return { ...expr, entries }
      }
      return expr
    }
    case 'literal':
      return expr
    case 'identifier':
      return expr.name === name ? replacement : expr
    case 'call': {
      const callee = substituteIdentifier(expr.callee, name, replacement)
      if (callee === null) return null
      const args: ExprIR[] = []
      for (const a of expr.args) {
        const sub = substituteIdentifier(a, name, replacement)
        if (sub === null) return null
        args.push(sub)
      }
      return { ...expr, callee, args }
    }
    case 'member': {
      const object = substituteIdentifier(expr.object, name, replacement)
      if (object === null) return null
      return { ...expr, object }
    }
    case 'index': {
      const object = substituteIdentifier(expr.object, name, replacement)
      if (object === null) return null
      const index = substituteIdentifier(expr.index, name, replacement)
      if (index === null) return null
      return { ...expr, object, index }
    }
    case 'binary':
    case 'comparison':
    case 'logical': {
      const left = substituteIdentifier(expr.left, name, replacement)
      if (left === null) return null
      const right = substituteIdentifier(expr.right, name, replacement)
      if (right === null) return null
      return { ...expr, left, right }
    }
    case 'unary':
    case 'update': {
      const argument = substituteIdentifier(expr.argument, name, replacement)
      if (argument === null) return null
      return { ...expr, argument }
    }
    case 'ternary': {
      const cond = substituteIdentifier(expr.cond, name, replacement)
      if (cond === null) return null
      const then = substituteIdentifier(expr.then, name, replacement)
      if (then === null) return null
      const otherwise = substituteIdentifier(expr.otherwise, name, replacement)
      if (otherwise === null) return null
      return { ...expr, cond, then, otherwise }
    }
    case 'arrow': {
      // Shadow boundary — a nested arrow re-binding `name` makes the
      // inner occurrences BOUND, not free. Conservative bail (see doc).
      if (expr.params.includes(name)) return null
      const body = substituteIdentifier(expr.body, name, replacement)
      if (body === null) return null
      return { ...expr, body }
    }
    case 'rx-call': {
      const source = substituteIdentifier(expr.source, name, replacement)
      if (source === null) return null
      const args: ExprIR[] = []
      for (const a of expr.args) {
        const sub = substituteIdentifier(a, name, replacement)
        if (sub === null) return null
        args.push(sub)
      }
      return { ...expr, source, args }
    }
    case 'array': {
      const elements: ExprIR[] = []
      for (const el of expr.elements) {
        const sub = substituteIdentifier(el, name, replacement)
        if (sub === null) return null
        elements.push(sub)
      }
      return { ...expr, elements }
    }
    case 'template': {
      // Template literal — substitute into each interpolated expression;
      // the literal quasi segments carry no identifiers.
      const exprs: ExprIR[] = []
      for (const ex of expr.exprs) {
        const sub = substituteIdentifier(ex, name, replacement)
        if (sub === null) return null
        exprs.push(sub)
      }
      return { ...expr, exprs }
    }
    case 'object': {
      const fields: { name: string; value: ExprIR }[] = []
      for (const f of expr.fields) {
        const value = substituteIdentifier(f.value, name, replacement)
        if (value === null) return null
        fields.push({ name: f.name, value })
      }
      let spreads: ExprIR[] | undefined
      if (expr.spreads !== undefined) {
        spreads = []
        for (const sp of expr.spreads) {
          const sub = substituteIdentifier(sp, name, replacement)
          if (sub === null) return null
          spreads.push(sub)
        }
      }
      return spreads !== undefined
        ? { ...expr, fields, spreads }
        : { ...expr, fields }
    }
    case 'paren': {
      const inner = substituteIdentifier(expr.inner, name, replacement)
      if (inner === null) return null
      return { ...expr, inner }
    }
    case 'json-stringify': {
      const arg = substituteIdentifier(expr.arg, name, replacement)
      if (arg === null) return null
      return { ...expr, arg }
    }
    case 'toast-call':
    case 'announce-call': {
      const message = substituteIdentifier(expr.message, name, replacement)
      if (message === null) return null
      return { ...expr, message }
    }
    case 'await': {
      // M4.5: `await X` — substitute inside the awaited expr (single-wrapper,
      // like `paren`, but the child slot is `.expr`).
      const inner = substituteIdentifier(expr.expr, name, replacement)
      if (inner === null) return null
      return { ...expr, expr: inner }
    }
    case 'schema-validate': {
      // Only the validated ARG has a substitutable child; the schema is a
      // synthesized compile-time constant.
      const arg = substituteIdentifier(expr.arg, name, replacement)
      if (arg === null) return null
      return { ...expr, arg }
    }
    case 'spread': {
      const argument = substituteIdentifier(expr.argument, name, replacement)
      if (argument === null) return null
      return { ...expr, argument }
    }
    case 'jsx-element': {
      const attrs: AttrIR[] = []
      for (const a of expr.attrs) {
        if (a.kind === 'attr') {
          const value = substituteIdentifier(a.value, name, replacement)
          if (value === null) return null
          attrs.push({ ...a, value })
        } else if (a.kind === 'event') {
          const handler = substituteIdentifier(a.handler, name, replacement)
          if (handler === null) return null
          attrs.push({ ...a, handler })
        } else {
          attrs.push(a)
        }
      }
      const children = substituteInChildren(expr.children, name, replacement)
      if (children === null) return null
      return { ...expr, attrs, children }
    }
    case 'jsx-fragment': {
      const children = substituteInChildren(expr.children, name, replacement)
      if (children === null) return null
      return { ...expr, children }
    }
  }
}

/**
 * Lower a route `loader: (ctx) => …ctx.params.X…` body's param reads to a
 * native dict read on a synthetic `params` binding. `ctx.params.id` and
 * `ctx.params["id"]` both become `index(identifier('params'), 'id')`, which
 * the emitters render as `params["id"]` — and the route-dispatch branch
 * already binds `params` from `matchPath(path, "/x/:id")` in scope.
 *
 * Returns the rewritten expr plus two flags: `usesParams` (the body read at
 * least one `ctx.params.*`, so the emit must bind `params` even if the
 * component prop doesn't) and `residualCtx` (the body referenced `ctx` in some
 * OTHER way — `ctx.request`, a bare `ctx`, etc. — which v1 does NOT support;
 * the caller drops the loader + warns rather than emit an unbound `ctx`).
 *
 * Mirrors `substituteIdentifier`'s total recursion so every node kind is
 * covered; only `member`/`index` whose object is `ctx.params` are special.
 */
export interface LowerParamsResult {
  expr: ExprIR
  usesParams: boolean
  residualCtx: boolean
}
export function lowerRouteParams(expr: ExprIR, ctxName: string): LowerParamsResult {
  const flags = { usesParams: false, residualCtx: false }
  const out = walkLowerParams(expr, ctxName, flags)
  return { expr: out, usesParams: flags.usesParams, residualCtx: flags.residualCtx }
}

// `(params[<key>] ?? "")` — a native dict read defaulted to "" so it matches
// the web `string` type of `ctx.params.x` (a bare `params["id"]` is `String?`
// on both targets, which mismatches non-optional consumers). The `??`
// lowers to Swift `??` and Kotlin Elvis `?:`.
function paramRead(key: ExprIR): ExprIR {
  return {
    kind: 'logical',
    op: '??',
    left: { kind: 'index', object: { kind: 'identifier', name: 'params' }, index: key },
    right: { kind: 'literal', value: '' },
  }
}

// True when `e` is the `ctx.params` member access (the read root we rewrite).
function isCtxParams(e: ExprIR, ctxName: string): boolean {
  return (
    e.kind === 'member' &&
    e.property === 'params' &&
    e.object.kind === 'identifier' &&
    e.object.name === ctxName
  )
}

function walkLowerParams(
  expr: ExprIR,
  ctxName: string,
  flags: { usesParams: boolean; residualCtx: boolean },
): ExprIR {
  const rec = (e: ExprIR): ExprIR => walkLowerParams(e, ctxName, flags)
  switch (expr.kind) {
    case 'new-collection':
      if (expr.seed !== undefined) return { ...expr, seed: rec(expr.seed) }
      if (expr.entries !== undefined) {
        return { ...expr, entries: expr.entries.map(([k, v]): [ExprIR, ExprIR] => [rec(k), rec(v)]) }
      }
      return expr
    case 'new-sized-map':
      return expr
    case 'literal':
      return expr
    case 'identifier':
      // A bare `ctx` (not part of a `ctx.params` access) is unsupported.
      if (expr.name === ctxName) flags.residualCtx = true
      return expr
    case 'member': {
      // `ctx.params.id` → `(params["id"] ?? "")`.
      if (isCtxParams(expr.object, ctxName)) {
        flags.usesParams = true
        return paramRead({ kind: 'literal', value: expr.property })
      }
      return { ...expr, object: rec(expr.object) }
    }
    case 'index': {
      // `ctx.params["id"]` → `(params["id"] ?? "")`.
      if (isCtxParams(expr.object, ctxName)) {
        flags.usesParams = true
        return paramRead(rec(expr.index))
      }
      return { ...expr, object: rec(expr.object), index: rec(expr.index) }
    }
    case 'call':
      return { ...expr, callee: rec(expr.callee), args: expr.args.map(rec) }
    case 'binary':
    case 'comparison':
    case 'logical':
      return { ...expr, left: rec(expr.left), right: rec(expr.right) }
    case 'unary':
    case 'update':
      return { ...expr, argument: rec(expr.argument) }
    case 'ternary':
      return { ...expr, cond: rec(expr.cond), then: rec(expr.then), otherwise: rec(expr.otherwise) }
    case 'arrow':
      return { ...expr, body: rec(expr.body) }
    case 'rx-call':
      return { ...expr, source: rec(expr.source), args: expr.args.map(rec) }
    case 'array':
      return { ...expr, elements: expr.elements.map(rec) }
    case 'template':
      return { ...expr, exprs: expr.exprs.map(rec) }
    case 'object': {
      const fields = expr.fields.map((f) => ({ name: f.name, value: rec(f.value) }))
      return expr.spreads !== undefined
        ? { ...expr, fields, spreads: expr.spreads.map(rec) }
        : { ...expr, fields }
    }
    case 'paren':
      return { ...expr, inner: rec(expr.inner) }
    case 'await':
      return { ...expr, expr: rec(expr.expr) }
    case 'json-stringify':
      return { ...expr, arg: rec(expr.arg) }
    case 'toast-call':
    case 'announce-call':
      return { ...expr, message: rec(expr.message) }
    case 'schema-validate':
      return { ...expr, arg: rec(expr.arg) }
    case 'spread':
      return { ...expr, argument: rec(expr.argument) }
    case 'jsx-element':
    case 'jsx-fragment':
      // A loader body is not JSX; leave these untouched (total-walker safety).
      return expr
  }
}

function substituteInChildren(
  children: ChildIR[],
  name: string,
  replacement: ExprIR,
): ChildIR[] | null {
  const out: ChildIR[] = []
  for (const c of children) {
    if (c.kind === 'text') {
      out.push(c)
      continue
    }
    const sub = substituteIdentifier(c.expr, name, replacement)
    if (sub === null) return null
    out.push({ ...c, expr: sub })
  }
  return out
}

/**
 * Classify a styling attr's DYNAMIC value (called only after the static
 * path — literal / resolvable const via readStaticAttr — came up empty).
 * Styling tokens (`gap`/`pad`/`background`/`radius`) resolve at COMPILE
 * time, so the only faithful dynamic form is a TERNARY OF TWO LITERALS
 * (`gap={dense() ? "sm" : "lg"}` — the binary-state idiom): both
 * branches compile-resolve and the condition emits natively. Anything
 * else is `dynamic` — the caller warns loudly (pre-fix the whole
 * modifier was SILENTLY dropped).
 */
export function classifyDynamicStylingAttr(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  name: string,
):
  | { kind: 'none' }
  | { kind: 'ternary'; cond: ExprIR; a: string | number; b: string | number }
  | { kind: 'dynamic' } {
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === name) {
      const v = a.value
      if (v.kind === 'literal') return { kind: 'none' }
      if (
        v.kind === 'ternary' &&
        v.then.kind === 'literal' &&
        v.otherwise.kind === 'literal' &&
        (typeof v.then.value === 'string' || typeof v.then.value === 'number') &&
        (typeof v.otherwise.value === 'string' || typeof v.otherwise.value === 'number')
      ) {
        return { kind: 'ternary', cond: v.cond, a: v.then.value, b: v.otherwise.value }
      }
      return { kind: 'dynamic' }
    }
  }
  return { kind: 'none' }
}

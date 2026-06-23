// Shared ExprIR tree utilities consumed by BOTH emitters.
//
// First resident: identifier substitution for the `.update(fn)`
// lowering — `x.update((list) => list.map(...))` lowers to
// `x = <fn body with `list` replaced by the read of x>`, producing the
// SAME idiomatic native emit the hand-written `.set(x().map(...))`
// form produces (no IIFE, no closure-invocation noise).

import type { AttrIR, ChildIR, ExprIR, StructIR, TypeIR } from './types'

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
 * types get distinct structs). FLAT scalar literals only — a nested object
 * or array field returns null (kept as a tuple).
 */
export function synthLiteralStructName(
  fields: { name: string; value: ExprIR }[],
  structs: StructIR[],
  keys: Map<string, string>,
): string | null {
  if (fields.length === 0) return null
  const typed: { name: string; type: TypeIR }[] = []
  for (const f of fields) {
    const t = scalarLiteralType(f.value)
    if (t === null) return null
    typed.push({ name: f.name, type: t })
  }
  const shapeKey = typed
    .map((f) => `${f.name}:${f.type.kind}${f.type.kind === 'number' && f.type.float ? '.f' : ''}`)
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

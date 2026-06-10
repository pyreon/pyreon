// Shared ExprIR tree utilities consumed by BOTH emitters.
//
// First resident: identifier substitution for the `.update(fn)`
// lowering — `x.update((list) => list.map(...))` lowers to
// `x = <fn body with `list` replaced by the read of x>`, producing the
// SAME idiomatic native emit the hand-written `.set(x().map(...))`
// form produces (no IIFE, no closure-invocation noise).

import type { AttrIR, ChildIR, ExprIR } from './types'

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

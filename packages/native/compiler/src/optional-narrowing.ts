/**
 * Optional NARROWING — the TypeScript flow analysis neither target performs
 * the same way.
 *
 *   books === undefined ? <Text>Loading</Text> : <Text>{books.length}</Text>
 *   if (b.tags === undefined) return 0; return b.tags.length
 *   sel() ? sel().title : 'none'
 *
 * TypeScript narrows `books` to `Book[]` in the branch that proved it present.
 * Swift never narrows through a nil test — `books.count` on `[Book]?` is
 * "value of optional type must be unwrapped" — and Kotlin smart-casts only a
 * STABLE value: a local `val` or a parameter, not a `by mutableStateOf`
 * signal, a `derivedStateOf` computed, or a `var` field of a data class (every
 * emitted struct field is a `var`). So the same line of shared source failed
 * on one target, the other, or both, depending on WHAT was being tested.
 *
 * The lowering binds the unwrapped value to a name and rewrites the narrowed
 * branch to read it: Swift `if let` / `guard let` / `.map { x in … } ?? other`,
 * Kotlin `when (val x = subject) { null -> … else -> … }` /
 * `val x = subject ?: run { … }`. This module decides the SHAPE — which
 * conditions narrow, which expression is the subject, what the binding is
 * called, and how the branch is rewritten — so the two emitters cannot
 * disagree about it. Each owns its own spelling.
 */

import { exprReferencesIdent, substituteMatching } from './expr-utils'
import { inferType, sameOptionalBase, typeIsOptional, unwrapOptionalType } from './infer-type'
import type { InferenceCtx } from './infer-type'
import type { ExprIR, StatementIR, TypeIR } from './types'

/** The extra JS-falsy test a TRUTHINESS check needs beyond `!= nil`. */
export type TruthExtra = 'string' | 'number' | 'boolean' | null

export interface Narrowing {
  /** The optional expression as written (`books`, `sel()`, `b.tags`). */
  subject: ExprIR
  /** True when the condition being TRUE means the subject is present. */
  presentWhenTrue: boolean
  /** The payload type. */
  unwrapped: TypeIR
  /**
   * A truthiness test (`if (s)`, `!s`, `s ? … : …`) on a string / number /
   * boolean is not a nil test: `''`, `0` and `false` are falsy in JS. The
   * binding must also check the payload, or an empty string takes the branch
   * the web never takes.
   */
  truth: TruthExtra
}

function unparen(e: ExprIR): ExprIR {
  return e.kind === 'paren' ? unparen(e.inner) : e
}

/**
 * A NARROWABLE path — something that reads the same value twice in a row, so
 * binding it once is the same as reading it again: an identifier, a
 * zero-argument signal / computed read, or a member chain over those (optional
 * links allowed). A call with arguments (`items().find(…)`) or an index read
 * is not one: re-reading it is not the same expression.
 */
export function isNarrowablePath(e: ExprIR, propsParamName: string | undefined): boolean {
  const x = unparen(e)
  if (x.kind === 'identifier') return x.name !== 'undefined' && x.name !== propsParamName
  if (x.kind === 'call') return x.args.length === 0 && x.callee.kind === 'identifier'
  if (x.kind === 'member') {
    if (x.object.kind === 'identifier' && x.object.name === propsParamName) return true
    return isNarrowablePath(x.object, propsParamName)
  }
  return false
}

function truthOf(t: TypeIR): TruthExtra {
  if (t.kind === 'string') return 'string'
  if (t.kind === 'number') return 'number'
  if (t.kind === 'boolean') return 'boolean'
  return null
}

/**
 * The narrowing a condition performs, or null when it performs none PMTC can
 * prove. The subject must be a narrowable path whose inferred type is
 * OPTIONAL — binding a non-optional is itself a compile error on Swift.
 */
export function narrowingFor(
  cond: ExprIR,
  ctx: InferenceCtx,
  propsParamName: string | undefined,
): Narrowing | null {
  const c = unparen(cond)
  const make = (subject: ExprIR, presentWhenTrue: boolean, truthiness: boolean): Narrowing | null => {
    const s = unparen(subject)
    if (!isNarrowablePath(s, propsParamName)) return null
    const t = inferType(s, ctx)
    if (!typeIsOptional(t)) return null
    const unwrapped = unwrapOptionalType(t)
    return { subject: s, presentWhenTrue, unwrapped, truth: truthiness ? truthOf(unwrapped) : null }
  }
  if (c.kind === 'unary' && c.op === '!') return make(c.argument, false, true)
  if (c.kind === 'comparison' && (c.op === '==' || c.op === '!=')) {
    const leftNull = c.left.kind === 'literal' && c.left.value === null
    const rightNull = c.right.kind === 'literal' && c.right.value === null
    if (leftNull === rightNull) return null
    return make(leftNull ? c.right : c.left, c.op === '!=', false)
  }
  return make(c, true, true)
}

/** Structural equality of two paths, seeing through parens. */
export function samePath(a: ExprIR, b: ExprIR): boolean {
  return sameOptionalBase(unparen(a), unparen(b))
}

/** The identifier at the root of a path (`b` in `b.tags`, `sel` in `sel()`). */
function pathRoot(e: ExprIR): string {
  const x = unparen(e)
  if (x.kind === 'identifier') return x.name
  if (x.kind === 'call') return pathRoot(x.callee)
  if (x.kind === 'member') return pathRoot(x.object)
  return ''
}

/** Does `e` read the subject anywhere (as the path itself or through it)? */
export function readsSubject(e: ExprIR, subject: ExprIR): boolean {
  let hit = false
  substituteMatching(e, {
    matches: (n) => {
      if (samePath(n, subject)) hit = true
      return false
    },
    replacement: e,
    shadow: '\u0000',
  })
  return hit
}

/**
 * The name the unwrapped value binds to. The path's own last segment reads
 * most naturally (`books`, `sel`, `tags`), unless that name already means
 * something else in the code that will see it — then `<name>Value`.
 */
export function binderName(subject: ExprIR, readers: readonly ExprIR[]): string {
  const x = unparen(subject)
  const base = x.kind === 'identifier' ? x.name : x.kind === 'call' ? pathRoot(x) : x.kind === 'member' ? x.property : 'value'
  if (x.kind === 'identifier' || x.kind === 'call') return base
  // A member binder shadows nothing only if the readers never use the name
  // for something else.
  const taken = readers.some((r) => {
    const rewritten = substituteMatching(r, {
      matches: (n) => samePath(n, subject),
      replacement: { kind: 'literal', value: null },
      shadow: '\u0000',
    })
    return rewritten !== null && exprReferencesIdent(rewritten, base)
  })
  return taken ? `${base}Value` : base
}

/** `sel.set(…)` / `sel.update(…)` where the subject is the signal read `sel()`. */
function writesSignal(e: ExprIR, subject: ExprIR): boolean {
  const x = unparen(subject)
  if (x.kind !== 'call' || x.callee.kind !== 'identifier') return false
  const root = x.callee.name
  let hit = false
  substituteMatching(e, {
    matches: (n) => {
      if (
        n.kind === 'member' &&
        n.object.kind === 'identifier' &&
        n.object.name === root &&
        (n.property === 'set' || n.property === 'update')
      ) {
        hit = true
      }
      return false
    },
    replacement: e,
    shadow: '\u0000',
  })
  return hit
}

/** Rewrite every read of `subject` in `e` to the identifier `binder`. Null = cannot (a shadowing arrow, a statement-bodied closure). */
export function narrowExpr(e: ExprIR, subject: ExprIR, binder: string): ExprIR | null {
  return substituteMatching(e, {
    // `x ?? fallback` where `x` is the narrowed subject is just the binding —
    // left as `x ?? fallback` it would be a coalesce on a non-optional, a
    // warning on both targets.
    matches: (n) => samePath(n, subject) || (n.kind === 'logical' && n.op === '??' && samePath(n.left, subject)),
    replacement: { kind: 'identifier', name: binder },
    shadow: pathRoot(subject) === binder ? binder : pathRoot(subject),
    narrowing: true,
  })
}

/**
 * The same rewrite over a statement list. Null when a statement would change
 * meaning: an ASSIGNMENT to the subject (the binding is a copy, so writing it
 * would silently stop reaching the original), or a local that re-declares the
 * binder name.
 */
export function narrowStmts(stmts: readonly StatementIR[], subject: ExprIR, binder: string): StatementIR[] | null {
  // A signal subject WRITTEN in the branch (`sel.set(…)`) would leave every
  // later read of the binding stale — the web re-reads the signal.
  if (stmtExprs(stmts).some((e) => writesSignal(e, subject))) return null
  const ex = (e: ExprIR): ExprIR | null => narrowExpr(e, subject, binder)
  const out: StatementIR[] = []
  for (const s of stmts) {
    const next = narrowStmt(s, ex, subject, binder)
    if (next === null) return null
    out.push(next)
  }
  return out
}

function narrowStmt(
  s: StatementIR,
  ex: (e: ExprIR) => ExprIR | null,
  subject: ExprIR,
  binder: string,
): StatementIR | null {
  const list = (xs: readonly StatementIR[]): StatementIR[] | null => narrowStmts(xs, subject, binder)
  switch (s.kind) {
    case 'declare':
      return s.name === binder ? null : s
    case 'let': {
      if (s.name === binder) return null
      const expr = ex(s.expr)
      return expr === null ? null : { ...s, expr }
    }
    case 'assign': {
      // Writing through the binding would not reach the original (a Swift
      // struct binding is a copy), so a branch that assigns the subject is
      // not rewritten.
      if (readsSubject(s.target, subject)) return null
      const target = ex(s.target)
      const value = ex(s.value)
      return target === null || value === null ? null : { ...s, target, value }
    }
    case 'if': {
      const cond = ex(s.cond)
      const then = list(s.then)
      const elseBody = s.elseBody ? list(s.elseBody) : undefined
      if (cond === null || then === null || elseBody === null) return null
      return elseBody === undefined ? { ...s, cond, then } : { ...s, cond, then, elseBody }
    }
    case 'return': {
      if (s.expr === undefined) return s
      const expr = ex(s.expr)
      return expr === null ? null : { ...s, expr }
    }
    case 'expr': {
      const expr = ex(s.expr)
      return expr === null ? null : { ...s, expr }
    }
    case 'break':
    case 'continue':
      return s
    case 'while':
    case 'do-while': {
      const cond = ex(s.cond)
      const body = list(s.body)
      return cond === null || body === null ? null : { ...s, cond, body }
    }
    case 'for-of': {
      if (s.item === binder) return null
      const iterable = ex(s.iterable)
      const body = list(s.body)
      return iterable === null || body === null ? null : { ...s, iterable, body }
    }
    case 'for-range': {
      if (s.item === binder) return null
      const from = ex(s.from)
      const to = ex(s.to)
      const step = s.step ? ex(s.step) : undefined
      const body = list(s.body)
      if (from === null || to === null || step === null || body === null) return null
      return step === undefined ? { ...s, from, to, body } : { ...s, from, to, step, body }
    }
    case 'switch': {
      const discriminant = ex(s.discriminant)
      if (discriminant === null) return null
      const cases: { tests: ExprIR[]; body: StatementIR[] }[] = []
      for (const c of s.cases) {
        const tests = c.tests.map(ex)
        const body = list(c.body)
        if (tests.some((t) => t === null) || body === null) return null
        cases.push({ tests: tests as ExprIR[], body })
      }
      return { ...s, cases }
    }
  }
}

/** Does a statement list end by leaving the enclosing function / loop? */
export function exits(stmts: readonly StatementIR[]): boolean {
  const last = stmts[stmts.length - 1]
  if (last === undefined) return false
  if (last.kind === 'return' || last.kind === 'break' || last.kind === 'continue') return true
  if (last.kind === 'if') return last.elseBody !== undefined && exits(last.then) && exits(last.elseBody)
  return false
}

/**
 * The early-return guard: `if (x === undefined) return 0` (no else, a body
 * that always leaves) followed by statements reading `x`. Returns the index
 * of such a statement in `stmts` and its narrowing, or null.
 */
export interface GuardPlan {
  narrowing: Narrowing
  binder: string
  /** The guard's exit body (the `if`'s then). */
  exitBody: StatementIR[]
  /** The statements after the guard, rewritten to read the binder. */
  rest: StatementIR[]
}

export function planGuard(
  s: StatementIR,
  rest: readonly StatementIR[],
  ctx: InferenceCtx,
  propsParamName: string | undefined,
): GuardPlan | null {
  if (s.kind !== 'if' || s.elseBody !== undefined || !exits(s.then)) return null
  const n = narrowingFor(s.cond, ctx, propsParamName)
  // The guard proves PRESENCE for what follows only when the if-body ran on
  // ABSENCE.
  if (n === null || n.presentWhenTrue) return null
  const readers = restExprs(rest)
  if (!readers.some((r) => readsSubject(r, n.subject))) return null
  const binder = binderName(n.subject, readers)
  const rewritten = narrowStmts(rest, n.subject, binder)
  if (rewritten === null) return null
  return { narrowing: n, binder, exitBody: s.then, rest: rewritten }
}

/** Every expression a statement list contains, shallowly enough for "does it read X". */
function restExprs(stmts: readonly StatementIR[]): ExprIR[] {
  const out: ExprIR[] = []
  const walk = (xs: readonly StatementIR[]): void => {
    for (const s of xs) {
      switch (s.kind) {
        case 'let':
          out.push(s.expr)
          break
        case 'assign':
          out.push(s.target, s.value)
          break
        case 'if':
          out.push(s.cond)
          walk(s.then)
          if (s.elseBody) walk(s.elseBody)
          break
        case 'return':
          if (s.expr) out.push(s.expr)
          break
        case 'expr':
          out.push(s.expr)
          break
        case 'while':
        case 'do-while':
          out.push(s.cond)
          walk(s.body)
          break
        case 'for-of':
          out.push(s.iterable)
          walk(s.body)
          break
        case 'for-range':
          out.push(s.from, s.to)
          if (s.step) out.push(s.step)
          walk(s.body)
          break
        case 'switch':
          out.push(s.discriminant)
          for (const c of s.cases) {
            out.push(...c.tests)
            walk(c.body)
          }
          break
        default:
          break
      }
    }
  }
  walk(stmts)
  return out
}

/** Every expression in a statement list — exported for the statement-`if` readers check. */
export const stmtExprs = restExprs

/** The named warning for a narrowing PMTC recognised but could not lower. */
export function unnarrowableWarning(what: string, target: 'swift' | 'kotlin'): string {
  const lang = target === 'swift' ? 'Swift never narrows an optional through a nil test' : 'Kotlin cannot smart-cast this value'
  return (
    `\`${what}\`: the branch that follows reads it as NON-optional, but PMTC could not narrow it — ${lang}, ` +
    `and the branch could not be rewritten to read an unwrapped binding (it reassigns the value, declares a ` +
    `local with the same name, or wraps it in a closure with statements). The ${target === 'swift' ? 'Swift' : 'Kotlin'} ` +
    `build will fail at the member access. Read it once into a local (\`const x = …\`) and test that, or use ` +
    `optional chaining (\`x?.field ?? fallback\`).`
  )
}

// `JSON.parse(text)` — which type the native decode targets.
//
// On the web `JSON.parse` returns `any`. A native decode cannot: Swift's `JSONDecoder.decode(T.self, …)` and kotlinx's
// `decodeFromString<T>` both need the type up front. So the lowering takes it from the position in the SOURCE that
// already names it — the same type TypeScript checks the result against:
//
//   JSON.parse(s) as Todo[]                 the cast
//   const todos: Todo[] = JSON.parse(s)     the declaration's annotation
//   function load(s): Todo[] { return JSON.parse(s) }   the helper's return type
//
// Anything else stays untyped, and the emitters warn and decline rather than guess.

import { childStatementLists } from './throw-lowering'
import type { DeclIR, ExprIR, StatementIR, TypeIR } from './types'

type JsonParseIR = Extract<ExprIR, { kind: 'json-parse' }>

/** `JSON.parse(…)`, seen through parens. */
export function unwrapJsonParse(e: ExprIR): JsonParseIR | undefined {
  let cur = e
  while (cur.kind === 'paren') cur = cur.inner
  return cur.kind === 'json-parse' ? cur : undefined
}

/** Whether a TS type is one a decode can target: a value type, not `any`/`unknown` or a function. */
function isDecodableTarget(t: TypeIR): boolean {
  return t.kind !== 'unknown' && t.kind !== 'function' && t.kind !== 'null' && t.kind !== 'undefined'
}

/** Give an untyped `JSON.parse` at the top of `e` the type `t` (the position's own annotation). */
export function typeJsonParse(e: ExprIR, t: TypeIR): ExprIR {
  const found = unwrapJsonParse(e)
  if (found === undefined || found.type !== undefined || !isDecodableTarget(t)) return e
  found.type = t
  return e
}

/** A helper annotated `: T` returning `JSON.parse(…)` directly decodes into `T`. */
export function typeJsonParseReturns(fns: readonly Extract<DeclIR, { kind: 'function' }>[]): void {
  for (const fn of fns) {
    if (!isDecodableTarget(fn.returnType)) continue
    const visit = (body: readonly StatementIR[]): void => {
      for (const s of body) {
        if (s.kind === 'return' && s.expr) typeJsonParse(s.expr, fn.returnType)
        for (const list of childStatementLists(s)) visit(list)
      }
    }
    visit(fn.body)
  }
}

/** The type every TYPED `JSON.parse` under `root` decodes into — decode targets, like a fetch's response type. */
export function typedJsonParseTargets(root: unknown): TypeIR[] {
  const out: TypeIR[] = []
  const seen = new Set<object>()
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x)
      return
    }
    if (n === null || typeof n !== 'object' || seen.has(n)) return
    seen.add(n)
    const node = n as { kind?: string; type?: unknown }
    if (node.kind === 'json-parse' && node.type !== undefined) out.push(node.type as TypeIR)
    for (const v of Object.values(n)) walk(v)
  }
  walk(root)
  return out
}

/** The warning for a `JSON.parse` nothing named a type for. */
const UNTYPED_JSON_PARSE_WARNING =
  '`JSON.parse(…)` has no type to decode into natively — on the web it returns `any`, but a Swift / Kotlin decode ' +
  'needs the type up front. Name it where the result lands: `JSON.parse(s) as T`, `const x: T = JSON.parse(s)`, or ' +
  'a helper annotated `: T` that returns it. The call was not lowered.'

/** Name every `JSON.parse` the typing positions above left untyped — once each, after they have all run. */
export function warnUntypedJsonParse(root: unknown, warnings: string[]): void {
  const seen = new Set<object>()
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x)
      return
    }
    if (n === null || typeof n !== 'object' || seen.has(n)) return
    seen.add(n)
    const node = n as { kind?: string; type?: unknown }
    if (node.kind === 'json-parse' && node.type === undefined) warnings.push(UNTYPED_JSON_PARSE_WARNING)
    for (const v of Object.values(n)) walk(v)
  }
  walk(root)
}

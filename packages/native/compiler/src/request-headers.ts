/**
 * The one rule for a request header VALUE in a native-lowered `fetch` init — shared by every plugin that reads
 * `headers: { … }` (`useFetch`'s init, a `useQuery` `queryFn` fetch), so they cannot disagree about what crosses.
 *
 * A literal is baked. Any other expression is lowered and evaluated when the request is BUILT on device, which is
 * the whole point: an `Authorization` header carries a token that only exists at runtime.
 *
 * The value's TYPE is judged at emit time ({@link headerValueProblem}), not when the call is recognized: recognition
 * runs before component inference, when a prop or a signal still reads as `unknown`, so a type check there would
 * refuse `` `Bearer ${props.token}` `` — correct code — along with the genuinely wrong shapes.
 */
import type { AstNode } from './call-lowering'
import type { ExprIR, TypeIR } from './types'

export type HeaderValue =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'expr'; readonly expr: ExprIR }

export function classifyHeaderValue(node: AstNode, ctx: { expr(node: AstNode): ExprIR }): HeaderValue {
  if ((node.type === 'Literal' || node.type === 'StringLiteral') && typeof node.value === 'string') {
    return { kind: 'literal', value: node.value }
  }
  return { kind: 'expr', expr: ctx.expr(node) }
}

const isNullish = (t: TypeIR): boolean => t.kind === 'null' || t.kind === 'undefined'

/**
 * Why a runtime header value of inferred type `type` cannot be sent, phrased to follow `header "<name>" `; `undefined`
 * when it can.
 *
 * A native request header is a non-optional string on both targets (`[String: String]` / `Map<String, String>`). A
 * value that may be null — `auth.accessToken()` is `string | null` — would not compile, and the web would send the
 * literal text `null`, so it is refused with the fix spelled out. A type inference could not determine is let
 * through: the native compiler is then the judge, which is better than silently dropping a header that was correct.
 */
export function headerValueProblem(type: TypeIR): string | undefined {
  if (type.kind === 'string' || type.kind === 'unknown') return undefined
  if (type.kind === 'union' && type.branches.some((b) => b.kind === 'string') && type.branches.every((b) => b.kind === 'string' || isNullish(b))) {
    return "may be null or undefined, and a native request header cannot be (the web would send the text \"null\") — give it a fallback (`… ?? ''`) or build the whole value as a string (`` `Bearer ${token ?? ''}` ``)"
  }
  return `must be a string — a literal, or an expression typed \`string\` (got ${describe(type)}); wrap it in \`String(…)\` if a number or boolean is meant`
}

function describe(t: TypeIR): string {
  if (t.kind === 'union') return t.branches.map(describe).join(' | ')
  if (t.kind === 'typeRef') return t.name
  return t.kind
}

/**
 * The runtime header values that can be sent, each judged by its INFERRED type ({@link headerValueProblem}); one that
 * cannot is named with its fix (`where` prefixes the message) and left out of the request.
 */
export function sendableHeaderExprs(
  exprs: Readonly<Record<string, ExprIR>> | undefined,
  ctx: { inferType(e: ExprIR): TypeIR; warn(message: string): void },
  where: string,
): (readonly [string, ExprIR])[] {
  const out: (readonly [string, ExprIR])[] = []
  for (const [name, expr] of Object.entries(exprs ?? {})) {
    const problem = headerValueProblem(ctx.inferType(expr))
    if (problem === undefined) out.push([name, expr])
    else ctx.warn(`${where} header "${name}" ${problem}. It is OMITTED on iOS and Android.`)
  }
  return out
}

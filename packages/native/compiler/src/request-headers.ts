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

/**
 * The parts of one HTTP request a plugin emits, with the URL already rendered as target text (a string literal, or an
 * interpolation of a runtime template). Literal and runtime halves of headers / body are kept apart so each target can
 * write the literal ones as constants.
 */
export interface HttpRequestParts {
  readonly method?: string | undefined
  /** Target text of the URL expression. */
  readonly url: string
  readonly headers?: Readonly<Record<string, string>> | undefined
  /** Runtime header values; a nullable or non-string one is refused with a named warning (see {@link sendableHeaderExprs}). */
  readonly headerExprs?: Readonly<Record<string, ExprIR>> | undefined
  /** A literal body. */
  readonly body?: string | undefined
  /** A runtime body, an expression of type `string`, evaluated as the request is built. */
  readonly bodyExpr?: ExprIR | undefined
  /** A streamed body (`ResolvedRequest.upload`): a multipart form, or a raw body whose type decides at emit. */
  readonly upload?: ExprIR | undefined
}

/** What the request writers read of an emit context. */
interface RequestEmitCtx {
  expr(e: ExprIR, at?: number): string
  /** The fields of a named type (none for an enum) — `EmitContext.rowFields`. */
  rowFields?(element: TypeIR): readonly { name: string; type: TypeIR }[]
  stringLiteral(value: string): string
  inferType(e: ExprIR): TypeIR
  warn(message: string): void
}

/** The marker calls `@pyreon/http`'s resolver wraps a streamed body in (`ResolvedRequest.upload`). */
const MULTIPART_MARKER = '__pyreonMultipart'
const RAW_BODY_MARKER = '__pyreonRawBody'

/** Whether `t` is the upload-file type `fileFromUri` produces. */
const isUploadFile = (t: TypeIR): boolean =>
  t.kind === 'typeRef' && (t.name === 'PyreonUploadFile' || t.name === 'File' || t.name === 'Blob')

/**
 * A struct / object value — `encodeMultipart` writes one as a `JSON.stringify` text part. A named type counts only
 * when it is a STRUCT (it has fields): an enum-typed value is a string on the web and goes out as `String(value)`.
 */
function fieldCount(t: TypeIR, ctx: RequestEmitCtx): number {
  try {
    return ctx.rowFields?.(t).length ?? 0
  } catch {
    return 0
  }
}

const isObjectValue = (t: TypeIR, ctx: RequestEmitCtx): boolean =>
  t.kind === 'object' || (t.kind === 'typeRef' && !isUploadFile(t) && fieldCount(t, ctx) > 0)

/**
 * What a streamed body becomes on the target: the `PyreonMultipartBody` argument texts, a file to stream, or — for a
 * raw `body` that turned out to be a string — a plain text body.
 */
function resolveUpload(
  p: HttpRequestParts,
  ctx: RequestEmitCtx,
  where: string,
): { multipart?: string[]; file?: ExprIR; text?: { bodyExpr: ExprIR } } {
  const u = p.upload
  if (u === undefined || u.kind !== 'call' || u.callee.kind !== 'identifier') return {}
  if (u.callee.name === RAW_BODY_MARKER) {
    const value = u.args[0] as ExprIR
    const t = ctx.inferType(value)
    if (isUploadFile(t)) return { file: value }
    return { text: { bodyExpr: value } }
  }
  if (u.callee.name !== MULTIPART_MARKER) return {}
  const out: string[] = []
  for (let i = 0; i + 1 < u.args.length; i += 2) {
    const name = u.args[i] as ExprIR
    const value = u.args[i + 1] as ExprIR
    const t = value.kind === 'literal' ? undefined : ctx.inferType(value)
    if (t !== undefined && t.kind === 'array' && isObjectValue(t.element, ctx)) {
      ctx.warn(
        `${where} multipart field ${ctx.expr(name, 0)} is an array of objects — each element would be a JSON text part on the web, which is not lowered. It is OMITTED on iOS and Android; send one field per object, or the array as one \`JSON.stringify\` value.`,
      )
      continue
    }
    out.push(ctx.expr(name, 0))
    // An object value is a JSON text part on the web (`encodeMultipart`), serialized by the web-identical stringify.
    out.push(t !== undefined && isObjectValue(t, ctx) ? ctx.expr({ kind: 'json-stringify', arg: value }, 0) : ctx.expr(value, 0))
  }
  return { multipart: out }
}

/**
 * The Content-Type `fetch` sends for a STRING body the caller gave no type for — the Fetch standard's "extract a body"
 * step (`text/plain;charset=UTF-8`). URLSession and OkHttp have no such default (URLSession can even pick
 * `application/x-www-form-urlencoded`), so without it the same `useFetch(url, { method: 'POST', body })` reached a
 * server with a different content type per platform.
 */
const FETCH_STRING_BODY_TYPE = 'text/plain;charset=UTF-8'

function withDefaultContentType(p: HttpRequestParts): HttpRequestParts {
  if (p.body === undefined && p.bodyExpr === undefined) return p
  const names = [...Object.keys(p.headers ?? {}), ...Object.keys(p.headerExprs ?? {})]
  if (names.some((n) => n.toLowerCase() === 'content-type')) return p
  return { ...p, headers: { ...p.headers, 'content-type': FETCH_STRING_BODY_TYPE } }
}

/**
 * A runtime body, when it can be sent: an expression typed `string` (what the web's `init.body` must be, and what
 * `PyreonHttpRequest` carries). A type inference could not settle is let through — the native compiler is then the
 * judge. Anything else is refused with the fix rather than sending `[object Object]`-shaped text.
 */
function sendableBodyExpr(expr: ExprIR | undefined, ctx: RequestEmitCtx, where: string): ExprIR | undefined {
  if (expr === undefined) return undefined
  const t = ctx.inferType(expr)
  if (t.kind === 'string' || t.kind === 'unknown') return expr
  ctx.warn(
    `${where} body must be a string — serialize it first (\`JSON.stringify(value)\`), as the web requires. The request is sent with NO body on iOS and Android.`,
  )
  return undefined
}

/**
 * The argument list of a Swift `PyreonHttpRequest(…)` — `method: .post, url: …, headers: […], body: …`. One writer for
 * every request a plugin emits (useFetch, useQuery, useMutation, an awaited endpoint call), so the platforms cannot
 * drift apart call site by call site. `where` prefixes a refused-header warning.
 */
export function swiftHttpRequestArgs(p: HttpRequestParts, ctx: RequestEmitCtx, where: string): string {
  const upload = resolveUpload(p, ctx, where)
  p = withDefaultContentType({ ...p, ...upload.text, bodyExpr: sendableBodyExpr(upload.text?.bodyExpr ?? p.bodyExpr, ctx, where) })
  const parts = [`method: .${(p.method ?? 'GET').toLowerCase()}`, `url: ${p.url}`]
  const pairs = [
    ...Object.entries(p.headers ?? {}).map(([k, v]) => `${ctx.stringLiteral(k)}: ${ctx.stringLiteral(v)}`),
    ...sendableHeaderExprs(p.headerExprs, ctx, where).map(([k, e]) => `${ctx.stringLiteral(k)}: ${ctx.expr(e, 0)}`),
  ]
  if (pairs.length > 0) parts.push(`headers: [${pairs.join(', ')}]`)
  if (p.body !== undefined) parts.push(`body: Data(${ctx.stringLiteral(p.body)}.utf8)`)
  else if (p.bodyExpr !== undefined) parts.push(`body: Data((${ctx.expr(p.bodyExpr, 0)}).utf8)`)
  if (upload.multipart !== undefined) parts.push(`upload: .multipart(PyreonMultipartBody(${upload.multipart.join(', ')}))`)
  else if (upload.file !== undefined) parts.push(`upload: .file(${ctx.expr(upload.file, 0)})`)
  return parts.join(', ')
}

/** The Kotlin twin of {@link swiftHttpRequestArgs}: `method = PyreonHttpMethod.POST, url = …, headers = mapOf(…), body = …`. */
export function kotlinHttpRequestArgs(p: HttpRequestParts, ctx: RequestEmitCtx, where: string): string {
  const upload = resolveUpload(p, ctx, where)
  p = withDefaultContentType({ ...p, ...upload.text, bodyExpr: sendableBodyExpr(upload.text?.bodyExpr ?? p.bodyExpr, ctx, where) })
  const parts = [`method = PyreonHttpMethod.${(p.method ?? 'GET').toUpperCase()}`, `url = ${p.url}`]
  const pairs = [
    ...Object.entries(p.headers ?? {}).map(([k, v]) => `${ctx.stringLiteral(k)} to ${ctx.stringLiteral(v)}`),
    ...sendableHeaderExprs(p.headerExprs, ctx, where).map(([k, e]) => `${ctx.stringLiteral(k)} to ${ctx.expr(e, 0)}`),
  ]
  if (pairs.length > 0) parts.push(`headers = mapOf(${pairs.join(', ')})`)
  if (p.body !== undefined) parts.push(`body = ${ctx.stringLiteral(p.body)}`)
  else if (p.bodyExpr !== undefined) parts.push(`body = ${ctx.expr(p.bodyExpr, 0)}`)
  if (upload.multipart !== undefined) parts.push(`upload = PyreonHttpUpload.Multipart(PyreonMultipartBody(${upload.multipart.join(', ')}))`)
  else if (upload.file !== undefined) parts.push(`upload = PyreonHttpUpload.File(${ctx.expr(upload.file, 0)})`)
  return parts.join(', ')
}

/**
 * The Swift lines that SEND a request and reject a non-2xx, binding `__response`. A non-2xx must throw rather than
 * decode: an error page handed to `JSONDecoder` reads as "the server sent bad JSON" and hides the status.
 */
export function swiftSendLines(requestArgs: string): string[] {
  return [
    `let __response = try await PyreonHttp.send(`,
    `  PyreonHttpRequest(${requestArgs})`,
    `)`,
    `guard __response.isOK else {`,
    `  throw PyreonHttpError.badStatus(__response.status)`,
    `}`,
  ]
}

/** The Kotlin twin of {@link swiftSendLines}: the blocking send moved off the main thread, then the status check. */
export function kotlinSendLines(requestArgs: string): string[] {
  return [
    `val __response = withContext(Dispatchers.IO) {`,
    // The OkHttp default comes from HERE, as a direct reference: see `PyreonHttp.send` for why it cannot live in the runtime.
    `  PyreonHttp.send(PyreonHttpRequest(${requestArgs}), fallback = PyreonHttpOkHttp)`,
    `}`,
    `if (!__response.isOk) throw PyreonHttpError.BadStatus(__response.status)`,
  ]
}

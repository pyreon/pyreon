/**
 * Lower a hosted-engine view (`<CodeWebView>`, `<RichTextWebView>`) to the generic `<WebView src data onMessage>`.
 *
 * Both editors cross to native the same way: the web engine runs inside a WebView, a bundled page is loaded by name,
 * the editor state is pushed in as `data`, and the page posts back over one string channel. The wire protocol, shared
 * with the JS host builders and the JS components:
 *
 *   forward  `data`       the state object → the editor, updated in place
 *   reverse  `<edit>:<payload>`   a user edit      `e:<message>`   a host failure
 *
 * Plain one-letter prefixes, not JSON, because the lowered handler has to take the payload apart on BOTH targets with
 * string operations PMTC already lowers. Parsing JSON natively would need a new runtime surface on each target.
 */
import type { AttrIR, ChildIR, ExprIR, StatementIR, JsxElementIR } from './types'
import type { RetagContext } from './element-lowering'

const lit = (value: string): ExprIR => ({ kind: 'literal', value })
const ident = (name: string): ExprIR => ({ kind: 'identifier', name })
const member = (object: ExprIR, property: string): ExprIR => ({ kind: 'member', object, property })
const call = (callee: ExprIR, args: ExprIR[]): ExprIR => ({ kind: 'call', callee, args })

/** `m.startsWith("<prefix>")` */
const startsWith = (m: string, prefix: string): ExprIR => call(member(ident(m), 'startsWith'), [lit(prefix)])
/** `m.slice(<prefix.length>)` */
const afterPrefix = (m: string, prefix: string): ExprIR => call(member(ident(m), 'slice'), [{ kind: 'literal', value: prefix.length }])

/** Unwrap `(expr)` and TS-erased parens — an arrow's object-literal body arrives as `paren(object)`. */
function unparen(expr: ExprIR): ExprIR {
  return expr.kind === 'paren' ? unparen(expr.inner) : expr
}

/**
 * The statements that run a user callback `fn` with `payload` as its argument, by INLINING an arrow (bind its parameter
 * to the payload, then its body) or CALLING any other expression. Inlined, because no call of an arrow literal is
 * needed and the handler stays exactly the code the author wrote.
 */
function runCallback(fn: ExprIR, payload: ExprIR): StatementIR[] {
  const f = unparen(fn)
  if (f.kind !== 'arrow') return [{ kind: 'expr', expr: call(f, [payload]) }]
  const bind: StatementIR[] =
    f.params.length > 0 ? [{ kind: 'let', name: f.params[0]!, expr: payload, declaredType: { kind: 'string' } }] : []
  if (f.stmts !== undefined && f.stmts.length > 0) return [...bind, ...f.stmts]
  if (f.body.kind === 'literal' && f.body.value === '') return bind
  return [...bind, { kind: 'expr', expr: f.body }]
}

/** The `onMessage` arrow: route the edit prefix to the edit callback and `e:` to the error callback. */
function messageHandler(editPrefix: string, onChange: ExprIR | undefined, onError: ExprIR | undefined): ExprIR {
  const m = 'pyreonHostMessage'
  const branches: { prefix: string; fn: ExprIR | undefined }[] = [
    { prefix: `${editPrefix}:`, fn: onChange },
    { prefix: 'e:', fn: onError },
  ]
  let chain: StatementIR[] = []
  for (const { prefix, fn } of [...branches].reverse()) {
    if (fn === undefined) continue
    chain = [
      {
        kind: 'if',
        cond: startsWith(m, prefix),
        then: runCallback(fn, afterPrefix(m, prefix)),
        ...(chain.length > 0 ? { elseBody: chain } : {}),
      },
    ]
  }
  return { kind: 'arrow', params: [m], paramTypes: [{ kind: 'string' }], body: lit(''), stmts: chain }
}

/** What distinguishes one hosted-engine view from another. */
export interface HostedWebViewSpec {
  /** The JSX tag as authored (`CodeWebView`) — used in diagnostics. */
  readonly tag: string
  /** The bundled page filename the lowered `<WebView src>` loads. */
  readonly hostFile: string
  /** One-letter prefix the page puts on an edit message (`v` → `v:<text>`). */
  readonly editPrefix: string
  /** Props that carried the web engine bundle on web; ignored on native, where the page is built from the app's install. */
  readonly engineProps: readonly string[]
  /** An example `state` for the "state is required" diagnostic. */
  readonly stateExample: string
}

/**
 * Rewrite a hosted-engine element to `<WebView>`. Returns `undefined` when the element cannot be hosted (no usable
 * `state`); a warning has then been reported against the tag the author wrote.
 */
export function retagHostedWebView(el: JsxElementIR, ctx: RetagContext, spec: HostedWebViewSpec): JsxElementIR | undefined {
  const handled = new Set(['state', 'change', 'error', 'html', ...spec.engineProps.map((p) => p.toLowerCase())])
  const attrs: AttrIR[] = []
  let state: ExprIR | undefined
  let onChange: ExprIR | undefined
  let onError: ExprIR | undefined
  let customHtml = false
  for (const a of el.attrs) {
    if (a.kind === 'attr' && a.name === 'state') state = unparen(a.value)
    else if (a.kind === 'event' && a.name === 'change') onChange = a.handler
    else if (a.kind === 'event' && a.name === 'error') onError = a.handler
    else if (a.kind === 'attr' && a.name === 'html') {
      customHtml = true
      attrs.push(a)
    } else if (a.kind === 'attr' && spec.engineProps.includes(a.name)) {
      ctx.warn(
        `<${spec.tag} ${a.name}={…}>: the native host page is built by \`pyreon-native assets\` from the app's installed engine, ` +
          `so ${a.name} is ignored. Pass \`html\` to use a page you built yourself.`,
      )
    } else if (a.kind === 'spread' || !handled.has(a.name.toLowerCase())) attrs.push(a)
  }
  if (state === undefined) {
    ctx.warn(`<${spec.tag}>: \`state\` is required on native — there is nothing to host without it. Pass state={() => (${spec.stateExample})}.`)
    return undefined
  }
  if (state.kind === 'arrow' && state.stmts !== undefined && state.stmts.length > 0) {
    ctx.warn(`<${spec.tag} state={() => { … }}>: a block-bodied accessor cannot lower; return the object directly — state={() => (${spec.stateExample})}.`)
    return undefined
  }
  // `state` is an accessor in the reactive form: native `data` is re-read on change, so the object it returns IS the value.
  const data: ExprIR = state.kind === 'arrow' ? unparen(state.body) : state
  const out: AttrIR[] = [...attrs, { kind: 'attr', name: 'data', value: data }]
  if (!customHtml) out.push({ kind: 'attr', name: 'src', value: lit(spec.hostFile) })
  if (onChange !== undefined || onError !== undefined) {
    out.push({ kind: 'event', name: 'message', handler: messageHandler(spec.editPrefix, onChange, onError) })
  }
  const children: ChildIR[] = []
  return { kind: 'jsx-element', tag: 'WebView', attrs: out, children }
}

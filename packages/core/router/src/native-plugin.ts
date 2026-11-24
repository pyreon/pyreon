/** Hook lowerings are package-owned; canonical navigation hosting remains a backend primitive. */
import type {
  AstNode,
  CallRecognizer,
  CompilerPlugin,
  ExtPayload,
  MemberCallLowering,
  TypeIR,
} from '@pyreon/native-compiler/plugin-api'
const recognizeParams: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  // The WHOLE-OBJECT form. It lowers to a `[String: String]` / `Map`, so the
  // natural JS follow-up — `p.id` — emits `p.id`, which is not how a Swift
  // dictionary or a Kotlin map is read. That failed on BOTH targets with no
  // diagnostic, while the destructured form
  // (`const { id } = useParams()` → `useParams(router:)["id"] ?? ""`)
  // works on both and handles the Optional.
  //
  // Warn rather than rewrite `.id` → `["id"]`: member access is emitted from
  // everywhere, and narrowing a codegen rewrite to exactly this binding is a
  // change that wants the full suite green to land safely. The destructure is
  // already the supported, idiomatic shape — pointing at it costs the author
  // one line and nothing in correctness.
  ctx.report(
    `const ${name} = useParams() lowers to a native dictionary/map, so a property read like \`${name}.id\` emits \`${name}.id\` and does NOT compile on either target. Destructure instead — \`const { id } = useParams()\` — which lowers per key (\`useParams(router:)["id"] ?? ""\`) and works on both.`,
  )
  return { type: 'params', payload: { hook: 'params' } }
}
// `useLoaderData<T>()`. On the web it returns a reactive ACCESSOR (`() => T`), read as `data().title`, so the page follows
// data that changes under the same loader key without remounting. On the web a route's loader runs BEFORE its component
// renders, so the data is always there. Natively the loader runs on appear and the data arrives a moment later, so the
// runtime read is optional; the component renders only once its loader data exists (a body gate on Swift, an early
// `return` on Kotlin), so the binding is NON-optional, exactly as on the web.
//
// The binding lowers to a value (a Swift computed property / a Kotlin `val`) that re-reads the router's loader store, so
// the web's `data()` lowers to a plain `data` read (a non-callable binding's zero-argument call reads as a
// property) and `data().title` to `data.title`. `typing.value` types that call as `T`.
const recognizeLoader: CallRecognizer = (_call, ctx) => {
  const type = ctx.typeArg()
  if (ctx.pattern === undefined) return { type: 'loader', payload: { type } as unknown as ExtPayload }
  // A destructure (`const { title } = useLoaderData<T>()`) reads fields off the ACCESSOR function — broken on the web,
  // so it is not lowered here either: compiling it natively would ship an app whose source is wrong on its primary
  // target. Claimed (`null`) with the fix, so the binding never falls through to a generic emit.
  const keys =
    ctx.pattern.type === 'ObjectPattern'
      ? ((ctx.pattern.properties as readonly AstNode[] | undefined) ?? []).map((prop) =>
          prop.type === 'Property' && !ctx.hasDynamicKey(prop) ? ctx.propKey(prop) : undefined,
        )
      : []
  const shape = ctx.pattern.type === 'ObjectPattern' ? `{ ${keys.map((k) => k ?? '…').join(', ')} }` : '[…]'
  const field = keys.find((k) => k !== undefined) ?? 'field'
  ctx.report(
    `\`const ${shape} = useLoaderData<T>()\` destructures an accessor and is not lowered on native. useLoaderData<T>() returns an accessor: bind it and read the field through the call — \`const data = useLoaderData<T>()\`, then \`data().${field}\`.`,
  )
  return null
}
/**
 * The native type of the loader data. An inline object type (`useLoaderData<{ x: string }>()`) names the struct the
 * loader's object literal resolves to — the runtime reads the data back with `as? T` / a reified cast, so the two must
 * be the same type, and a bare `Any` (Kotlin) cannot be read by field at all.
 */
const loaderTypeText = (
  type: TypeIR,
  ctx: {
    typeText(t: TypeIR, o?: { synthesize?: boolean | undefined }): string
    structs: { forTypeFields(f: readonly { name: string; type: TypeIR }[]): string | null }
  },
  kotlin = false,
): string =>
  (type.kind === 'object' ? ctx.structs.forTypeFields(type.fields) : null) ??
  ctx.typeText(type, kotlin ? { synthesize: false } : undefined)
/** The Swift body gate: render only once the route's loader data exists. */
const loaderGate = (type: string) => ({
  swift: (_decls: readonly unknown[], ctx: { indent: number }, next: (indent: number) => string): string => {
    const pad = ' '.repeat(ctx.indent)
    return [`${pad}if (useLoaderData(router: pyreonRouter) as ${type}?) != nil {`, next(ctx.indent + 2), `${pad}}`].join('\n')
  },
})
const recognizePattern: CallRecognizer = (_call, ctx) => {
  if (ctx.pattern?.type !== 'ObjectPattern') return undefined
  const params: { key: string; local: string }[] = []
  for (const prop of (ctx.pattern.properties as
    | readonly (AstNode & { value?: AstNode & { name?: string } })[]
    | undefined) ?? []) {
    if (prop.type !== 'Property') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, '`const { … } = useParams()`')
      continue
    }
    const key = ctx.propKey(prop)
    const local = prop.value?.type === 'Identifier' ? prop.value.name : key
    if (key !== undefined && local !== undefined) params.push({ key, local })
  }
  return params.length === 0 ? null : { type: 'params-fields', payload: { params } }
}
// `router.push(path)` on the handle. Claimed here because the generic emit reads any `.push(x)` on a receiver it cannot
// type as an ARRAY push (Swift `append`, Kotlin `add`), which the handle does not have.
const handleCall = (method: string): MemberCallLowering => ({
  swift: (call, ctx) =>
    call.receiver.type === 'router-handle' && call.args.length === 1
      ? `${ctx.ident(call.receiver.name)}.${method}(${ctx.expr(call.args[0]!)})`
      : undefined,
  kotlin: (call, ctx) =>
    call.receiver.type === 'router-handle' && call.args.length === 1
      ? `${ctx.ident(call.receiver.name)}.${method}(${ctx.expr(call.args[0]!)})`
      : undefined,
})

export const routerPlugin: CompilerPlugin = {
  name: '@pyreon/router',
  apiVersion: 2,
  modules: ['@pyreon/router'],
  calls: {
    useNavigate: () => ({ type: 'navigate', payload: { hook: 'navigate' } }),
    // `const router = useRouter()` → a handle with push / replace / back / forward. Other members of the web Router
    // (currentRoute, beforeEach, …) have no native counterpart and fail the native build by name.
    useRouter: () => ({ type: 'router-handle', payload: { hook: 'router-handle' } }),
    useParams: recognizeParams,
    useLoaderData: recognizeLoader,
  },
  patternCalls: { useParams: recognizePattern, useLoaderData: recognizeLoader },
  memberCalls: { push: handleCall('push'), replace: handleCall('replace') },
  decls: {
    navigate: {
      legacyKind: 'router-hook',
      callable: true,
      usesRouter: true,
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: (String) -> Void { useNavigate(router: pyreonRouter) }`,
      kotlin: (decl, ctx) => `val ${ctx.ident(decl.name)} = useNavigate()`,
    },
    'router-handle': {
      legacyKind: 'router-hook',
      usesRouter: true,
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: PyreonRouterHandle { useRouter(router: pyreonRouter) }`,
      kotlin: (decl, ctx) => `val ${ctx.ident(decl.name)} = useRouter()`,
    },
    params: {
      legacyKind: 'router-hook',
      usesRouter: true,
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: [String: String] { useParams(router: pyreonRouter) }`,
      kotlin: (decl, ctx) => `val ${ctx.ident(decl.name)} = useParams()`,
    },
    loader: {
      legacyKind: 'useLoaderData',
      usesRouter: true,
      // Non-optional: the root gate (Swift) / early return (Kotlin) guarantees the data exists before any read.
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: ${loaderTypeText(decl.payload.type as unknown as TypeIR, ctx)} { useLoaderData(router: pyreonRouter)! }`,
      kotlin: (decl, ctx) =>
        `val ${ctx.ident(decl.name)} = useLoaderData<${loaderTypeText(decl.payload.type as unknown as TypeIR, ctx, true)}>() ?: return`,
      // `data()` is the web read (the accessor). Natively the binding IS the value, so the zero-argument call lowers to
      // `data` (an unknown identifier's call reads as a property); this types it as `T`, so a member chain off it
      // (`data().tags.length`, `data().views > 3`) lowers with the receiver's type — `.count` / `.size` for `.length`,
      // no optional wrapping of a field `T` declares non-optional.
      typing: { value: (decl) => decl.payload.type as unknown as TypeIR },
      root: {
        swift: (decls, ctx, next) =>
          loaderGate(loaderTypeText(decls[0]!.payload.type as unknown as TypeIR, ctx)).swift(decls, ctx, next),
      },
    },
    'params-fields': {
      legacyKind: 'params-destructure',
      legacyName: false,
      usesRouter: true,
      swift: (decl, ctx) =>
        (decl.payload.params as unknown as { key: string; local: string }[])
          .map(
            (p) =>
              `private var ${ctx.ident(p.local)}: String { useParams(router: pyreonRouter)[${ctx.stringLiteral(p.key)}] ?? "" }`,
          )
          .join('\n  '),
      kotlin: (decl, ctx) =>
        (decl.payload.params as unknown as { key: string; local: string }[])
          .map((p) => `val ${ctx.ident(p.local)} = useParams()[${ctx.stringLiteral(p.key)}] ?: ""`)
          .join('\n  '),
    },
  },
}
export default routerPlugin

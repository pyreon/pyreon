/** Hook lowerings are package-owned; canonical navigation hosting remains a backend primitive. */
import type {
  AstNode,
  CallRecognizer,
  CompilerPlugin,
  ExtPayload,
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
const recognizeLoader: CallRecognizer = (_call, ctx) => {
  const bindingDesc =
    ctx.pattern === undefined
      ? `\`const ${ctx.declName} = useLoaderData<T>()\``
      : ctx.pattern.type === 'ObjectPattern'
        ? '`const { ... } = useLoaderData<T>()`'
        : '`useLoaderData<T>()`'
  if (ctx.pattern !== undefined) {
    ctx.report(
      `useLoaderData<T>() declared (${bindingDesc}) — destructure form not yet emitted on native targets. Use the single-binding shape \`const data = useLoaderData<T>(); …data.x\` instead. Tracked as Phase B+ follow-up.`,
    )
    return null
  }
  // The single-binding read is fully supported: it lowers to a read of the
  // runtime's loader data, which a route's `loader` populates on appear (the
  // route-array parser extracts the loader; both emitters call
  // `setLoaderData`). A loader shape that cannot lower warns at the route
  // itself, so there is nothing to report here.
  return { type: 'loader', payload: { type: ctx.typeArg() } as unknown as ExtPayload }
}
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
export const routerPlugin: CompilerPlugin = {
  name: '@pyreon/router',
  apiVersion: 2,
  modules: ['@pyreon/router'],
  calls: {
    useNavigate: () => ({ type: 'navigate', payload: { hook: 'navigate' } }),
    useParams: recognizeParams,
    useLoaderData: recognizeLoader,
  },
  patternCalls: { useParams: recognizePattern, useLoaderData: recognizeLoader },
  decls: {
    navigate: {
      legacyKind: 'router-hook',
      callable: true,
      usesRouter: true,
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: (String) -> Void { useNavigate(router: pyreonRouter) }`,
      kotlin: (decl, ctx) => `val ${ctx.ident(decl.name)} = useNavigate()`,
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
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: ${ctx.typeText(decl.payload.type as unknown as TypeIR)}? { useLoaderData(router: pyreonRouter) }`,
      kotlin: (decl, ctx) =>
        `val ${ctx.ident(decl.name)} = useLoaderData<${ctx.typeText(decl.payload.type as unknown as TypeIR, { synthesize: false })}>()`,
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

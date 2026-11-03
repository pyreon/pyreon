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
// `useLoaderData<T>()`. On the web a route's loader runs BEFORE its component renders, so the data is always there.
// Natively the loader runs on appear and the data arrives a moment later, so the runtime read is optional — and the
// emit used to hand that optional straight to the author's code: `data.title` failed to compile on both targets, with
// no warning. The component now renders only once its loader data exists (a body gate on Swift, an early `return` on
// Kotlin), so every binding below is NON-optional, exactly as on the web.
const recognizeLoader: CallRecognizer = (_call, ctx) => {
  const type = ctx.typeArg()
  if (ctx.pattern === undefined) return { type: 'loader', payload: { type } as unknown as ExtPayload }
  if (ctx.pattern.type !== 'ObjectPattern') {
    ctx.report(
      `useLoaderData<T>() can be bound to a name (\`const data = useLoaderData<T>()\`) or destructured into fields (\`const { title } = useLoaderData<T>()\`) on native; this binding shape is neither, so it was not lowered.`,
    )
    return null
  }
  const fields: { key: string; local: string }[] = []
  for (const prop of (ctx.pattern.properties as
    | readonly (AstNode & { value?: AstNode & { name?: string } })[]
    | undefined) ?? []) {
    if (prop.type !== 'Property') {
      ctx.report(
        '`const { …rest } = useLoaderData<T>()`: a rest element is not lowered on native. Name the fields you read, or bind the whole object (`const data = useLoaderData<T>()`).',
      )
      return null
    }
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, '`const { … } = useLoaderData<T>()`')
      return null
    }
    const key = ctx.propKey(prop)
    if (key === undefined || prop.value?.type !== 'Identifier' || prop.value.name === undefined) {
      ctx.report(
        `\`const { ${key ?? '…'}: … } = useLoaderData<T>()\`: only a plain or renamed field (\`{ title }\`, \`{ title: heading }\`) is lowered on native — not a nested pattern or a default. Bind the whole object (\`const data = useLoaderData<T>()\`) and read \`data.${key ?? 'field'}\` instead.`,
      )
      return null
    }
    fields.push({ key, local: prop.value.name })
  }
  return fields.length === 0
    ? null
    : { type: 'loader-fields', payload: { type, fields } as unknown as ExtPayload }
}
const LOADER_HOLDER = '__pyreonLoaderData'
const missingLoaderField = (key: string, type: string): string =>
  `\`const { ${key} } = useLoaderData<${type}>()\`: ${type} declares no field \`${key}\`, so its native type is unknown and the field was not bound. Check the field name, or give useLoaderData a type that declares it.`
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
      // Non-optional: the root gate (Swift) / early return (Kotlin) guarantees the data exists before any read.
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: ${loaderTypeText(decl.payload.type as unknown as TypeIR, ctx)} { useLoaderData(router: pyreonRouter)! }`,
      kotlin: (decl, ctx) =>
        `val ${ctx.ident(decl.name)} = useLoaderData<${loaderTypeText(decl.payload.type as unknown as TypeIR, ctx, true)}>() ?: return`,
      root: {
        swift: (decls, ctx, next) =>
          loaderGate(loaderTypeText(decls[0]!.payload.type as unknown as TypeIR, ctx)).swift(decls, ctx, next),
      },
    },
    'loader-fields': {
      legacyKind: 'useLoaderData',
      legacyName: false,
      usesRouter: true,
      swift: (decl, ctx) => {
        const type = decl.payload.type as unknown as TypeIR
        const fieldTypes = new Map(ctx.rowFields(type).map((f) => [f.name, f.type]))
        const lines = [`private var ${LOADER_HOLDER}: ${loaderTypeText(type, ctx)} { useLoaderData(router: pyreonRouter)! }`]
        for (const f of decl.payload.fields as unknown as { key: string; local: string }[]) {
          const fieldType = fieldTypes.get(f.key)
          if (fieldType === undefined) {
            ctx.warn(missingLoaderField(f.key, loaderTypeText(type, ctx)))
            continue
          }
          lines.push(`private var ${ctx.ident(f.local)}: ${ctx.typeText(fieldType)} { ${LOADER_HOLDER}.${ctx.ident(f.key)} }`)
        }
        return lines.join('\n  ')
      },
      kotlin: (decl, ctx) => {
        const type = decl.payload.type as unknown as TypeIR
        const known = new Set(ctx.rowFields(type).map((f) => f.name))
        const lines = [`val ${LOADER_HOLDER} = useLoaderData<${loaderTypeText(type, ctx, true)}>() ?: return`]
        for (const f of decl.payload.fields as unknown as { key: string; local: string }[]) {
          if (!known.has(f.key)) {
            ctx.warn(missingLoaderField(f.key, loaderTypeText(type, ctx, true)))
            continue
          }
          lines.push(`val ${ctx.ident(f.local)} = ${LOADER_HOLDER}.${ctx.ident(f.key)}`)
        }
        return lines.join('\n  ')
      },
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

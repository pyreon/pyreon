/**
 * Client emission: the HTTP client, the endpoint declarations, and the
 * per-operation query bindings.
 *
 * The two targets differ in FILE LAYOUT, not just in constructs, and that is
 * the whole trick. PMTC has no module graph — `transform()` takes one file's
 * source and returns one file's output, and its recognizers only ever see the
 * top level of the file in front of them. So a `createHttp` client in
 * `client.ts` and an `api.endpoint(...)` in `endpoints/users.ts` are, to the
 * native compiler, two unrelated files: the endpoint resolves against nothing
 * and the call stays web.
 *
 * A human would never accept one giant file per feature. Generated code has no
 * such objection — nobody reads it, and the compiler that does read it wants
 * exactly that shape. So `web` gets the idiomatic split and `multiplatform`
 * gets one self-contained module per tag, with the client, the schemas, the
 * endpoints and the calls all in a single top level.
 */

import { reachableModels, topoSortModels } from '../core/graph'
import type { IrDocument, IrOperation, IrType } from '../core/ir'
import { typeIdent } from '../core/naming'
import { schemaExpr, schemaSpecifier, tsType } from './schema'
import { q, relativeSpecifier, SourceFile } from './writer'

export interface ClientOptions {
  native: boolean
  /** Overrides the spec's `servers[0].url`. */
  baseUrl?: string | undefined
}

export const CLIENT_FILE = 'client.ts'

/** `client.ts` — the shared `createHttp` instance. Web layout only. */
export function emitClient(doc: IrDocument, opts: ClientOptions): SourceFile {
  const f = new SourceFile(CLIENT_FILE)
  f.import('@pyreon/http', 'createHttp')
  f.import('@pyreon/http/schema', 'standardSchema')
  f.line()
  f.doc(
    `HTTP client for ${doc.title} ${doc.version}.`,
    '',
    'The baseUrl is emitted as a STRING LITERAL on purpose. PMTC reads it at',
    'compile time to build the native request URL, and a computed value (an',
    'env read, a concatenation) makes every endpoint on this client web-only.',
    '',
    '`schema` is REQUIRED here, not optional polish: @pyreon/http keeps schema',
    'support opt-in so the core costs nothing when unused, and an endpoint',
    'declared with `{ response }` against a client that has not enabled it',
    'FAILS AT RUNTIME — the request succeeds, the validation step rejects, and',
    'the query settles as an error with a 200 on the wire.',
  )
  f.line(`export const api = createHttp({`)
  f.line(`  baseUrl: ${q(baseUrlOf(doc, opts))},`)
  f.line(`  schema: standardSchema,`)
  f.line(`})`)
  return f
}

function baseUrlOf(doc: IrDocument, opts: ClientOptions): string {
  return opts.baseUrl ?? doc.baseUrl
}

/** The `'GET /users/:id'` literal an endpoint is declared with. */
export function endpointSpec(op: IrOperation): string {
  return `${op.method} ${op.path}`
}

/**
 * Group operations by tag, in a stable order.
 *
 * Sorted so regeneration is byte-identical; `default` (untagged) sorts with
 * everything else rather than being special-cased to the front.
 */
export function byTag(doc: IrDocument): Map<string, IrOperation[]> {
  const out = new Map<string, IrOperation[]>()
  for (const op of [...doc.operations].sort((a, b) => a.id.localeCompare(b.id))) {
    const list = out.get(op.tag)
    if (list) list.push(op)
    else out.set(op.tag, [op])
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/** The argument type for one operation's call site. */
function argsType(op: IrOperation): string | undefined {
  const parts: string[] = []
  if (op.pathParams.length > 0) {
    const inner = op.pathParams.map((p) => `${p.name}: ${tsType(p.type)}`).join('; ')
    parts.push(`params: { ${inner} }`)
  }
  if (op.queryParams.length > 0) {
    const inner = op.queryParams
      .map((p) => `${p.name}${p.required ? '' : '?'}: ${tsType(p.type)}`)
      .join('; ')
    parts.push(`query${op.queryParams.some((p) => p.required) ? '' : '?'}: { ${inner} }`)
  }
  if (op.body) parts.push(`json: ${tsType(op.body)}`)
  return parts.length > 0 ? `{ ${parts.join('; ')} }` : undefined
}

/** Does this operation mutate? Decides query vs mutation binding. */
export function isMutation(op: IrOperation): boolean {
  return op.method !== 'GET' && op.method !== 'HEAD' && op.method !== 'OPTIONS'
}

/**
 * WEB layout: `endpoints.ts` + `queries.ts`, importing the shared client.
 *
 * Idiomatic and tree-shakeable. Deliberately NOT what the native layout does.
 */
export function emitWebEndpoints(doc: IrDocument): SourceFile[] {
  const files: SourceFile[] = []
  for (const [tag, ops] of byTag(doc)) {
    const path = `endpoints/${tagFile(tag)}.ts`
    const f = new SourceFile(path)
    f.import(relativeSpecifier(path, CLIENT_FILE), 'api')
    // The response clause can name several models (an array of refs, a union),
    // so collect them structurally rather than taking a top-level name.
    const schemaImports = new Set<string>()
    for (const op of ops) collectRefs(op.response, schemaImports)
    if (schemaImports.size > 0) f.import(schemaSpecifier(path), ...schemaImports)

    // Built once per operation. The previous form called `responseCfg` a second
    // time just to test the string for `s.`, which rebuilt every response
    // schema expression in the tag for a substring check.
    const clauses = ops.map((op) => responseCfg(op, false))
    // A composite clause (`s.array(Book)`, a union) needs `s` itself.
    if (clauses.some((c) => c.includes('s.'))) f.import('@pyreon/validate', 's')

    for (const [i, op] of ops.entries()) {
      f.line()
      f.doc(op.summary, `\`${endpointSpec(op)}\``)
      f.line(`export const ${op.id} = api.endpoint(${q(endpointSpec(op))}${clauses[i] ?? ''})`)
    }
    files.push(f)
  }
  return files
}

/**
 * The `{ response: … }` clause for an endpoint declaration.
 *
 * Emitted for EVERY response Lathe can describe, not only a bare `$ref`.
 * `Endpoint<S, TResponse>` takes its response type from this schema — omit it
 * and `TResponse` is `unknown`, so `endpoint.query()` yields
 * `QueryOptionsLike<unknown>` and every generated hook fails to typecheck in
 * the consumer's repo. It also buys real runtime validation for free.
 */
function responseCfg(op: IrOperation, native: boolean): string {
  if (!op.response) return ''
  if (op.response.kind === 'unknown') return ''
  return `, { response: ${schemaExpr(op.response, { native })} }`
}

/** WEB layout: `queries.ts` — reactive hooks, one per operation. */
export function emitWebQueries(doc: IrDocument): SourceFile[] {
  const files: SourceFile[] = []
  for (const [tag, ops] of byTag(doc)) {
    const path = `queries/${tagFile(tag)}.ts`
    const f = new SourceFile(path)
    const epPath = `endpoints/${tagFile(tag)}.ts`
    f.import(relativeSpecifier(path, epPath), ...ops.map((o) => o.id))
    const usesQuery = ops.some((o) => !isMutation(o))
    const usesMutation = ops.some((o) => isMutation(o))
    if (usesQuery) f.import('@pyreon/query', 'useQuery')
    if (usesMutation) f.import('@pyreon/query', 'useMutation')

    // Import exactly what the emitted lines reference: response types for
    // queries, ARG types (which carry the body) for mutations. Collecting both
    // for every operation leaves an unused import, which is a lint error in a
    // consumer's repo and a confusing one, since nobody wrote the file.
    const typeImports = new Set<string>()
    for (const op of ops) {
      if (isMutation(op)) collectRefs(op.body, typeImports)
      else collectRefs(op.response, typeImports)
    }
    if (typeImports.size > 0) f.importType(schemaSpecifier(path), ...typeImports)

    for (const op of ops) {
      const args = argsType(op)
      const hook = `use${typeIdent(op.id)}`
      const ret = op.response ? tsType(op.response) : 'void'
      f.line()
      if (isMutation(op)) {
        // The variables type is the endpoint's own call args, so a caller
        // that forgets `json` (or misspells a path param) is a compile error
        // rather than a request the server rejects at runtime.
        const vars = args ?? 'Record<string, never>'
        f.doc(
          op.summary,
          `\`${endpointSpec(op)}\``,
          '',
          'Mutation options are a plain object — imperative, nothing to track.',
        )
        f.line(`export function ${hook}() {`)
        f.line(`  return useMutation({ mutationFn: (vars: ${vars}) => ${op.id}(vars) })`)
        f.line('}')
        continue
      }
      f.doc(
        op.summary,
        `\`${endpointSpec(op)}\``,
        '',
        // The accessor argument is the whole reason this is a function and not
        // an object: `@pyreon/query` re-reads it, so a signal in `args` makes
        // the query key move and the request refetch.
        args ? 'Takes an ACCESSOR so signal reads in the arguments stay reactive.' : undefined,
        // `options` is not optional polish. Without it there is no way to pass
        // `enabled`, so a query whose arguments are not ready yet fires anyway
        // with an empty parameter and 404s — which is exactly what a detail
        // view does before the user has selected anything.
        'Second accessor merges extra query options (`enabled`, `staleTime`, `select`).',
        '',
        // Worth stating on every generated hook: the result fields are signals,
        // and reading one WITHOUT calling it yields the signal function, which
        // is truthy. `data ?? []` then skips the fallback and `.length` reads
        // the function's arity — a silent zero rather than an error.
        'Result fields are SIGNALS: `q.data()`, `q.isPending()` — call them.',
      )
      const extra = 'options?: () => Record<string, unknown>'
      if (args) {
        f.line(`export function ${hook}(args: () => ${args}, ${extra}) {`)
        f.line(`  return useQuery<${ret}>(() => ({ ...${op.id}.query(args()), ...options?.() }))`)
      } else {
        f.line(`export function ${hook}(${extra}) {`)
        f.line(`  return useQuery<${ret}>(() => ({ ...${op.id}.query(), ...options?.() }))`)
      }
      f.line('}')
    }
    files.push(f)
  }
  return files
}

/**
 * NATIVE layout: one self-contained module per tag.
 *
 * Client, schemas, endpoints and calls share a top level, because PMTC's
 * recognizers cannot see across files. The schemas are duplicated into each
 * tag module rather than imported for the same reason — an imported `const
 * User = s.object(...)` is invisible to the native compiler, so a shared
 * `schemas.ts` would silently un-lower every response type.
 */
export function emitNativeModules(doc: IrDocument, opts: ClientOptions): SourceFile[] {
  const files: SourceFile[] = []
  // One expression per model, computed once. This used to render the WHOLE
  // schema file and string-search it for each model in each tag — quadratic in
  // (tags x models), and brittle besides: an emit-format change would have
  // silently broken the extraction. `schemaExpr` is the same single
  // implementation `emitSchemas` walks, so nothing is duplicated by calling it.
  const { order: modelOrder, backEdges } = topoSortModels(doc)
  const nativeSchema = new Map<string, string>()
  for (const model of doc.models) {
    // The SAME deferral the web schemas get. A native module is ordinary app
    // source too, so a cyclic `$ref` emitted as a direct forward reference is a
    // TDZ ReferenceError there exactly as it is on the web. `s.lazy` does not
    // lower, so this costs the model its native path -- which the verifier
    // reports. Correct-and-web-only beats lowering-and-broken.
    const defer = new Set(
      [...backEdges]
        .filter((e) => e.startsWith(`${model.name}|`))
        .map((e) => e.slice(model.name.length + 1)),
    )
    nativeSchema.set(model.name, schemaExpr(model.type, { native: true, defer }))
  }

  for (const [tag, ops] of byTag(doc)) {
    const path = `${tagFile(tag)}.native.tsx`
    const f = new SourceFile(path)
    f.import('@pyreon/http', 'createHttp')
    f.import('@pyreon/http/schema', 'standardSchema')
    f.import('@pyreon/validate', 's')
    if (ops.some((o) => !isMutation(o))) f.import('@pyreon/query', 'useQuery')

    f.line()
    f.doc(
      `${doc.title} — \`${tag}\`, self-contained for the native compiler.`,
      '',
      'Everything PMTC must recognise lives at THIS file\'s top level: the',
      'client, the schemas and the endpoint declarations. Splitting any of it',
      'into a shared module would compile fine and silently stop lowering,',
      'because PMTC resolves nothing across file boundaries.',
    )
    f.line(`const api = createHttp({ baseUrl: ${q(baseUrlOf(doc, opts))}, schema: standardSchema })`)

    // Schemas, inlined. The TRANSITIVE closure, not just the models an
    // operation names: a native module imports nothing, so inlining `Order`
    // while leaving out the `Customer` it references emits a module that does
    // not even typecheck. In DEPENDENCY ORDER for the same reason the web
    // schemas are — `const` is not hoisted.
    const direct = new Set<string>()
    for (const op of ops) {
      collectRefs(op.response, direct)
      collectRefs(op.body, direct)
    }
    const needed = reachableModels(doc, direct)
    const byName = new Map(doc.models.map((m) => [m.name, m]))
    for (const name of modelOrder) {
      const model = byName.get(name)
      if (!model || !needed.has(name)) continue
      f.line()
      f.doc(model.doc)
      f.line(`export const ${model.name} = ${nativeSchema.get(model.name) ?? 's.object({})'}`)
      // A STRUCTURAL type, not `Infer<typeof X>`. `Infer` would be an
      // `import type` — erased by TypeScript, but PMTC's warn pass reads the
      // import statement itself and reports the module as un-lowerable. The
      // rendered type is identical; only the derivation differs.
      f.line(`export type ${model.name} = ${tsType(model.type, 0, true)}`)
    }

    for (const op of ops) {
      f.line()
      f.doc(op.summary, `\`${endpointSpec(op)}\``)
      f.line(`export const ${op.id} = api.endpoint(${q(endpointSpec(op))}${responseCfg(op, true)})`)
    }

    // Data components. A component body is the ONLY place `useQuery` lowers —
    // a standalone hook function is read as a View and emitted verbatim, which
    // produces Swift that does not compile, with no warning at all.
    for (const op of ops) {
      if (isMutation(op)) continue
      if (op.pathParams.length > 0) continue // reported as web-only by verify
      const ret = op.response ? tsType(op.response) : 'unknown'
      const name = `${typeIdent(op.id)}Data`
      f.line()
      f.doc(
        `Fetches \`${endpointSpec(op)}\` and renders it through \`children\`.`,
        '',
        'The `useQuery` call sits directly in the component body, in the same',
        'file as its client and endpoint — the one arrangement PMTC lowers to',
        'PyreonQuery. Moving it into a hook silently breaks the native build.',
      )
      f.line(`export function ${name}(props: { children: (data: ${ret} | undefined) => unknown }) {`)
      f.line(`  const q = useQuery<${ret}>(() => ${op.id}.query())`)
      // `q.data` is a SIGNAL; passing it uncalled hands the child a function.
      f.line('  return props.children(q.data())')
      f.line('}')
    }
    files.push(f)
  }
  return files
}

function collectRefs(type: IrType | undefined, into: Set<string>): void {
  if (!type) return
  switch (type.kind) {
    case 'ref':
      into.add(type.name)
      return
    case 'array':
      collectRefs(type.items, into)
      return
    case 'union':
      for (const o of type.options) collectRefs(o, into)
      return
    case 'object':
      for (const f of type.fields) collectRefs(f.type, into)
      if (type.additional) collectRefs(type.additional, into)
      return
    default:
  }
}

/** Filename-safe tag. */
export function tagFile(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default'
}

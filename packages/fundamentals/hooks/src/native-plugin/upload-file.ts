// How `await fileFromUri(uri, { name, type })` crosses to native: a file to UPLOAD, resolved from the URI a picker or
// the camera handed back, and streamed from disk when a request carrying it is sent.
//
//   Swift   → `try await PyreonUploadFile.from(uri, name: …, type: …)` (async: it checks the file exists)
//   Kotlin  → `PyreonUploadFiles.from(pyreonContext, uri, name = …, type = …)` (a `content://` URI needs the app's
//             ContentResolver, so the composable's `LocalContext.current` is hoisted and passed)
//
// On the web it is a Promise that rejects when the URI cannot be read, so it is FALLIBLE natively too
// (`ExprEmitter.throws`): awaited in an async handler, a failure ends the handler and is reported.
//
// Only an AWAITED call lowers. Without `await` the web value is a Promise, and a Promise in a multipart field or a
// request body is sent as `[object Promise]` — it is named instead of being emitted as something that cannot
// compile (the scan records which calls are awaited; an ESTree node has no parent pointer).

import {
  readObjectProp,
  unwrapTypeLayers,
  type CallExprRecognizer,
  type ExprEmitter,
  type ModuleScan,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const UPLOAD_FILE_TYPE = 'upload-file'

const AWAITED_KEY = '@pyreon/hooks:file-from-uri-awaited'

const awaitedCalls = (source: { fileState<T>(key: string, init: () => T): T }): WeakSet<object> =>
  source.fileState<WeakSet<object>>(AWAITED_KEY, () => new WeakSet())

/** The local names `fileFromUri` is imported as from `@pyreon/hooks`. */
function localNames(program: AnyNode): Set<string> {
  const out = new Set<string>()
  for (const node of (program.body as AnyNode[] | undefined) ?? []) {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== '@pyreon/hooks') continue
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      const imported = spec.imported?.name ?? spec.imported?.value
      if (spec.type === 'ImportSpecifier' && imported === 'fileFromUri' && spec.local?.name) out.add(spec.local.name)
    }
  }
  return out
}

/** `scanModule` half: every `await fileFromUri(…)` call node. */
export function scanFileFromUri(scan: ModuleScan): void {
  const names = localNames(scan.program as AnyNode)
  if (names.size === 0) return
  const awaited = awaitedCalls(scan)
  const visit = (node: AnyNode): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'AwaitExpression') {
      const call = unwrapTypeLayers(node.argument as AnyNode) as AnyNode
      if (call?.type === 'CallExpression' && call.callee?.type === 'Identifier' && names.has(call.callee.name)) {
        awaited.add(call)
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
      const value = node[key]
      if (value !== null && typeof value === 'object') visit(value)
    }
  }
  visit((scan.program as AnyNode).body)
}

/** `fileFromUri(uri, options?)` where the callee is this package's export. */
export const recognizeFileFromUri: CallExprRecognizer = (site, ctx) => {
  const callee = site.callee as AnyNode
  if (callee?.type !== 'Identifier' || site.construct === true) return undefined
  const binding = ctx.binding(callee.name as string)
  if (binding?.kind !== 'import' || binding.module !== '@pyreon/hooks' || binding.name !== 'fileFromUri') return undefined
  if (!awaitedCalls(ctx).has(site.node)) {
    return ctx.unsupported(
      site.node,
      '`fileFromUri(…)` without `await`',
      'it returns a Promise on the web, and a Promise in a request body is sent as text. Await it inside an async handler: `multipart: { file: await fileFromUri(uri) }`',
    )
  }
  const uri = site.args[0] as AnyNode | undefined
  if (uri === undefined) return ctx.unsupported(site.node, '`fileFromUri()` with no URI', 'pass the URI a picker resolved')
  const opts = site.args[1] as AnyNode | undefined
  if (opts !== undefined && opts.type !== 'ObjectExpression') {
    return ctx.unsupported(site.node, '`fileFromUri(uri, options)` with non-literal options', 'write the options as `{ name, type }`')
  }
  const args = [ctx.expr(uri)]
  const name = readObjectProp(opts, 'name') as AnyNode | undefined
  const type = readObjectProp(opts, 'type') as AnyNode | undefined
  if (name !== undefined) args.push(ctx.expr(name))
  if (type !== undefined) args.push(ctx.expr(type))
  return {
    type: UPLOAD_FILE_TYPE,
    payload: { hasName: name !== undefined, hasType: type !== undefined } as never,
    args,
  }
}

const UPLOAD_FILE: TypeIR = { kind: 'typeRef', name: 'PyreonUploadFile', args: [] }

export const uploadFileExpr: ExprEmitter = {
  // A URI that names no readable file rejects on the web; the core writes `try await` and wraps the handler.
  throws: true,
  swift(e, ctx) {
    const p = e.payload as unknown as { hasName: boolean; hasType: boolean }
    const parts = [ctx.expr(e.args[0]!, 0)]
    let i = 1
    if (p.hasName) parts.push(`name: ${ctx.expr(e.args[i++]!, 0)}`)
    if (p.hasType) parts.push(`type: ${ctx.expr(e.args[i++]!, 0)}`)
    return `PyreonUploadFile.from(${parts.join(', ')})`
  },
  kotlin(e, ctx) {
    const p = e.payload as unknown as { hasName: boolean; hasType: boolean }
    const parts = [ctx.androidContext(), ctx.expr(e.args[0]!, 0)]
    let i = 1
    if (p.hasName) parts.push(`name = ${ctx.expr(e.args[i++]!, 0)}`)
    if (p.hasType) parts.push(`type = ${ctx.expr(e.args[i++]!, 0)}`)
    return `PyreonUploadFiles.from(${parts.join(', ')})`
  },
  typing: { type: () => UPLOAD_FILE },
}

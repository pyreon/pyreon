/**
 * Streaming responses — `<op>Stream` and `use<Op>Stream`.
 *
 * Built ON the endpoint seam, not beside it: the stream declares an endpoint
 * with `responseType: 'stream'` (every generated client supports that and
 * hands back the raw body) and `@pyreon/http/stream` parses the wire format
 * from there. So one emitter serves every client — `pyreon`, `fetch`, `axios`
 * and `ky` — and the request still goes through the client's middleware,
 * interceptors, auth and mock transport exactly like any other call.
 *
 * The cost of that choice is honest and small: a project on axios or ky that
 * has streaming operations gains a dependency on `@pyreon/http` (the
 * zero-dependency `/stream` subpath only). A project with no streams gains
 * nothing — nothing here is emitted without one.
 */
import type { IrDocument, IrOperation, IrStream } from '../core/ir'
import { responseKindOf } from '../core/media'
import { typeIdent } from '../core/naming'
import type { ClientName } from './client-runtime'
import { PURE, schemaExpr, schemaRefs, schemaSpecifierFor } from './schema'
import { dialectOf, type ValidatorName } from './validator'
import { q, relativeSpecifier, type SourceFile } from './writer'

/** The generated stream function's name. */
export function streamName(op: IrOperation): string {
  return `${op.id}Stream`
}

/** The generated stream hook's name. */
export function streamHookName(op: IrOperation): string {
  return `use${typeIdent(op.id)}Stream`
}

/** Does anything in this document stream? Gates every emission below. */
export function hasStreams(doc: IrDocument): boolean {
  return doc.operations.some((o) => o.stream !== undefined)
}

/**
 * An operation whose ONLY 2xx body is a stream. Its plain endpoint resolves to
 * a raw `ReadableStream`, which is useless in a query cache (a one-shot body,
 * re-read on refetch) — so it gets a stream hook INSTEAD of `useQuery` /
 * `useMutation`, and the stream reuses its endpoint rather than declaring a
 * second one.
 */
export function isStreamOnly(op: IrOperation): boolean {
  return op.stream !== undefined && responseKindOf(op) === 'stream'
}

/**
 * Is the event payload worth a `parse` step? SSE text data is a raw string,
 * and an undeclared type has nothing to validate against.
 */
function parsesEvent(s: IrStream): boolean {
  return s.event.kind !== 'unknown' && !(s.format === 'sse' && s.data === 'text')
}

/**
 * The client-side `streamEvent(schema)` helper, appended to `client.ts`.
 *
 * It lives in the CLIENT because that is where `configureApi({ validate })`
 * lives: a streamed event is a response, and `'warn'` / `'off'` must mean the
 * same for it as for a JSON body — including `'warn'` degrading instead of
 * killing a long-lived stream over one drifted field.
 */
export function streamEventHelper(client: ClientName): string[] {
  const doc = [
    '/**',
    ' * Validate one streamed event against its schema — what every generated',
    ' * `<op>Stream` passes as `parse`. Honours `configureApi({ validate })`',
    ' * exactly as a JSON response does.',
    ' */',
  ]
  if (client === 'pyreon') {
    return [
      ...doc,
      'export function streamEvent<V>(schema: V): (value: unknown) => ResponseOf<V> {',
      '  const parse = standardSchema(schema)',
      '  return (value) => {',
      "    if (settings.validate === 'off' || !parse) return value as ResponseOf<V>",
      '    try {',
      '      return parse(value) as ResponseOf<V>',
      '    } catch (cause) {',
      "      if (settings.validate !== 'warn') throw cause",
      '      // Not dev-gated: `warn` exists to keep a drifting backend visible in production.',
      '      console.warn(`[Pyreon] a streamed event did not match its schema (validate: "warn"): ${cause instanceof Error ? cause.message : String(cause)}`)',
      '      return value as ResponseOf<V>',
      '    }',
      '  }',
      '}',
    ]
  }
  return [
    ...doc,
    'export function streamEvent<V>(schema: V): (value: unknown) => Promise<Infer<V>> {',
    '  return (value) => validateResponse(schema, value, settings.validate) as Promise<Infer<V>>',
    '}',
  ]
}

export interface StreamEmitOptions {
  /** The file being written — for relative import specifiers. */
  path: string
  doc: IrDocument
  validator: ValidatorName
  /** The spec literal, `<generics>` and `, { config }` of a `responseType: 'stream'` endpoint. */
  streamDecl: (op: IrOperation) => { spec: string; generics: string; config: string }
}

/** Emit `<op>Stream` for every streaming operation in one endpoints module. */
export function emitStreamFunctions(f: SourceFile, ops: readonly IrOperation[], opts: StreamEmitOptions): void {
  const streaming = ops.filter((o) => o.stream !== undefined)
  if (streaming.length === 0) return
  const formats = new Set(streaming.map((o) => (o.stream as IrStream).format))
  const helpers = ['streamHeaders']
  if (formats.has('sse')) helpers.push('openEventStream')
  if (formats.has('ndjson')) helpers.push('openNdjsonStream')
  f.import('@pyreon/http/stream', ...helpers.sort())
  const optionTypes: string[] = []
  if (formats.has('sse')) optionTypes.push('EventStreamOptions')
  if (formats.has('ndjson')) optionTypes.push('NdjsonStreamOptions')
  f.importType('@pyreon/http/stream', ...optionTypes)
  if (streaming.some((o) => parsesEvent(o.stream as IrStream))) {
    f.import(relativeSpecifier(opts.path, 'client.ts'), 'streamEvent')
  }
  const refs = new Set<string>()
  for (const op of streaming) {
    const st = op.stream as IrStream
    if (parsesEvent(st)) schemaRefs(st.event, refs)
  }
  for (const name of [...refs].sort()) f.import(schemaSpecifierFor(opts.path, name, opts.doc), name)
  // An inline event type is a composite schema expression over the binding.
  if (streaming.some((o) => parsesEvent(o.stream as IrStream) && (o.stream as IrStream).event.kind !== 'ref')) {
    const dialect = dialectOf(opts.validator)
    f.import(dialect.module, dialect.binding)
  }

  for (const op of streaming) {
    const s = op.stream as IrStream
    const name = streamName(op)
    let endpoint = op.id
    f.line()
    if (!isStreamOnly(op)) {
      // The JSON endpoint decodes JSON; the stream needs the raw body, so it
      // gets its own declaration. Not exported: `<op>Stream` is the API.
      endpoint = `${op.id}$stream`
      const d = opts.streamDecl(op)
      f.line(`const ${endpoint} = ${PURE}api.endpoint${d.generics}(${q(d.spec)}${d.config})`)
    }
    let parse = ''
    if (parsesEvent(s)) {
      if (s.event.kind === 'ref') {
        parse = `parse: streamEvent(${s.event.name}), `
      } else {
        const binding = `${op.id}$event`
        f.line(`const ${binding} = ${schemaExpr(s.event, { native: false, validator: opts.validator })}`)
        parse = `parse: streamEvent(${binding}), `
      }
    }
    if (endpoint !== op.id || parse.includes('$event')) f.line()
    const get = op.method === 'GET'
    const described =
      s.format === 'sse' && s.data === 'text'
        ? '`string` (the raw `data`)'
        : s.event.kind === 'ref'
          ? `\`${s.event.name}\``
          : s.event.kind === 'unknown'
            ? '`unknown` (no event type declared)'
            : 'its declared type'
    f.doc(
      op.summary,
      `\`${op.method} ${op.path}\` as a stream of \`${s.media}\` ${s.format === 'sse' ? 'events' : 'lines'}, each ${
        parsesEvent(s) ? 'validated against' : 'typed as'
      } ${described}.`,
      '',
      'Iterate it with `for await`. `break`, `.close()` or the `signal` in `args`',
      'cancel the request and close the connection.',
      s.format === 'ndjson'
        ? 'NDJSON has no resume id, so a failure ends the stream with the error.'
        : get
          ? 'A dropped connection is retried with backoff, resuming with `Last-Event-ID`.'
          : 'NOT reconnected by default: repeating a `' +
            op.method +
            '` would repeat its effect. Pass `reconnect` if the server makes it safe.',
      '',
      '```ts',
      `for await (const ${s.format === 'sse' ? 'ev' : 'row'} of ${name}(${argsHint(op)})) {`,
      s.format === 'sse' ? '  console.log(ev.type, ev.data)' : '  console.log(row)',
      '}',
      '```',
    )
    const optional = !inputRequired(op)
    const argsType = `Parameters<typeof ${endpoint}>[0]`
    const optsType =
      s.format === 'sse'
        ? `Omit<EventStreamOptions<never>, 'parse' | 'data'>`
        : `Omit<NdjsonStreamOptions<never>, 'parse'>`
    f.line(`export function ${name}(args${optional ? '?' : ''}: ${argsType}, options?: ${optsType}) {`)
    f.line(
      optional
        ? `  const { signal, headers, ...rest }: NonNullable<${argsType}> = args ?? {}`
        : '  const { signal, headers, ...rest } = args',
    )
    const open = s.format === 'sse' ? 'openEventStream' : 'openNdjsonStream'
    const reconnect = s.format === 'sse' && !get ? 'reconnect: false, ' : ''
    const data = s.format === 'sse' && s.data === 'text' ? "data: 'text', " : ''
    f.line(`  return ${open}(`)
    // `accept` names the spec's own media type when it is not the default
    // (`application/jsonl`, …) — a server negotiating on it must see its own.
    const defaultAccept = s.format === 'sse' ? 'text/event-stream' : 'application/x-ndjson'
    const extra = s.media === defaultAccept ? 'ctx.headers' : `{ ...ctx.headers, accept: ${q(s.media)} }`
    f.line(`    (ctx) => ${endpoint}({ ...rest, signal: ctx.signal, headers: streamHeaders(headers, ${extra}) }),`)
    f.line(`    { ${parse}${data}${reconnect}signal, ...options },`)
    f.line('  )')
    f.line('}')
  }
}

/** Does a call need `args` at all — a path parameter, a required query/header/cookie, a required body? */
export function inputRequired(op: IrOperation): boolean {
  if (op.pathParams.length > 0) return true
  if ([...op.queryParams, ...op.headerParams, ...op.cookieParams].some((p) => p.required)) return true
  return op.body?.required === true
}

function argsHint(op: IrOperation): string {
  if (op.pathParams.length > 0) {
    return `{ params: { ${op.pathParams.map((p) => `${p.name}: …`).join(', ')} } }`
  }
  if (op.body?.required) return '{ json: … }'
  return ''
}

/**
 * Does `use<Op>Stream` take an `args` accessor? Whenever the call has ANY
 * input — an optional query is still something a signal can drive.
 */
export function streamHookTakesArgs(op: IrOperation): boolean {
  return (
    inputRequired(op) ||
    op.queryParams.length > 0 ||
    op.headerParams.length > 0 ||
    op.cookieParams.length > 0 ||
    op.body !== undefined
  )
}

/** `use<Op>Stream` in a queries module. */
export function emitStreamHook(f: SourceFile, op: IrOperation): void {
  const name = streamName(op)
  const hook = streamHookName(op)
  const item = `StreamItem<ReturnType<typeof ${name}>>`
  const opts = `UseStreamOptions<${item}> & { stream?: Parameters<typeof ${name}>[1] }`
  f.line()
  f.doc(
    op.summary,
    `\`${op.method} ${op.path}\` as a live stream — \`events()\`, \`latest()\`, \`status()\` and \`error()\` are signals.`,
    '',
    streamHookTakesArgs(op)
      ? 'Takes an ACCESSOR: a signal read in `args` re-opens the stream when it changes; return `undefined` to hold it closed.'
      : undefined,
    'The request is cancelled on unmount. `abort()` stops it; `restart()` opens a fresh one.',
    '`options.stream` passes through to the stream (`reconnect`, `events`, `lastEventId`).',
  )
  if (streamHookTakesArgs(op)) {
    f.line(`export function ${hook}(`)
    f.line(`  args: () => Parameters<typeof ${name}>[0] | undefined,`)
    f.line(`  options?: ${opts},`)
    f.line(') {')
    f.line('  return useStream((ctx) => {')
    f.line('    const a = args()')
    f.line('    if (a === undefined) return undefined')
    f.line(`    return ${name}(a, { ...options?.stream, signal: ctx.signal, onStatus: ctx.onStatus })`)
    f.line('  }, options)')
  } else {
    f.line(`export function ${hook}(options?: ${opts}) {`)
    f.line('  return useStream(')
    f.line(`    (ctx) => ${name}(undefined, { ...options?.stream, signal: ctx.signal, onStatus: ctx.onStatus }),`)
    f.line('    options,')
    f.line('  )')
  }
  f.line('}')
}

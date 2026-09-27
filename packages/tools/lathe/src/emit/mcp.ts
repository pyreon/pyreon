/**
 * `mcp.ts` — every operation as a Model Context Protocol TOOL definition.
 *
 * An agent that should be able to call the API (a support bot looking up an
 * order, an ops assistant restarting a job) needs each operation described in
 * the one vocabulary MCP speaks: a name, a description, and a JSON Schema for
 * its input. The spec already says all of it; this plugin writes it down, and
 * pairs each definition with a `call` that runs the GENERATED endpoint — so a
 * tool call goes through the same client, auth, middleware and validation as
 * every other call in the app.
 *
 * Framework-agnostic on purpose: the output is plain data plus a function, not
 * an `@modelcontextprotocol/sdk` import. Registering them is four lines against
 * whichever server library the app already uses (see the emitted JSDoc), and
 * the generated client gains no dependency.
 *
 * ## What is NOT a tool
 *
 * - A stream-only operation: a tool call is request/response, and truncating a
 *   stream into one result would be a guess about where to stop.
 * - A body the model cannot write as JSON (`multipart`, raw `text`/`binary`):
 *   a JSON Schema for "a file" is a promise the tool cannot keep.
 * - A name MCP rejects (longer than 64 characters).
 *
 * Each exclusion is listed in the file's header, with its reason, so a missing
 * tool is never a mystery.
 */
import type { IrDocument, IrOperation, IrType } from '../core/ir'
import { byTag, endpointSpec, isMutation, tagFile } from './client'
import { isStreamOnly } from './stream'
import { jsonLiteral, relativeSpecifier, SourceFile } from './writer'

export const MCP_FILE = 'mcp.ts'

type JsonSchema = Record<string, unknown>

/**
 * An IR type as JSON Schema (2020-12 subset MCP clients accept). Models become
 * `$ref`s into `$defs`, collected transitively into `defs` so each tool's
 * schema is self-contained — a client resolves `$ref` only within the schema
 * it was handed.
 */
export function toJsonSchema(type: IrType, models: ReadonlyMap<string, IrType>, defs: Map<string, JsonSchema>): JsonSchema {
  switch (type.kind) {
    case 'string': {
      const out: JsonSchema = { type: 'string' }
      if (type.format !== undefined && type.format !== 'binary') out.format = type.format
      if (type.minLength !== undefined) out.minLength = type.minLength
      if (type.maxLength !== undefined) out.maxLength = type.maxLength
      if (type.pattern !== undefined) out.pattern = type.pattern
      return out
    }
    case 'number': {
      const out: JsonSchema = { type: type.integer ? 'integer' : 'number' }
      if (type.minimum !== undefined) out.minimum = type.minimum
      if (type.maximum !== undefined) out.maximum = type.maximum
      if (type.exclusiveMinimum !== undefined) out.exclusiveMinimum = type.exclusiveMinimum
      if (type.exclusiveMaximum !== undefined) out.exclusiveMaximum = type.exclusiveMaximum
      if (type.multipleOf !== undefined) out.multipleOf = type.multipleOf
      return out
    }
    case 'boolean':
      return { type: 'boolean' }
    case 'null':
      return { type: 'null' }
    case 'enum':
      return { enum: [...type.values] }
    case 'unknown':
      return {}
    case 'array': {
      const out: JsonSchema = { type: 'array', items: toJsonSchema(type.items, models, defs) }
      if (type.minItems !== undefined) out.minItems = type.minItems
      if (type.maxItems !== undefined) out.maxItems = type.maxItems
      if (type.uniqueItems) out.uniqueItems = true
      return out
    }
    case 'object': {
      const properties: Record<string, JsonSchema> = {}
      for (const f of type.fields) {
        const s = toJsonSchema(f.type, models, defs)
        properties[f.name] = f.doc ? { ...s, description: f.doc } : s
      }
      const out: JsonSchema = { type: 'object', properties }
      const required = type.fields.filter((f) => f.required).map((f) => f.name)
      if (required.length > 0) out.required = required
      if (type.additional !== undefined) out.additionalProperties = toJsonSchema(type.additional, models, defs)
      return out
    }
    case 'ref': {
      if (!defs.has(type.name)) {
        // Reserve before recursing: a self-referential model terminates here.
        defs.set(type.name, {})
        const target = models.get(type.name)
        defs.set(type.name, target ? toJsonSchema(target, models, defs) : {})
      }
      return { $ref: `#/$defs/${type.name}` }
    }
    case 'union':
      return { anyOf: type.options.map((o) => toJsonSchema(o, models, defs)) }
    case 'nullable':
      return { anyOf: [toJsonSchema(type.inner, models, defs), { type: 'null' }] }
  }
}

/** Why an operation is not a tool, or `undefined` when it is one. */
export function toolExclusion(op: IrOperation): string | undefined {
  if (isStreamOnly(op)) return 'streams its response — a tool call is request/response'
  if (op.body && op.body.encoding !== 'json' && op.body.encoding !== 'form') {
    return `its ${op.body.encoding} body cannot be written as JSON by a model`
  }
  if (op.id.length > 64) return 'its name is longer than the 64 characters MCP allows'
  return undefined
}

/** The JSON Schema of an operation's call arguments — the generated endpoint's own input shape. */
export function toolInputSchema(op: IrOperation, models: ReadonlyMap<string, IrType>): JsonSchema {
  const defs = new Map<string, JsonSchema>()
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  const group = (key: string, params: IrOperation['pathParams'], allRequired = false): void => {
    if (params.length === 0) return
    const props: Record<string, JsonSchema> = {}
    for (const p of params) {
      const s = toJsonSchema(p.type, models, defs)
      props[p.name] = p.doc ? { ...s, description: p.doc } : s
    }
    const req = params.filter((p) => allRequired || p.required).map((p) => p.name)
    properties[key] = req.length > 0 ? { type: 'object', properties: props, required: req } : { type: 'object', properties: props }
    if (req.length > 0) required.push(key)
  }
  group('params', op.pathParams, true)
  group('query', op.queryParams)
  group('headers', op.headerParams)
  group('cookies', op.cookieParams)
  if (op.body) {
    const key = op.body.encoding === 'json' ? 'json' : 'form'
    properties[key] = toJsonSchema(op.body.type, models, defs)
    if (op.body.required) required.push(key)
  }
  const out: JsonSchema = { type: 'object', properties }
  if (required.length > 0) out.required = required
  out.additionalProperties = false
  if (defs.size > 0) out.$defs = Object.fromEntries([...defs].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
  return out
}

export function emitMcpTools(doc: IrDocument): SourceFile {
  const f = new SourceFile(MCP_FILE)
  const models = new Map(doc.models.map((m) => [m.name, m.type]))
  const tools: IrOperation[] = []
  const skipped: string[] = []
  for (const [tag, ops] of byTag(doc)) {
    const included = ops.filter((op) => {
      const why = toolExclusion(op)
      if (why) skipped.push(`\`${op.id}\` — ${why}`)
      return why === undefined
    })
    if (included.length > 0) {
      f.import(relativeSpecifier(MCP_FILE, `endpoints/${tagFile(tag)}.ts`), ...included.map((o) => o.id))
      tools.push(...included)
    }
  }
  tools.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  f.line()
  f.doc(
    'One Model Context Protocol tool definition — plain data plus the call that',
    'runs it through the generated client.',
  )
  f.line('export interface ApiTool {')
  f.line('  /** The generated operation name — unique, and a valid MCP tool name. */')
  f.line('  name: string')
  f.line('  description: string')
  f.line('  /** JSON Schema of the call arguments — exactly the endpoint\'s own input shape. */')
  f.line('  inputSchema: Record<string, unknown>')
  f.line('  /** MCP tool annotations, from the HTTP method\'s semantics. */')
  f.line('  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean }')
  f.line('  /**')
  f.line('   * Run the operation. `input` comes from a model, so it is only as good as the')
  f.line('   * model: the schema above told it the shape, and the API validates what arrives.')
  f.line('   */')
  f.line('  call(input: unknown): Promise<unknown>')
  f.line('}')
  f.line()
  f.doc(
    `Every ${doc.title} operation a model can call, as MCP tools.`,
    skipped.length > 0 ? '' : undefined,
    skipped.length > 0 ? 'Not tools (see `toolExclusion` in @pyreon/lathe):' : undefined,
    ...skipped.map((s) => `- ${s}`),
    '',
    'Register them with the low-level server of `@modelcontextprotocol/sdk`:',
    '',
    '```ts',
    "import { tools } from './gen/mcp'",
    '',
    'server.setRequestHandler(ListToolsRequestSchema, () => ({',
    '  tools: tools.map(({ call, ...definition }) => definition),',
    '}))',
    'server.setRequestHandler(CallToolRequestSchema, async (req) => {',
    '  const tool = tools.find((t) => t.name === req.params.name)',
    "  if (!tool) throw new Error(`unknown tool ${req.params.name}`)",
    "  const result = await tool.call(req.params.arguments ?? {})",
    "  return { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] }",
    '})',
    '```',
  )
  f.line('export const tools: readonly ApiTool[] = [')
  for (const op of tools) {
    const description = [op.summary, `\`${endpointSpec(op)}\``].filter(Boolean).join(' — ')
    const readOnly = !isMutation(op)
    const idempotent = readOnly || op.method === 'PUT' || op.method === 'DELETE'
    f.line('  {')
    f.line(`    name: ${jsonLiteral(op.id)},`)
    f.line(`    description: ${jsonLiteral(description)},`)
    f.line(`    inputSchema: ${jsonLiteral(toolInputSchema(op, models), 2).replace(/\n/g, '\n    ')},`)
    f.line(
      `    annotations: { readOnlyHint: ${readOnly}, destructiveHint: ${op.method === 'DELETE'}, idempotentHint: ${idempotent} },`,
    )
    // The one cast in this file, and a deliberate one: the argument is
    // UNTRUSTED model output. Its shape was advertised by `inputSchema`, and
    // the API is the authority on whether it is valid.
    f.line(`    call: (input) => ${op.id}(input as Parameters<typeof ${op.id}>[0]),`)
    f.line('  },')
  }
  f.line(']')
  f.line()
  f.doc('Look a tool up by name — `undefined` for a name the model invented.')
  f.line('export function findTool(name: string): ApiTool | undefined {')
  f.line('  return tools.find((t) => t.name === name)')
  f.line('}')
  return f
}

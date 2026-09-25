/**
 * Multi-file specs: resolve `$ref`s that point into OTHER documents and bundle
 * them into one, before the document reaches the IR.
 *
 * Large APIs are rarely written as one file. DigitalOcean's description is
 * ~3,000 YAML files (`$ref: '../../shared/responses/not_found.yml'`), and
 * every enterprise spec split with Redocly or Stoplight has the same shape.
 * Lathe used to read one document and type every cross-file `$ref` as
 * `unknown`, so such a spec generated a client of nothing.
 *
 * ## What a bundle looks like
 *
 * The rule that decides everything is WHERE a reference sits:
 *
 *  - In a SCHEMA position (a property, an array item, an `allOf` member, a
 *    component schema, a media type's `schema`, …) the target is HOISTED into
 *    the root's `components.schemas` (`definitions` for Swagger 2) under a
 *    name derived from the target -- its pointer's last segment, or the file's
 *    basename -- and the reference becomes a local one. A schema is a MODEL:
 *    it needs a name, and two references to the same file must end up at the
 *    same model rather than two copies. Registering the name BEFORE converting
 *    the target is what lets a cycle across files close through a local
 *    `$ref`, exactly like a cycle inside one document.
 *  - A root component that is itself only a reference to another file
 *    (`components.schemas.Droplet: { $ref: models/droplet.yml }`) ADOPTS the
 *    target under its own name, rather than becoming an alias of a hoisted
 *    copy.
 *  - Anywhere else (a path item, an operation, a parameter, a response, a
 *    header map, a description string) the target is INLINED. Lathe resolves
 *    those structures through `$ref` itself and never names them, so a copy is
 *    the whole of what is needed. An inline cycle (a path item that includes
 *    itself) cannot be expanded and is reported.
 *
 * Names are stable: they come from the target, not from the order files were
 * read, and a collision takes the next free numeric suffix in DOCUMENT order
 * (the root is walked in its own key order, which is the author's).
 *
 * Values in DATA positions -- `example`, `examples`, `default`, `enum`,
 * `const` -- are copied untouched: an example payload may legitimately
 * contain a key named `$ref`.
 *
 * Reading documents is the caller's job ({@link collectDocuments} takes a
 * reader), which is what lets `generate` stay synchronous and offline -- it
 * reads files -- while `lathe pull` fetches remote documents with the same
 * auth headers and ETag cache as the root.
 */
import type { IrNote } from '../core/ir'

type Json = Record<string, unknown>

/** A document's identity: a normalized file path, or an absolute http(s) URL. */
export type DocId = string

/** Every document a bundle was built from, root first. */
export interface BundleResult {
  doc: Json
  notes: IrNote[]
  /** The documents that contributed, root first (for a file watcher). */
  documents: DocId[]
}

const HTTP = /^https?:\/\//i

/** Whether a document id is remote (fetched, not read from disk). */
export function isRemote(id: DocId): boolean {
  return HTTP.test(id)
}

/**
 * Resolve a reference's document part against the document it appears in.
 * Paths are normalized (`a/../b` -> `b`) so two spellings of one file are one
 * document.
 */
export function resolveDocId(base: DocId, rel: string): DocId {
  if (rel === '') return base
  if (HTTP.test(rel)) return rel
  if (HTTP.test(base)) return new URL(rel, base).href
  if (/^file:\/\//i.test(rel)) return decodeURIComponent(rel.replace(/^file:\/\//i, ''))
  const absolute = rel.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rel)
  const dir = base.slice(0, Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\')) + 1)
  return normalizePath(absolute ? rel : dir + rel)
}

function normalizePath(p: string): string {
  const sep = p.includes('\\') && !p.includes('/') ? '\\' : '/'
  const parts = p.split(/[\\/]/)
  const out: string[] = []
  for (const [i, part] of parts.entries()) {
    if (part === '.' || (part === '' && i > 0 && i < parts.length - 1)) continue
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..' && out[out.length - 1] !== '') out.pop()
    else out.push(part)
  }
  return out.join(sep)
}

/** A `$ref` split into its document and its (decoded) JSON pointer. */
function splitRef(ref: string, base: DocId): { doc: DocId; pointer: string } {
  const hash = ref.indexOf('#')
  const docPart = hash === -1 ? ref : ref.slice(0, hash)
  const fragment = hash === -1 ? '' : ref.slice(hash + 1)
  let pointer = fragment
  try {
    pointer = decodeURIComponent(fragment)
  } catch {
    // A malformed percent-escape stays literal; the lookup then reports it.
  }
  return { doc: resolveDocId(base, docPart), pointer }
}

/**
 * Keys whose values are DATA in a schema, parameter or media position.
 * `default` and `examples` are data there and STRUCTURE elsewhere (a
 * `responses.default` response, a `components.examples` map), so the kind
 * of the enclosing node decides -- see {@link childKind}.
 */
const DATA_KEYS = new Set(['example', 'examples', 'default', 'enum', 'const'])

/**
 * The keys the document SCAN never enters. Narrower than {@link DATA_KEYS} on
 * purpose: the scan has no context, and reading one file too many costs a
 * read, where missing one costs every `$ref` into it.
 */
const NEVER_STRUCTURE = new Set(['example', 'enum', 'const'])

/**
 * The OTHER documents `doc` references, as absolute ids. Only structure is
 * scanned: a `$ref` inside an example payload is data.
 */
export function referencedDocuments(doc: unknown, self: DocId): DocId[] {
  const out = new Set<DocId>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n)
      return
    }
    const o = obj(node)
    if (!o) return
    for (const [k, v] of Object.entries(o)) {
      if (k === '$ref' && typeof v === 'string') {
        const { doc: target } = splitRef(v, self)
        if (target !== self) out.add(target)
      } else if (k === 'discriminator') {
        for (const m of Object.values(obj(obj(v)?.mapping) ?? {})) {
          if (typeof m !== 'string' || m.startsWith('#') || !/[./]/.test(m)) continue
          const { doc: target } = splitRef(m, self)
          if (target !== self) out.add(target)
        }
      } else if (!NEVER_STRUCTURE.has(k)) {
        visit(v)
      }
    }
  }
  visit(doc)
  return [...out]
}

/** The outcome of reading one referenced document. */
export type ReadOutcome = { doc: unknown } | { error: string }

/**
 * Read the root's reference closure, synchronously, with `read`. A document
 * that cannot be read is recorded as a failure (and reported by
 * {@link bundle}) rather than thrown, so one missing file costs the refs into
 * it and not the whole generation.
 */
export function collectDocuments(root: unknown, rootId: DocId, read: (id: DocId) => ReadOutcome): Map<DocId, ReadOutcome> {
  const docs = new Map<DocId, ReadOutcome>([[rootId, { doc: root }]])
  const queue = referencedDocuments(root, rootId)
  while (queue.length > 0) {
    const id = queue.shift() as DocId
    if (docs.has(id)) continue
    const outcome = read(id)
    docs.set(id, outcome)
    if ('doc' in outcome) queue.push(...referencedDocuments(outcome.doc, id))
  }
  return docs
}

/** {@link collectDocuments}, with an asynchronous reader (remote documents). */
export async function collectDocumentsAsync(
  root: unknown,
  rootId: DocId,
  read: (id: DocId) => Promise<ReadOutcome>,
): Promise<Map<DocId, ReadOutcome>> {
  const docs = new Map<DocId, ReadOutcome>([[rootId, { doc: root }]])
  const queue = referencedDocuments(root, rootId)
  while (queue.length > 0) {
    const id = queue.shift() as DocId
    if (docs.has(id)) continue
    const outcome = await read(id)
    docs.set(id, outcome)
    if ('doc' in outcome) queue.push(...referencedDocuments(outcome.doc, id))
  }
  return docs
}

/** Where a node sits, which decides what a `$ref` in it means. */
type Kind =
  | 'root'
  | 'paths'
  | 'pathItem'
  | 'operation'
  | 'parameterList'
  | 'parameterMap'
  | 'parameter'
  | 'requestBody'
  | 'requestBodyMap'
  | 'responses'
  | 'response'
  | 'content'
  | 'media'
  | 'headerMap'
  | 'callbackMap'
  | 'components'
  | 'schemaMap'
  | 'schemaList'
  | 'schema'
  | 'other'
  | 'data'

const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])
const SCHEMA_CHILDREN = new Set([
  'items',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
  'additionalItems',
])
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'])
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])

/** Kinds in which a {@link DATA_KEYS} key holds a value rather than structure. */
const DATA_HOLDERS = new Set<Kind>(['schema', 'parameter', 'media', 'other'])

function childKind(kind: Kind, key: string): Kind {
  if (DATA_KEYS.has(key) && DATA_HOLDERS.has(kind)) return 'data'
  switch (kind) {
    case 'root':
      if (key === 'paths') return 'paths'
      if (key === 'webhooks') return 'paths'
      if (key === 'components') return 'components'
      if (key === 'definitions') return 'schemaMap'
      if (key === 'parameters') return 'parameterMap'
      if (key === 'responses') return 'responses'
      return 'other'
    case 'paths':
      return 'pathItem'
    case 'pathItem':
      if (key === 'parameters') return 'parameterList'
      return METHODS.has(key) ? 'operation' : 'other'
    case 'operation':
      if (key === 'parameters') return 'parameterList'
      if (key === 'requestBody') return 'requestBody'
      if (key === 'responses') return 'responses'
      if (key === 'callbacks') return 'callbackMap'
      return 'other'
    case 'parameterList':
    case 'parameterMap':
      return 'parameter'
    case 'parameter':
      if (key === 'schema' || key === 'items') return 'schema'
      return key === 'content' ? 'content' : 'other'
    case 'requestBody':
      return key === 'content' ? 'content' : 'other'
    case 'requestBodyMap':
      return 'requestBody'
    case 'responses':
      return 'response'
    case 'response':
      if (key === 'content') return 'content'
      if (key === 'headers') return 'headerMap'
      // Swagger 2 keeps the response schema on the response itself.
      if (key === 'schema') return 'schema'
      return 'other'
    case 'content':
      return 'media'
    case 'media':
      return key === 'schema' ? 'schema' : 'other'
    case 'headerMap':
      return 'parameter'
    case 'callbackMap':
      return 'paths'
    case 'components':
      if (key === 'schemas') return 'schemaMap'
      if (key === 'parameters') return 'parameterMap'
      if (key === 'responses') return 'responses'
      if (key === 'requestBodies') return 'requestBodyMap'
      if (key === 'headers') return 'headerMap'
      if (key === 'pathItems') return 'paths'
      if (key === 'callbacks') return 'callbackMap'
      return 'other'
    case 'schemaMap':
    case 'schemaList':
      return 'schema'
    case 'schema':
      if (SCHEMA_MAPS.has(key)) return 'schemaMap'
      if (SCHEMA_LISTS.has(key)) return 'schemaList'
      if (SCHEMA_CHILDREN.has(key)) return 'schema'
      return 'other'
    default:
      return 'other'
  }
}

/**
 * Bundle `docs` (the root's reference closure, from {@link collectDocuments})
 * into one document whose every `$ref` is local.
 */
export function bundle(rootId: DocId, docs: ReadonlyMap<DocId, ReadOutcome>): BundleResult {
  const rootOutcome = docs.get(rootId)
  const root = rootOutcome && 'doc' in rootOutcome ? obj(rootOutcome.doc) : undefined
  if (!root) throw new Error(`[Pyreon] lathe: the root document ${rootId} did not parse to an object.`)
  const notes: IrNote[] = []
  const swagger2 = root.swagger !== undefined
  const sectionPath = swagger2 ? ['definitions'] : ['components', 'schemas']
  const sectionRef = `#/${sectionPath.join('/')}/`
  const rootSchemas = obj(swagger2 ? root.definitions : obj(root.components)?.schemas) ?? {}
  const taken = new Set(Object.keys(rootSchemas))
  const hoisted = new Map<string, string>()
  const added = new Map<string, unknown>()
  const inlining = new Set<string>()
  const used = new Set<DocId>([rootId])

  const label = (doc: DocId, path: readonly string[]): string =>
    `${doc === rootId ? '' : doc}#${path.length > 0 ? `/${path.map(escapeSeg).join('/')}` : ''}`

  const lookup = (doc: DocId, pointer: string, at: string, ref: string): { found: true; value: unknown } | { found: false } => {
    const outcome = docs.get(doc)
    if (!outcome || 'error' in outcome) {
      notes.push({
        code: 'unsupported-ref',
        at,
        message: `\`$ref\` \`${ref}\` points into ${doc}, which could not be read${outcome && 'error' in outcome ? `: ${outcome.error}` : ''} — typed as unknown.`,
      })
      return { found: false }
    }
    used.add(doc)
    let cur: unknown = outcome.doc
    if (pointer !== '' && pointer !== '/') {
      for (const seg of pointer.replace(/^\//, '').split('/')) {
        const key = seg.replace(/~1/g, '/').replace(/~0/g, '~')
        const next = Array.isArray(cur) ? cur[Number(key)] : obj(cur)?.[key]
        if (next === undefined) {
          notes.push({ code: 'unsupported-ref', at, message: `\`$ref\` \`${ref}\` does not resolve in ${doc}.` })
          return { found: false }
        }
        cur = next
      }
    }
    return { found: true, value: cur }
  }

  /**
   * A model name for a hoisted target: the pointer's last segment, else the
   * file's basename. A collision is disambiguated by the FILE first
   * (`pages_pagination`, as Redocly's bundler names it) -- a name derived from
   * the target, so it does not move when an unrelated file is added -- and
   * only then by a numeric suffix.
   */
  const nameFor = (doc: DocId, pointer: string): string => {
    const last = pointer.split('/').filter(Boolean).pop()?.replace(/~1/g, '/').replace(/~0/g, '~')
    // The query string first: `pet.json?v=2` names `pet`, not `pet.json`.
    const file = (doc.split('?')[0]?.split(/[\\/]/).pop() ?? '').replace(/\.(ya?ml|json)$/i, '')
    const candidates = [last ?? file, ...(last !== undefined && file ? [`${file}_${last}`] : [])].filter(Boolean)
    const base = candidates[0] ?? 'Schema'
    let name = candidates.find((c) => !taken.has(c)) ?? base
    for (let n = 2; taken.has(name); n++) name = `${base}${n}`
    taken.add(name)
    return name
  }

  const hoist = (target: { doc: DocId; pointer: string }, at: string, ref: string): string | undefined => {
    const key = `${target.doc}#${target.pointer}`
    const done = hoisted.get(key)
    if (done) return done
    // A target in the ROOT's own schema section keeps its name.
    if (target.doc === rootId) return `#${target.pointer}`
    const found = lookup(target.doc, target.pointer, at, ref)
    if (!found.found) return undefined
    const name = nameFor(target.doc, target.pointer)
    const local = `${sectionRef}${escapeSeg(name)}`
    // Registered BEFORE converting: a cycle back to this target closes on
    // `local` instead of recursing.
    hoisted.set(key, local)
    added.set(name, walk(found.value, target.doc, 'schema', [...pointerPath(target.pointer)]))
    return local
  }

  const walk = (node: unknown, doc: DocId, kind: Kind, path: string[]): unknown => {
    if (kind === 'data') return node
    if (Array.isArray(node)) {
      const elementKind: Kind = kind === 'schemaList' || kind === 'parameterList' ? childKind(kind, '') : kind === 'schema' ? 'schema' : 'other'
      return node.map((n, i) => walk(n, doc, elementKind, [...path, String(i)]))
    }
    const o = obj(node)
    if (!o) return node
    if (typeof o.$ref === 'string') return reference(o, doc, kind, path)
    const out: Json = {}
    for (const [k, v] of Object.entries(o)) {
      if (kind === 'schema' && k === 'discriminator') out[k] = discriminator(v, doc, path)
      else out[k] = walk(v, doc, childKind(kind, k), [...path, k])
    }
    return out
  }

  const siblingsOf = (o: Json, doc: DocId, kind: Kind, path: string[]): Json => {
    const rest: Json = {}
    for (const [k, v] of Object.entries(o)) if (k !== '$ref') rest[k] = walk(v, doc, childKind(kind, k), [...path, k])
    return rest
  }

  const reference = (o: Json, doc: DocId, kind: Kind, path: string[]): unknown => {
    const ref = o.$ref as string
    const at = label(doc, path)
    const target = splitRef(ref, doc)
    const siblings = siblingsOf(o, doc, kind, path)
    if (target.doc === rootId) return { ...siblings, $ref: `#${target.pointer}` }
    if (kind === 'schema') {
      const local = hoist(target, at, ref)
      return local === undefined ? { ...siblings } : { ...siblings, $ref: local }
    }
    const key = `${target.doc}#${target.pointer}`
    if (inlining.has(key)) {
      notes.push({
        code: 'cyclic-ref',
        at,
        message: `\`$ref\` \`${ref}\` includes itself; a ${kind} cannot be expanded into its own copy — left out.`,
      })
      return { ...siblings }
    }
    const found = lookup(target.doc, target.pointer, at, ref)
    if (!found.found) return { ...siblings }
    inlining.add(key)
    const value = walk(found.value, target.doc, kind, [...pointerPath(target.pointer)])
    inlining.delete(key)
    const valueObj = obj(value)
    // A reference's siblings (a 3.1 `summary`/`description`) override the
    // target's own, as OpenAPI 3.1 specifies.
    return valueObj ? { ...valueObj, ...siblings } : value
  }

  /** A discriminator's `mapping` may name another FILE; it follows its member. */
  const discriminator = (v: unknown, doc: DocId, path: string[]): unknown => {
    const d = obj(v)
    const mapping = obj(d?.mapping)
    if (!d || !mapping) return v
    const out: Json = {}
    for (const [tag, target] of Object.entries(mapping)) {
      if (typeof target !== 'string' || target.startsWith('#') || !/[./]/.test(target)) {
        out[tag] = typeof target === 'string' && target.startsWith('#') && doc !== rootId
          ? (hoist({ doc, pointer: target.slice(1) }, label(doc, [...path, 'discriminator']), target) ?? target)
          : target
        continue
      }
      out[tag] = hoist(splitRef(target, doc), label(doc, [...path, 'discriminator']), target) ?? target
    }
    return { ...d, mapping: out }
  }

  // A root component that is ONLY a reference to another file adopts the
  // target under its own name -- registered first, so every other reference
  // to that target lands here instead of on a second, hoisted copy.
  const adopt = new Map<string, { doc: DocId; pointer: string }>()
  for (const [name, entry] of Object.entries(rootSchemas)) {
    const e = obj(entry)
    if (!e || typeof e.$ref !== 'string' || Object.keys(e).length !== 1) continue
    const target = splitRef(e.$ref, rootId)
    if (target.doc === rootId) continue
    const key = `${target.doc}#${target.pointer}`
    if (hoisted.has(key)) continue
    hoisted.set(key, `${sectionRef}${escapeSeg(name)}`)
    adopt.set(name, target)
  }

  const out = walk(root, rootId, 'root', []) as Json
  const section = swagger2 ? obj(out.definitions) : obj(obj(out.components)?.schemas)
  const merged: Json = { ...section }
  for (const [name, target] of adopt) {
    const found = lookup(target.doc, target.pointer, label(rootId, [...sectionPath, name]), String(obj(rootSchemas[name])?.$ref))
    merged[name] = found.found ? walk(found.value, target.doc, 'schema', pointerPath(target.pointer)) : {}
  }
  for (const [name, value] of added) merged[name] = value
  if (Object.keys(merged).length > 0) {
    if (swagger2) out.definitions = merged
    else out.components = { ...obj(out.components), schemas: merged }
  }
  return { doc: out, notes, documents: [...docs.keys()].filter((id) => used.has(id)) }
}

function pointerPath(pointer: string): string[] {
  return pointer
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function escapeSeg(seg: string): string {
  return seg.replace(/~/g, '~0').replace(/\//g, '~1')
}

function obj(v: unknown): Json | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined
}

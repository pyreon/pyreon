/**
 * The pipeline: spec text -> IR -> files.
 *
 * Pure. It takes source text and returns file CONTENTS; nothing here touches
 * the filesystem, which is what makes the whole generator testable without a
 * temp directory and what lets the CLI diff before writing.
 */

import { emitAtlasScenarios, emitAtlasWrapper } from '../emit/atlas'
import { emitComponents } from '../emit/components'
import {
  emitBarrel,
  emitDevEntry,
  emitEndpointsBarrel,
  emitKeys,
  emitQueriesBarrel,
} from '../emit/entries'
import {
  emitClient,
  emitNativeModules,
  hasNativeDataComponent,
  emitWebEndpoints,
  emitWebQueries,
} from '../emit/client'
import { docsImportBase, emitDocs } from '../emit/docs'
import { emitFaker } from '../emit/faker'
import { emitMocks } from '../emit/mock'
import { emitPackageMarker } from '../emit/package-marker'
import { emitSchemas, emitTypes } from '../emit/schema'
import { banner, jsonLiteral, type GeneratedFile } from '../emit/writer'
import type { ResolvedConfig } from './config'
import type { IrDocument, IrNote, IrOperation, Reach } from './ir'
import { loadOpenApi, parsePagination, type LoadOptions } from '../input/openapi'
import { checkPagination } from '../emit/pagination'
import { emitOutputManifest } from './output-manifest'
import { extractSurface, type ApiSurface } from './surface'

export interface GenerateResult {
  doc: IrDocument
  files: GeneratedFile[]
  /** Per-operation native reach, decided statically from the IR. */
  reach: Map<string, { reach: Reach; reason?: string }>
  /**
   * The comparable API surface of THIS run.
   *
   * Committed as `api-surface.json` and diffed on the next run, which is what
   * makes a contract change visible. A spec edit that removes a response field
   * still typechecks after regeneration — against the new types, which agree
   * with the new spec and with nothing the app was written for.
   */
  surface: ApiSurface
}

/** Run the pipeline over a spec document's text. */
export function generate(
  specText: string,
  config: ResolvedConfig,
  /** Where the spec came from; resolves a relative `servers[].url`. */
  options: LoadOptions = {},
): GenerateResult {
  const { doc } = loadOpenApi(specText, options)
  applyPagination(doc, config)
  const native = config.target === 'multiplatform'
  const files: GeneratedFile[] = []
  const reach = reachOf(doc, config)
  const head = banner(doc.title, doc.version)
  const push = (f: { build: (b: string) => GeneratedFile }): void => {
    const built = f.build(head)
    // An emitter with nothing to say emits nothing — a file containing only a
    // banner is noise in the diff and a lie in the file tree.
    if (built.contents.trim() !== head.trim()) files.push(built)
  }

  const pushMaybe = (f: { build: (b: string) => GeneratedFile } | null): void => {
    if (f) push(f)
  }

  const has = (p: string): boolean => config.plugins.includes(p as never)

  if (has('types')) push(emitTypes(doc))
  if (has('schemas')) for (const f of emitSchemas(doc, { native: false, validator: config.validator })) push(f)
  if (has('client')) {
    push(
      emitClient(doc, {
        native,
        baseUrl: config.baseUrl,
        client: config.client,
        // A project's NAME when it has one, else the API's own base URL (unique
        // per API by construction), else its title.
        keyScope: config.name || config.baseUrl || doc.baseUrl || doc.title,
        responseValidation: config.responseValidation,
      }),
    )
    for (const f of emitWebEndpoints(doc, config.validator, config.client)) push(f)
  }
  if (has('queries')) {
    for (const f of emitWebQueries(doc)) push(f)
    push(emitKeys(doc))
  }
  if (has('mocks')) push(emitMocks(doc, config.client))
  // The factories import the model TYPES, which both `schemas` and `types`
  // export under the same names. `faker` requires `schemas`, so the first
  // branch is the live one; the second keeps the emitter honest if that
  // requirement is ever relaxed.
  if (has('faker')) pushMaybe(emitFaker(doc, has('schemas') ? 'schemas' : 'types'))
  // Previews come BEFORE scenarios: the scenario keys are these component
  // names, so emitting scenarios without them is a plausible-looking no-op.
  if (has('components')) push(emitComponents(doc))
  if (has('atlas')) {
    push(emitAtlasScenarios(doc, { faker: has('faker') }))
    push(emitAtlasWrapper(doc))
  }
  // The native modules are the `client` + `queries` emitters' native LAYOUT,
  // not a separate output — so they follow the same plugin selection. Emitting
  // them unconditionally meant `--plugins schemas` still produced a client and
  // a data component, which is the opposite of what was asked for.
  if (native && (has('client') || has('queries'))) {
    for (const f of emitNativeModules(doc, {
      native,
      baseUrl: config.baseUrl,
      validator: config.validator,
    })) push(f)
  }
  // `docs` reads the same reach analysis the CLI reports, so a page and the
  // terminal can never disagree about whether an operation reaches native.
  if (has('docs')) {
    for (const f of emitDocs(doc, {
      reach,
      hasQueries: has('queries'),
      // The EFFECTIVE base, matching what the client emitter bakes and what the
      // reach analysis read — not the spec's `servers[0]`, which a config
      // `baseUrl` overrides.
      baseUrl: config.baseUrl ?? doc.baseUrl,
      importBase: docsImportBase(config.output),
    })) {
      files.push(f)
    }
  }
  // Entry points last, so they re-export whatever the selection produced.
  //
  // Per-LAYER, not one flat barrel: an entry point is a reachability edge, and
  // a barrel naming every layer makes one hook reach every operation and every
  // fixture. Measured at 120 operations that was 30.7 kB against 6.1 kB.
  // Keyed on what was EMITTED, not on what was selected: an emitter with
  // nothing to say writes no file, and a barrel naming it does not compile.
  if (has('client')) pushMaybe(emitEndpointsBarrel(doc))
  if (has('queries')) pushMaybe(emitQueriesBarrel(doc))
  const entryOpts = {
    plugins: config.plugins,
    client: config.client,
    emitted: new Set(files.map((f) => f.path)),
  }
  pushMaybe(emitDevEntry(doc, entryOpts))
  push(emitBarrel(doc, entryOpts))

  // The `sideEffects` marker. Emitted unconditionally and last-but-one: it is
  // not a plugin's output but a statement ABOUT the output, and it is what
  // makes the whole generated graph tree-shakeable regardless of how the
  // consuming app's own package.json is configured.
  files.push(emitPackageMarker(config.plugins))

  // The record of what THIS run generated, so the next one can remove what it
  // no longer produces. Listed before `api-surface.json` is appended, and that
  // file is added to it explicitly: every path the run writes is on the list.
  files.push(emitOutputManifest([...files.map((f) => f.path), 'api-surface.json']))

  assertUniquePaths(files)

  const surface = extractSurface(doc)
  // Emitted LAST and unconditionally: it is not a plugin's output but the
  // record of what this run promised, and a run that emitted only schemas
  // still changed the contract if a model moved.
  files.push({
    path: 'api-surface.json',
    // `jsonLiteral`, not bare `JSON.stringify`: the latter leaves U+2028 and
    // U+2029 RAW, and both are JavaScript line terminators. A spec
    // `description` carrying one would produce a file that parses as JSON and
    // breaks the moment anything imports it as a module.
    contents: `${jsonLiteral(surface, 2)}\n`,
  })
  return { doc, files, reach, surface }
}

/**
 * Merge `pagination` config onto the operations and CHECK every declaration
 * against the spec's types (audit E3).
 *
 * A config entry is the user's explicit instruction, so a wrong one FAILS the
 * run with the reason; a wrong `x-pyreon-pagination` in someone else's spec is
 * NOTED and skipped, like every other spec construct Lathe cannot honour.
 */
function applyPagination(doc: IrDocument, config: ResolvedConfig): void {
  const byId = new Map(doc.operations.map((o) => [o.id, o]))
  for (const [id, entry] of Object.entries(config.pagination ?? {})) {
    const op = byId.get(id)
    if (!op) {
      throw new Error(
        `[Pyreon] lathe: \`pagination.${id}\` names no operation. Keys are the GENERATED operation names (the \`endpoints\` exports): ${[...byId.keys()].slice(0, 20).join(', ')}.`,
      )
    }
    const parsed = parsePagination(entry)
    if (typeof parsed === 'string') throw new Error(`[Pyreon] lathe: \`pagination.${id}\`: ${parsed}`)
    op.pagination = parsed
  }
  const models = new Map(doc.models.map((m) => [m.name, m.type]))
  const fromConfig = new Set(Object.keys(config.pagination ?? {}))
  for (const op of doc.operations) {
    if (!op.pagination) continue
    const clash = [`${op.id}Infinite`, `${op.id}InfiniteOptions`].find((n) => byId.has(n))
    const problem =
      op.method !== 'GET'
        ? `pagination for \`${op.id}\`: only a GET can be paged.`
        : clash
          ? `pagination for \`${op.id}\`: its hook would collide with the operation \`${clash}\`.`
          : checkPagination(op, models)
    if (problem === undefined) continue
    if (fromConfig.has(op.id)) throw new Error(`[Pyreon] lathe: ${problem}`)
    ;(doc.notes as IrNote[]).push({ code: 'invalid-pagination', at: `#/paths/${op.path}`, message: `${problem} Ignored.` })
    op.pagination = undefined
  }
}

/**
 * Two generated files with one path means one silently overwrites the other
 * on disk -- a whole tag's endpoints gone, with no error anywhere. Compared
 * case-INSENSITIVELY, because macOS and Windows filesystems are: `users.ts`
 * and `Users.ts` are one file there. The input layer is responsible for names
 * that never collide; this is the guard that makes a regression loud.
 */
function assertUniquePaths(files: readonly GeneratedFile[]): void {
  const seen = new Map<string, string>()
  for (const f of files) {
    const key = f.path.toLowerCase()
    const prev = seen.get(key)
    if (prev !== undefined) {
      throw new Error(
        `[Pyreon] lathe: two generated files map to the same path (\`${prev}\` and \`${f.path}\`) — one would overwrite the other. This is a lathe naming bug; please report it with the spec's tag and operation names.`,
      )
    }
    seen.set(key, f.path)
  }
}

/**
 * Decide, per operation, whether the generated code can reach native.
 *
 * Static and cheap — it reads the IR, not the emitted source, so the CLI can
 * report reach even when the native compiler is absent. `verifyNative` is the
 * stronger check and runs the real compiler; this is the explanation of WHY,
 * which a compiler warning alone does not give in spec terms.
 */
function reachOf(doc: IrDocument, config: ResolvedConfig): Map<string, { reach: Reach; reason?: string }> {
  const out = new Map<string, { reach: Reach; reason?: string }>()
  const baseUrl = config.baseUrl ?? doc.baseUrl
  for (const op of doc.operations) {
    out.set(op.id, decide(op, op.baseUrl ?? baseUrl))
  }
  return out
}

function decide(op: IrOperation, baseUrl: string): { reach: Reach; reason?: string } {
  if (baseUrl === '') {
    return {
      reach: 'web-only',
      reason: 'no absolute baseUrl — PMTC bakes the request URL at compile time and cannot resolve a relative one.',
    }
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    return { reach: 'web-only', reason: `baseUrl \`${baseUrl}\` is not absolute.` }
  }
  // A path parameter used to disqualify an operation, because PMTC resolved
  // the endpoint URL to a compile-time constant. It no longer does: a runtime
  // `:param` lowers through `useQuery`, whose native harness is keyed on the
  // resulting URL and therefore re-fetches when the value changes. The
  // generated component takes the param as a PROP.
  //
  // Left as a comment rather than deleted because the reason it USED to be
  // here is the reason the generated native layout looks the way it does.
  if (op.method !== 'GET') {
    return {
      reach: 'web-only',
      reason: `\`${op.method}\` lowers through mutations, which PMTC does not yet recognise; GET operations on this client DO reach native.`,
    }
  }
  // Asked of the emitter rather than re-derived: the reach report and the
  // native layout must agree about which reads get a data component.
  if (!hasNativeDataComponent(op)) {
    return {
      reach: 'web-only',
      reason:
        'no typed JSON response (no content, or a media type Lathe cannot type) -- a native query decodes into a declared type, so there is nothing to lower it to.',
    }
  }
  return { reach: 'web+native' }
}

export type { GeneratedFile }

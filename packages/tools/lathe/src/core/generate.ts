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
  emitWebEndpoints,
  emitWebQueries,
} from '../emit/client'
import { emitDocs } from '../emit/docs'
import { emitFaker } from '../emit/faker'
import { emitMocks } from '../emit/mock'
import { emitPackageMarker } from '../emit/package-marker'
import { emitSchemas, emitTypes } from '../emit/schema'
import { banner, jsonLiteral, type GeneratedFile } from '../emit/writer'
import type { ResolvedConfig } from './config'
import type { IrDocument, IrOperation, Reach } from './ir'
import { loadOpenApi } from '../input/openapi'
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
export function generate(specText: string, config: ResolvedConfig): GenerateResult {
  const { doc } = loadOpenApi(specText)
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
  if (has('schemas')) push(emitSchemas(doc, { native: false, validator: config.validator }))
  if (has('client')) {
    push(emitClient(doc, { native, baseUrl: config.baseUrl, client: config.client }))
    for (const f of emitWebEndpoints(doc, config.validator)) push(f)
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
    push(emitAtlasScenarios(doc))
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
    })) {
      files.push(f)
    }
  }
  // Entry points last, so they re-export whatever the selection produced.
  //
  // Per-LAYER, not one flat barrel: an entry point is a reachability edge, and
  // a barrel naming every layer makes one hook reach every operation and every
  // fixture. Measured at 120 operations that was 30.7 kB against 6.1 kB.
  const entryOpts = { plugins: config.plugins, client: config.client }
  if (has('client')) pushMaybe(emitEndpointsBarrel(doc))
  if (has('queries')) pushMaybe(emitQueriesBarrel(doc))
  pushMaybe(emitDevEntry(doc, entryOpts))
  push(emitBarrel(doc, entryOpts))

  // The `sideEffects` marker. Emitted unconditionally and last-but-one: it is
  // not a plugin's output but a statement ABOUT the output, and it is what
  // makes the whole generated graph tree-shakeable regardless of how the
  // consuming app's own package.json is configured.
  files.push(emitPackageMarker(config.plugins))

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
    out.set(op.id, decide(op, baseUrl))
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
  return { reach: 'web+native' }
}

export type { GeneratedFile }

/**
 * The pipeline: spec text -> IR -> files.
 *
 * Pure. It takes source text and returns file CONTENTS; nothing here touches
 * the filesystem, which is what makes the whole generator testable without a
 * temp directory and what lets the CLI diff before writing.
 */

import { emitAtlasScenarios, emitAtlasWrapper } from '../emit/atlas'
import { emitComponents } from '../emit/components'
import { emitBarrel, emitKeys } from '../emit/index-barrel'
import {
  emitClient,
  emitNativeModules,
  emitWebEndpoints,
  emitWebQueries,
} from '../emit/client'
import { emitMocks } from '../emit/mock'
import { emitSchemas, emitTypes } from '../emit/schema'
import { banner, type GeneratedFile } from '../emit/writer'
import type { ResolvedConfig } from './config'
import type { IrDocument, IrOperation, Reach } from './ir'
import { loadOpenApi } from '../input/openapi'

export interface GenerateResult {
  doc: IrDocument
  files: GeneratedFile[]
  /** Per-operation native reach, decided statically from the IR. */
  reach: Map<string, { reach: Reach; reason?: string }>
}

/** Run the pipeline over a spec document's text. */
export function generate(specText: string, config: ResolvedConfig): GenerateResult {
  const { doc } = loadOpenApi(specText)
  const native = config.target === 'multiplatform'
  const files: GeneratedFile[] = []
  const head = banner(doc.title, doc.version)
  const push = (f: { build: (b: string) => GeneratedFile }): void => {
    const built = f.build(head)
    // An emitter with nothing to say emits nothing — a file containing only a
    // banner is noise in the diff and a lie in the file tree.
    if (built.contents.trim() !== head.trim()) files.push(built)
  }

  const has = (p: string): boolean => config.plugins.includes(p as never)

  if (has('types')) push(emitTypes(doc))
  if (has('schemas')) push(emitSchemas(doc, { native: false }))
  if (has('client')) {
    push(emitClient(doc, { native, baseUrl: config.baseUrl }))
    for (const f of emitWebEndpoints(doc)) push(f)
  }
  if (has('queries')) {
    for (const f of emitWebQueries(doc)) push(f)
  }
  if (has('queries')) push(emitKeys(doc))
  if (has('mocks')) push(emitMocks(doc))
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
    for (const f of emitNativeModules(doc, { native, baseUrl: config.baseUrl })) push(f)
  }
  // Last, so it can re-export whatever the selection actually produced.
  push(emitBarrel(doc, { plugins: config.plugins }))

  return { doc, files, reach: reachOf(doc, config) }
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

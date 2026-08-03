/**
 * The Reactivity Lens, browser side.
 *
 * The compiler's per-expression verdict — LIVE (re-runs when a signal changes)
 * or STATIC (captured once) — computed in Node and fetched over the `atlas dev`
 * RPC channel. `static` where the author expected `live` is the single most
 * common Pyreon bug, the UI that silently never updates, and this is it caught
 * at author time rather than by noticing nothing happened in a browser.
 *
 * Kept free of DOM so the shaping decisions are unit-testable, and free of any
 * compiler import so nothing drags the TypeScript API into the page.
 */

/** Mirrors the node side's shape; duplicated rather than imported because that
 * module is Node-only and importing it would pull `node:fs` into the browser. */
export interface LensFinding {
  kind: string
  detail: string
  column: number
  suspect: boolean
  code?: string
}

export interface LensLine {
  line: number
  text: string
  findings: LensFinding[]
}

export interface LensResult {
  path: string
  lines: LensLine[]
  totals: Record<string, number>
  suspects: number
}

export type LensState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; result: LensResult }
  /** The channel answered, but the Lens cannot run (no compiler, no source). */
  | { state: 'unavailable'; reason: string }

/**
 * The payload `atlas build` installs on a STATIC site.
 *
 * A built site has no server, so the two node-answered methods (`source`,
 * `lens`) are precomputed at build time and shipped as data. Reading it here —
 * at the single call site every panel already goes through — is what makes a
 * deployed site fully functional instead of quietly missing its two best views.
 */
interface StaticRpcHost {
  __ATLAS_STATIC_RPC__?: Record<string, Record<string, unknown>>
}

/** A baked failure carries the REAL reason, not a network error about it. */
function bakedError(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const reason = (value as { __atlasRpcError?: unknown }).__atlasRpcError
  return typeof reason === 'string' ? reason : undefined
}

/**
 * Look the answer up in the baked payload, if there is one.
 *
 * Returns `undefined` for "not baked" so the caller falls through to the live
 * channel — which is what `atlas dev` wants, since it bakes nothing and must
 * keep answering from Node.
 */
export function readBakedRpc(
  method: string,
  params: Record<string, unknown>,
): { ok: true; result: unknown } | { ok: false; error: string } | undefined {
  const baked = (globalThis as StaticRpcHost).__ATLAS_STATIC_RPC__?.[method]
  if (!baked) return undefined
  const key = String(params.component ?? '')
  // `in` rather than a truthiness check: a method whose legitimate answer is
  // `null` or `''` is still an answer, and falling through to a fetch that
  // cannot succeed would report it as a network failure.
  if (!(key in baked)) return undefined
  const value = baked[key]
  const reason = bakedError(value)
  return reason ? { ok: false, error: reason } : { ok: true, result: value }
}

/**
 * Call an RPC method — from the baked payload on a static site, otherwise over
 * the dev server's channel.
 *
 * Returns a discriminated result rather than throwing: every caller here is a
 * render path, and an unhandled rejection in one would blank a panel while
 * telling the user nothing.
 */
export async function callRpc(
  method: string,
  params: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const baked = readBakedRpc(method, params)
  if (baked) return baked

  try {
    const response = await fetchImpl('/__atlas/rpc', {
      method: 'POST',
      body: JSON.stringify({ method, params }),
    })
    const body = (await response.json()) as { ok?: boolean; result?: unknown; error?: string }
    if (body.ok) return { ok: true, result: body.result }
    return { ok: false, error: String(body.error ?? 'Unknown error') }
  } catch (err) {
    // A workbench served WITHOUT `atlas dev` (the hand-wired example app) has
    // no channel at all. That is not an error to shout about — the panel says
    // the Lens needs `atlas dev`, which is actionable.
    return { ok: false, error: String((err as Error)?.message ?? err) }
  }
}

/** Fetch the Lens verdict for one component. */
export async function fetchLens(
  component: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LensState> {
  const res = await callRpc('lens', { component }, fetchImpl)
  if (!res.ok) return { state: 'unavailable', reason: res.error }
  return { state: 'ready', result: res.result as LensResult }
}

/**
 * The lines worth showing.
 *
 * A component is hundreds of lines and almost all of them have no verdict.
 * Rendering the whole file buries the finding; rendering ONLY flagged lines
 * loses the context needed to read them. So: every line carrying a finding,
 * plus `context` lines either side, with gaps collapsed.
 */
export function relevantLines(lines: readonly LensLine[], context = 1): LensLine[] {
  const keep = new Set<number>()
  for (const line of lines) {
    if (line.findings.length === 0) continue
    for (let i = line.line - context; i <= line.line + context; i += 1) keep.add(i)
  }
  return lines.filter((l) => keep.has(l.line))
}

/**
 * A one-line verdict for the panel header.
 *
 * Leads with the SUSPECT count, because that is the number a reader should act
 * on; a bare "42 findings" invites ignoring the panel.
 */
export function lensSummary(result: LensResult): string {
  const reactive =
    (result.totals.reactive ?? 0) +
    (result.totals['reactive-prop'] ?? 0) +
    (result.totals['reactive-attr'] ?? 0)
  const staticText = result.totals['static-text'] ?? 0
  const footguns = result.totals.footgun ?? 0

  if (result.suspects === 0) {
    return `No baked-once reads or footguns — ${reactive} reactive expression(s).`
  }
  const parts: string[] = []
  if (staticText > 0) parts.push(`${staticText} baked once`)
  if (footguns > 0) parts.push(`${footguns} footgun${footguns === 1 ? '' : 's'}`)
  return `${parts.join(' · ')} — check these before assuming the UI updates.`
}

/** Short label per verdict kind, for the gutter badge. */
export const KIND_LABEL: Record<string, string> = {
  reactive: 'reactive',
  'reactive-prop': 'reactive·prop',
  'reactive-attr': 'reactive·attr',
  'static-text': 'BAKED ONCE',
  'hoisted-static': 'hoisted',
  footgun: '!',
}

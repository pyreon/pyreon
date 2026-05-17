import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _handleMessage,
  _resetOpenDocuments,
  computeReactivityHints,
} from '../lsp/index'

// Warm the lazy `@pyreon/compiler` import ONCE before any test. The first
// `loadAnalyze()` cold-transforms the entire compiler barrel (jsx.ts +
// the TS compiler API via pyreon-intercept) through vitest's transformer
// in a fresh `@pyreon/lint` worker — a deterministic one-time ~10-30s
// cost on cold CI runners (NOT a race; the anti-fixed-sleep guidance is
// about event races, not module cold-load). After this hook the module
// is memoized so every spec's call is sub-millisecond. In a real
// long-lived LSP server this cost is paid once at first hint, off the
// node transformer (~1s), and the editor re-requests — invisible to the
// user. The generous hook timeout is headroom for shared-runner cold
// transform, not brittleness.
beforeAll(async () => {
  await computeReactivityHints('warmup.tsx', 'const x = 1')
}, 180_000)

/**
 * Reactivity-Lens LSP surface — e2e proof at the JSON-RPC contract layer.
 *
 * `lsp.test.ts` covers the diagnostic-conversion path; this drives the
 * actual `_handleMessage` handler end-to-end (initialize → didOpen →
 * textDocument/inlayHint) — the exact request/response shape an editor
 * sends — plus the pure `computeReactivityHints` core.
 *
 * `_handleMessage` / `computeReactivityHints` are async (the heavy
 * `@pyreon/compiler` value is lazy-loaded + memoized on first use so the
 * `@pyreon/lint` CLI / package-index don't eager-cold-load the compiler).
 * Awaiting a sync-returned response is a no-op, so every call is awaited
 * uniformly.
 */

describe('LSP — Reactivity Lens inlay-hint transport', () => {
  beforeEach(() => {
    _resetOpenDocuments()
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initialize advertises inlayHintProvider', async () => {
    const res = await _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect(res?.result.capabilities.inlayHintProvider).toBe(true)
    expect(res?.result.capabilities.diagnosticProvider).toBeDefined()
  })

  it('didOpen → inlayHint returns a "live" hint anchored at the reactive span end', async () => {
    const uri = 'file:///app/Counter.tsx'
    const text = `function Counter(){ return <div>{count()}</div> }`
    await _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text } },
    })
    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/inlayHint',
      params: { textDocument: { uri } },
    })
    const hints = res?.result as Array<{
      position: { line: number; character: number }
      label: string
      tooltip?: string
    }>
    expect(Array.isArray(hints)).toBe(true)
    const live = hints.find((h) => h.label === 'live')
    expect(live).toBeDefined()
    expect(live!.position.line).toBe(0)
    expect(live!.position.character).toBe(text.indexOf('count()') + 'count()'.length)
    expect(live!.tooltip).toContain('re-renders')
  })

  it('inlayHint for an unopened document returns []', async () => {
    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'textDocument/inlayHint',
      params: { textDocument: { uri: 'file:///nope.tsx' } },
    })
    expect(res?.result).toEqual([])
  })

  it('inlayHint honors the requested visible range', async () => {
    const uri = 'file:///app/Multi.tsx'
    const text = [
      `function A(){ return <i>{a()}</i> }`, // line 0
      `function B(){ return <i>{b()}</i> }`, // line 1
    ].join('\n')
    await _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text } },
    })
    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'textDocument/inlayHint',
      params: {
        textDocument: { uri },
        range: { start: { line: 0 }, end: { line: 0 } },
      },
    })
    const hints = res?.result as Array<{ position: { line: number } }>
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.every((h) => h.position.line === 0)).toBe(true)
  })
})

describe('LSP — computeReactivityHints (pure core)', () => {
  it('static text yields a "static" hint, never "live"', async () => {
    const { inlayHints } = await computeReactivityHints(
      'C.tsx',
      `function C(){ const label="hi"; return <p>{label}</p> }`,
    )
    expect(inlayHints.some((h) => h.label === 'static')).toBe(true)
    expect(inlayHints.some((h) => h.label === 'live')).toBe(false)
  })

  it('param-destructured props surface as a warning-severity footgun diagnostic', async () => {
    const { footgunDiagnostics } = await computeReactivityHints(
      'C.tsx',
      `function C({ name }){ return <div>{name}</div> }`,
    )
    expect(footgunDiagnostics.length).toBeGreaterThanOrEqual(1)
    const fg = footgunDiagnostics.find((d) => d.code === 'props-destructured')
    expect(fg).toBeDefined()
    expect(fg!.severity).toBe(2) // warning
    expect(fg!.source).toBe('pyreon-lens')
  })

  it('parse failure → empty surface, never throws', async () => {
    const r = await computeReactivityHints('bad.tsx', `function C( { return <div`)
    expect(r.inlayHints).toEqual([])
    expect(r.footgunDiagnostics).toEqual([])
  })
})

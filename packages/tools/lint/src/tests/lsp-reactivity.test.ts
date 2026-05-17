import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _handleMessage,
  _resetOpenDocuments,
  computeReactivityHints,
} from '../lsp/index'

/**
 * Reactivity-Lens LSP surface — e2e proof at the JSON-RPC contract layer.
 *
 * `lsp.test.ts` covers the diagnostic-conversion path; this drives the
 * actual `_handleMessage` handler end-to-end (initialize → didOpen →
 * textDocument/inlayHint) — the exact request/response shape an editor
 * sends — plus the pure `computeReactivityHints` core.
 *
 * Why this is the right "e2e" for an editor feature: a Playwright-against-
 * VSCode test would assert the editor renders ghost text, but the
 * load-bearing contract is "the server returns correct inlay hints for the
 * keystroke". That contract is exactly what this exercises against the real
 * handler + the real `@pyreon/compiler` analysis (no mocks).
 */

describe('LSP — Reactivity Lens inlay-hint transport', () => {
  beforeEach(() => {
    _resetOpenDocuments()
    // didOpen publishes diagnostics via process.stdout — silence it so the
    // test output stays clean; we assert on handler return values, not the
    // notification side-channel.
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initialize advertises inlayHintProvider', () => {
    const res = _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect(res?.result.capabilities.inlayHintProvider).toBe(true)
    expect(res?.result.capabilities.diagnosticProvider).toBeDefined()
  })

  it('didOpen → inlayHint returns a "live" hint anchored at the reactive span end', () => {
    const uri = 'file:///app/Counter.tsx'
    const text = `function Counter(){ return <div>{count()}</div> }`
    _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text } },
    })
    const res = _handleMessage({
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
    // Anchored at end-of-`count()` on line 0 (LSP 0-based).
    expect(live!.position.line).toBe(0)
    expect(live!.position.character).toBe(text.indexOf('count()') + 'count()'.length)
    expect(live!.tooltip).toContain('re-renders')
  })

  it('inlayHint for an unopened document returns []', () => {
    const res = _handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'textDocument/inlayHint',
      params: { textDocument: { uri: 'file:///nope.tsx' } },
    })
    expect(res?.result).toEqual([])
  })

  it('inlayHint honors the requested visible range', () => {
    const uri = 'file:///app/Multi.tsx'
    const text = [
      `function A(){ return <i>{a()}</i> }`, // line 0
      `function B(){ return <i>{b()}</i> }`, // line 1
    ].join('\n')
    _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text } },
    })
    const res = _handleMessage({
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
  it('static text yields a "static" hint, never "live"', () => {
    const { inlayHints } = computeReactivityHints(
      'C.tsx',
      `function C(){ const label="hi"; return <p>{label}</p> }`,
    )
    expect(inlayHints.some((h) => h.label === 'static')).toBe(true)
    expect(inlayHints.some((h) => h.label === 'live')).toBe(false)
  })

  it('param-destructured props surface as a warning-severity footgun diagnostic', () => {
    const { footgunDiagnostics } = computeReactivityHints(
      'C.tsx',
      `function C({ name }){ return <div>{name}</div> }`,
    )
    expect(footgunDiagnostics.length).toBeGreaterThanOrEqual(1)
    const fg = footgunDiagnostics.find((d) => d.code === 'props-destructured')
    expect(fg).toBeDefined()
    expect(fg!.severity).toBe(2) // warning
    expect(fg!.source).toBe('pyreon-lens')
  })

  it('parse failure → empty surface, never throws', () => {
    const r = computeReactivityHints('bad.tsx', `function C( { return <div`)
    expect(r.inlayHints).toEqual([])
    expect(r.footgunDiagnostics).toEqual([])
  })
})

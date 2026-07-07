// Native stdio LSP (DX arc PR 2, 2026-07). The PURE core — the finding→
// diagnostic mapper + the JSON-RPC message handler — is unit-tested here
// WITHOUT spawning the stdio transport (the notification sink is injected
// via `_setNotify`). The transport itself is a thin, standard
// Content-Length loop mirrored from `@pyreon/lint`'s LSP.
//
// Bisect site: the range/severity computation in findingsToDiagnostics
// (neuter → the mapper specs fail); the didOpen branch in _handleMessage
// (the publish spec).

import { afterEach, describe, expect, it } from 'vitest'
import {
  _handleMessage,
  _resetOpenDocuments,
  _setNotify,
  _uriToFilePath,
  diagnosticsForDocument,
  findingsToDiagnostics,
} from '../lsp'
import type { CheckFinding } from '../check'

afterEach(() => {
  _setNotify(() => {})
  _resetOpenDocuments()
})

const finding = (over: Partial<CheckFinding>): CheckFinding => ({
  file: 'X.tsx',
  target: 'swift',
  kind: 'warning',
  message: 'msg',
  ...over,
})

describe('findingsToDiagnostics', () => {
  it('maps a position-less warning to a file-level, severity-2 diagnostic', () => {
    const [d] = findingsToDiagnostics([finding({ kind: 'warning', message: 'unsupported X' })])
    expect(d!.severity).toBe(2)
    expect(d!.range.start).toEqual({ line: 0, character: 0 })
    expect(d!.source).toBe('pyreon-native')
    expect(d!.message).toBe('[swift] unsupported X') // target-tagged
    expect(d!.code).toBe('warning')
  })

  it('maps an error WITH a position to a precise 0-based, severity-1 range', () => {
    const [d] = findingsToDiagnostics([
      finding({ kind: 'error', message: 'boom', position: { line: 5, column: 9 } }),
    ])
    expect(d!.severity).toBe(1)
    // 1-based finding position → 0-based LSP range.
    expect(d!.range.start).toEqual({ line: 4, character: 8 })
    expect(d!.range.end).toEqual({ line: 4, character: 9 })
  })

  it('maps severities: error/typecheck-error→1, warning→2, typecheck-skipped→3', () => {
    const sev = (kind: CheckFinding['kind']) =>
      findingsToDiagnostics([finding({ kind })])[0]!.severity
    expect(sev('error')).toBe(1)
    expect(sev('typecheck-error')).toBe(1)
    expect(sev('warning')).toBe(2)
    expect(sev('typecheck-skipped')).toBe(3)
  })
})

describe('diagnosticsForDocument', () => {
  it('yields no diagnostics for a web-only entry (nothing to compile natively)', () => {
    const diags = diagnosticsForDocument(
      "import { mount } from '@pyreon/runtime-dom'\nexport function C() { return null }",
      'entry.tsx',
    )
    expect(diags).toEqual([])
  })

  it('surfaces an unsupported-subset warning for a generic helper', () => {
    const diags = diagnosticsForDocument(
      'function first<T>(x: T[]): T { return x[0] }\nexport function C() { return <text>h</text> }',
      'X.tsx',
    )
    expect(diags.length).toBeGreaterThanOrEqual(1)
    expect(diags[0]!.severity).toBe(2)
  })
})

describe('_uriToFilePath', () => {
  it('strips the file:// scheme + decodes', () => {
    expect(_uriToFilePath('file:///a/b%20c.tsx')).toBe('/a/b c.tsx')
    expect(_uriToFilePath('/already/a/path.tsx')).toBe('/already/a/path.tsx')
  })
})

describe('_handleMessage — JSON-RPC contract', () => {
  it('initialize returns full-sync capabilities + serverInfo', () => {
    const res = _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(res!.result.capabilities.textDocumentSync).toBe(1)
    expect(res!.result.serverInfo.name).toBe('pyreon-native')
  })

  it('didOpen publishes diagnostics for the document (via the injected sink)', () => {
    let published: { uri: string; diagnostics: unknown[] } | null = null
    _setNotify((method, params) => {
      if (method === 'textDocument/publishDiagnostics')
        published = params as { uri: string; diagnostics: unknown[] }
    })
    const res = _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///X.tsx',
          text: 'function first<T>(x: T[]): T { return x[0] }\nexport function C() { return <text>h</text> }',
        },
      },
    })
    expect(res).toBeNull() // notification, no response
    expect(published!.uri).toBe('file:///X.tsx')
    expect(published!.diagnostics.length).toBeGreaterThanOrEqual(1)
  })

  it('didChange re-publishes diagnostics for the new text', () => {
    let count = 0
    _setNotify((method) => {
      if (method === 'textDocument/publishDiagnostics') count++
    })
    _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: 'file:///X.tsx' },
        contentChanges: [{ text: 'export function C() { return <text>ok</text> }' }],
      },
    })
    expect(count).toBe(1)
  })

  it('shutdown returns a null result; unknown notifications return null', () => {
    expect(_handleMessage({ jsonrpc: '2.0', id: 9, method: 'shutdown' })!.result).toBeNull()
    expect(_handleMessage({ jsonrpc: '2.0', method: 'initialized' })).toBeNull()
  })
})

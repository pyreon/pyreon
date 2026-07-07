// Minimal stdio LSP for `pyreon-native check --lsp` (DX arc, 2026-07).
//
// Surfaces native compile findings — transform errors + unsupported-TS-
// subset warnings — as editor diagnostics, live on open / change, so the
// authoring loop no longer requires a manual CLI run. Consumes the
// in-memory `checkSource` core (PR #2110) and the `position` it parses
// out of position-carrying messages.
//
// The JSON-RPC framing mirrors `@pyreon/lint`'s hand-rolled LSP (no
// `vscode-languageserver` dependency). The PURE core — `findingsTo
// Diagnostics` (the mapper) + `_handleMessage` (the protocol contract) —
// is exported + unit-tested WITHOUT spawning the stdio transport; the
// notification sink is injectable (`_setNotify`) so the didOpen/didChange
// → publishDiagnostics path is testable without stdout.
//
// Deliberately minimal v1 (honest scope): synchronous re-check on change
// (no debounce yet — the in-memory transform is fast), diagnostics only
// (no inlay hints — native has no reactivity-lens surface), no `swiftc
// -typecheck` on the editor path (slow / macOS-only). Warnings render as
// file-level diagnostics because the compiler's warn sites are position-
// less today (a tracked follow-up); errors that carry a `file:line:col`
// get a precise range.

import type { TargetLanguage } from '@pyreon/native-compiler'
import { checkSource, type CheckFinding } from './check'

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string | undefined
  method?: string | undefined
  params?: any
  result?: any
}

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  /** LSP DiagnosticSeverity: 1 Error, 2 Warning, 3 Information, 4 Hint. */
  severity: number
  source: string
  message: string
  code: string
}

/** Native finding kind → LSP severity. */
const SEVERITY: Record<CheckFinding['kind'], number> = {
  error: 1,
  'typecheck-error': 1,
  warning: 2,
  'typecheck-skipped': 3,
}

/**
 * Pure map of native check findings → LSP diagnostics. A finding with a
 * parsed `position` (transform / type-check errors) gets a precise
 * single-character range; a position-less finding (the common warning
 * case) gets a file-level range on line 0. The unit-testable core.
 */
export function findingsToDiagnostics(findings: CheckFinding[]): LspDiagnostic[] {
  return findings.map((f) => {
    const line = f.position ? Math.max(0, f.position.line - 1) : 0
    const character = f.position ? Math.max(0, f.position.column - 1) : 0
    return {
      range: {
        start: { line, character },
        end: { line, character: character + 1 },
      },
      severity: SEVERITY[f.kind],
      source: 'pyreon-native',
      message: `[${f.target}] ${f.message}`,
      code: f.kind,
    }
  })
}

/**
 * Check a document buffer + map to LSP diagnostics. Runs the fast
 * in-memory transform for both targets (NO `swiftc -typecheck` — that's
 * slow + macOS-only, wrong for the keystroke path). A web-only entry
 * yields no diagnostics (nothing to compile natively).
 */
export function diagnosticsForDocument(text: string, fileName: string): LspDiagnostic[] {
  const targets: TargetLanguage[] = ['swift', 'kotlin']
  const { webEntry, findings } = checkSource(text, fileName, { targets })
  return webEntry ? [] : findingsToDiagnostics(findings)
}

// ─── Protocol contract (pure, unit-testable) ───────────────────────────────

/** Notification sink — the stdio transport wires the real stdout sender;
 *  tests inject a capture via `_setNotify`. */
type Notify = (method: string, params: unknown) => void
let _notify: Notify = () => {}

/** Test seam: override the notification sink (and reset with `() => {}`). */
export function _setNotify(fn: Notify): void {
  _notify = fn
}

const openDocuments = new Map<string, string>()

/** Test-only: reset the open-document map between integration specs. */
export function _resetOpenDocuments(): void {
  openDocuments.clear()
}

/** `file:///a/b.tsx` → `/a/b.tsx` (the fileName checkSource labels findings with). */
export function _uriToFilePath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri
}

function publishDiagnostics(uri: string, text: string): void {
  const diagnostics = diagnosticsForDocument(text, _uriToFilePath(uri))
  _notify('textDocument/publishDiagnostics', { uri, diagnostics })
}

/**
 * Pure JSON-RPC message handler. Exported (underscore-prefixed, matching
 * the codebase's internal-export convention) so the protocol contract —
 * including the didOpen/didChange → publishDiagnostics path via an
 * injected `_setNotify` sink — is unit-testable without the transport.
 * Returns a response message for requests (`initialize`, `shutdown`) or
 * `null` for notifications.
 */
export function _handleMessage(msg: JsonRpcMessage): JsonRpcMessage | null {
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1, // Full document sync.
          diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
        },
        serverInfo: { name: 'pyreon-native', version: '0.0.0' },
      },
    }
  }
  if (msg.method === 'initialized') return null
  if (msg.method === 'textDocument/didOpen') {
    const { uri, text } = msg.params.textDocument
    openDocuments.set(uri, text)
    publishDiagnostics(uri, text)
    return null
  }
  if (msg.method === 'textDocument/didChange') {
    const uri: string = msg.params.textDocument.uri
    const text: string | undefined = msg.params.contentChanges[0]?.text
    if (text != null) {
      openDocuments.set(uri, text)
      publishDiagnostics(uri, text)
    }
    return null
  }
  if (msg.method === 'textDocument/didSave') {
    const uri: string = msg.params.textDocument.uri
    const text = openDocuments.get(uri)
    if (text != null) publishDiagnostics(uri, text)
    return null
  }
  if (msg.method === 'textDocument/didClose') {
    openDocuments.delete(msg.params.textDocument.uri)
    return null
  }
  if (msg.method === 'shutdown') return { jsonrpc: '2.0', id: msg.id, result: null }
  return null
}

// ─── stdio transport ───────────────────────────────────────────────────────

function sendMessage(msg: JsonRpcMessage): void {
  const body = JSON.stringify(msg)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

/**
 * Start the stdio LSP server — reads JSON-RPC (Content-Length framed)
 * from stdin, dispatches to `_handleMessage`, writes responses +
 * publish notifications to stdout. Never returns (the editor owns the
 * lifetime; `exit` tears the process down).
 */
export function startLspServer(): void {
  _setNotify((method, params) => sendMessage({ jsonrpc: '2.0', method, params }))
  let buffer = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break
      const header = buffer.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        buffer = buffer.slice(headerEnd + 4)
        continue
      }
      const contentLength = Number.parseInt(match[1]!, 10)
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + contentLength) break
      const body = buffer.slice(bodyStart, bodyStart + contentLength)
      buffer = buffer.slice(bodyStart + contentLength)
      try {
        const response = _handleMessage(JSON.parse(body) as JsonRpcMessage)
        if (response) sendMessage(response)
      } catch {
        // Malformed JSON frame — ignore (the client will resend).
      }
    }
  })
  process.stderr.write('[pyreon-native] LSP server started\n')
}

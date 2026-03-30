/**
 * Minimal LSP server for @pyreon/lint.
 *
 * Provides real-time Pyreon-specific diagnostics in editors that support
 * the Language Server Protocol (VS Code, Neovim, etc.).
 *
 * Usage: pyreon-lint --lsp
 *
 * The server communicates via JSON-RPC over stdin/stdout following the
 * LSP specification (https://microsoft.github.io/language-server-protocol/).
 *
 * Supported capabilities:
 * - textDocument/didOpen — lint on open
 * - textDocument/didSave — lint on save
 * - textDocument/didChange — lint on change (debounced)
 *
 * @module
 */

import { readFileSync } from 'node:fs'
import { AstCache } from '../cache'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { Diagnostic, LintConfig } from '../types'

const cache = new AstCache()
const config: LintConfig = getPreset('recommended')

// ─── JSON-RPC message types ────────────────────────────────────────────────

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string | undefined
  method?: string | undefined
  params?: any
  result?: any
}

// ─── LSP Diagnostic conversion ─────────────────────────────────────────────

interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  severity: number
  source: string
  message: string
  code: string
}

function toLspDiagnostics(diagnostics: Diagnostic[]): LspDiagnostic[] {
  return diagnostics.map((d) => ({
    range: {
      start: { line: d.loc.line - 1, character: d.loc.column - 1 },
      end: { line: d.loc.line - 1, character: d.loc.column - 1 + (d.span.end - d.span.start) },
    },
    severity: d.severity === 'error' ? 1 : d.severity === 'warn' ? 2 : 3,
    source: 'pyreon-lint',
    message: d.message,
    code: d.ruleId,
  }))
}

// ─── Lint a document ───────────────────────────────────────────────────────

function lintDocument(uri: string, text: string): LspDiagnostic[] {
  try {
    const filePath = uri.replace('file://', '')
    const result = lintFile(filePath, text, allRules, config, cache)
    return toLspDiagnostics(result.diagnostics)
  } catch {
    // Parse errors, unsupported file types — return empty diagnostics
    return []
  }
}

// ─── Debounce ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 150
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function debounceLint(uri: string, text: string): void {
  const existing = debounceTimers.get(uri)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    uri,
    setTimeout(() => {
      debounceTimers.delete(uri)
      const diagnostics = lintDocument(uri, text)
      sendNotification('textDocument/publishDiagnostics', { uri, diagnostics })
    }, DEBOUNCE_MS),
  )
}

// ─── Message handling ──────────────────────────────────────────────────────

const openDocuments = new Map<string, string>()

function handleMessage(msg: JsonRpcMessage): JsonRpcMessage | null {
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1, // Full sync
          diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
        },
        serverInfo: { name: 'pyreon-lint', version: '0.11.5' },
      },
    }
  }

  if (msg.method === 'initialized') {
    return null // no response needed
  }

  if (msg.method === 'textDocument/didOpen') {
    const { uri, text } = msg.params.textDocument
    openDocuments.set(uri, text)
    const diagnostics = lintDocument(uri, text)
    sendNotification('textDocument/publishDiagnostics', { uri, diagnostics })
    return null
  }

  if (msg.method === 'textDocument/didChange') {
    const uri = msg.params.textDocument.uri
    const text = msg.params.contentChanges[0]?.text
    if (text != null) {
      openDocuments.set(uri, text)
      // Debounce: wait 150ms after last keystroke before linting
      debounceLint(uri, text)
    }
    return null
  }

  if (msg.method === 'textDocument/didSave') {
    const uri = msg.params.textDocument.uri
    const text = openDocuments.get(uri)
    if (text) {
      const diagnostics = lintDocument(uri, text)
      sendNotification('textDocument/publishDiagnostics', { uri, diagnostics })
    }
    return null
  }

  if (msg.method === 'textDocument/didClose') {
    const uri = msg.params.textDocument.uri
    openDocuments.delete(uri)
    sendNotification('textDocument/publishDiagnostics', { uri, diagnostics: [] })
    return null
  }

  if (msg.method === 'shutdown') {
    return { jsonrpc: '2.0', id: msg.id, result: null }
  }

  if (msg.method === 'exit') {
    process.exit(0)
  }

  // Unknown method
  if (msg.id != null) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: null,
    }
  }

  return null
}

// ─── JSON-RPC transport (stdin/stdout) ─────────────────────────────────────

function sendMessage(msg: JsonRpcMessage) {
  const body = JSON.stringify(msg)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}

function sendNotification(method: string, params: any) {
  sendMessage({ jsonrpc: '2.0', method, params })
}

/**
 * Start the LSP server. Reads JSON-RPC messages from stdin,
 * processes them, and writes responses to stdout.
 */
export function startLspServer(): void {
  let buffer = ''

  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk

    // Parse Content-Length header + body
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
        const msg = JSON.parse(body) as JsonRpcMessage
        const response = handleMessage(msg)
        if (response) sendMessage(response)
      } catch {
        // malformed JSON — ignore
      }
    }
  })

  process.stderr.write('[pyreon-lint] LSP server started\n')
}

// @ts-check
/**
 * VS Code extension for Pyreon Lint.
 *
 * Starts the pyreon-lint LSP server as a child process and connects
 * VS Code's language client to it via stdin/stdout JSON-RPC.
 *
 * Install: copy this folder to ~/.vscode/extensions/pyreon-lint
 * or package with `vsce package` for marketplace distribution.
 */

const { LanguageClient, TransportKind } = require('vscode-languageclient/node')
const path = require('node:path')

/** @type {import('vscode-languageclient/node').LanguageClient | undefined} */
let client

function activate(context) {
  const config = require('vscode').workspace.getConfiguration('pyreonLint')
  if (!config.get('enable', true)) return

  // Find the pyreon-lint binary — either global or local node_modules
  const serverModule = findServer()
  if (!serverModule) {
    require('vscode').window.showWarningMessage(
      'Pyreon Lint: Could not find pyreon-lint. Run `bun add -d @pyreon/lint`.',
    )
    return
  }

  /** @type {import('vscode-languageclient/node').ServerOptions} */
  const serverOptions = {
    run: { module: serverModule, args: ['--lsp'], transport: TransportKind.stdio },
    debug: { module: serverModule, args: ['--lsp'], transport: TransportKind.stdio },
  }

  /** @type {import('vscode-languageclient/node').LanguageClientOptions} */
  const clientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
  }

  client = new LanguageClient(
    'pyreonLint',
    'Pyreon Lint',
    serverOptions,
    clientOptions,
  )

  client.start()
}

function deactivate() {
  if (client) return client.stop()
}

/**
 * Find the pyreon-lint CLI entry point.
 * Tries local node_modules first, then global.
 */
function findServer() {
  const vscode = require('vscode')
  const folders = vscode.workspace.workspaceFolders
  if (folders && folders.length > 0) {
    const local = path.join(
      folders[0].uri.fsPath,
      'node_modules',
      '@pyreon',
      'lint',
      'lib',
      'cli.js',
    )
    try {
      require('node:fs').accessSync(local)
      return local
    } catch {
      // not found locally
    }
  }

  // Fallback: try to resolve globally
  try {
    return require.resolve('@pyreon/lint/cli')
  } catch {
    return undefined
  }
}

module.exports = { activate, deactivate }

/**
 * `pyreon mcp [args]` — launch the Pyreon MCP server.
 *
 * A thin, dependency-free delegator: it `npx`-runs `@pyreon/mcp` (the stdio
 * Model-Context-Protocol server that serves Pyreon's API reference, pattern
 * catalog, `validate`, `diagnose`, etc. to AI coding assistants). Any extra
 * args pass straight through to the server.
 *
 * Deliberately WITHOUT `@latest`: `npx @pyreon/mcp` prefers the
 * project-local `@pyreon/mcp` when it's installed, so the served API
 * reference matches YOUR installed Pyreon version — and only fetches it on
 * demand when the project doesn't have it. That version-consistency is the
 * whole reason `pyreon mcp` beats a separately-remembered `npx @pyreon/mcp`.
 *
 * The point is discoverability + a single front door: `pyreon mcp` sits next
 * to `pyreon new` / `pyreon add` / `pyreon doctor` instead of a
 * separately-remembered package invocation.
 */
import { execFileSync } from 'node:child_process'

export interface McpOptions {
  /** Args after `mcp`, with `--dry-run` already extracted. */
  args: string[]
  dryRun: boolean
}

/** The `npx` argv that launches the MCP server. Pure — unit-testable. */
export function buildMcpArgs(args: string[]): string[] {
  // No `@latest` — prefer the project-local @pyreon/mcp (version-consistent
  // API reference); npx fetches it on demand when it isn't installed.
  return ['--yes', '@pyreon/mcp', ...args]
}

export function runMcp(opts: McpOptions): number {
  const npxArgs = buildMcpArgs(opts.args)
  if (opts.dryRun) {
    console.log(`npx ${npxArgs.join(' ')}`)
    return 0
  }
  try {
    // Inherit stdio: the MCP server speaks the protocol over stdin/stdout, so
    // the AI client that spawned `pyreon mcp` talks to it directly. This
    // blocks for the life of the server (until the client disconnects).
    execFileSync('npx', npxArgs, { stdio: 'inherit' })
    return 0
  } catch (err) {
    const status = (err as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}

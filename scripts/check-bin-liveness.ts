#!/usr/bin/env bun
/**
 * check-bin-liveness — CI gate against the "published CLI is a silent no-op"
 * bug class.
 *
 * A published bin can look fine (builds, ships, exits 0) while executing
 * NOTHING — e.g. `bin/x.js` does `import('../lib/x.js')` with no call, and the
 * bundler tree-shook the `if (import.meta.main) main()` guard out of the lib
 * (that shipped in @pyreon/lint 0.43.x — `npx pyreon-lint` ran nothing), or the
 * bin relies on `import.meta.main`, which is `undefined` on Node 20/22 LTS.
 *
 * This gate spawns each published bin the way a user would (real Node, from the
 * built `lib/`) and asserts it actually DOES something. Requires `lib/` built
 * (run after bootstrap). Exits non-zero and NAMES every dead bin.
 *
 * NOTE: uses `node`, not `bun`, on purpose — the failure mode is Node-runtime
 * specific (`import.meta.main` semantics differ from Bun). Testing under Bun
 * would mask exactly the bug we are guarding against.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type Result = { name: string; ok: boolean; detail: string }

/** Spawn `node <bin> <args>` and require exit 0 + non-empty stdout. */
function checkFlagBin(name: string, binRel: string, args: string[]): Result {
  const bin = join(repoRoot, binRel)
  if (!existsSync(bin)) return { name, ok: false, detail: `bin missing: ${binRel} (build lib/ first?)` }
  const r = spawnSync('node', [bin, ...args], { encoding: 'utf8', timeout: 30_000 })
  const out = (r.stdout ?? '').trim()
  if (r.status !== 0) return { name, ok: false, detail: `exit ${r.status}; stderr: ${(r.stderr ?? '').slice(0, 200)}` }
  if (out.length === 0) {
    return { name, ok: false, detail: `exit 0 but EMPTY stdout — the no-op bug shape (bin ran nothing)` }
  }
  return { name, ok: true, detail: `${args.join(' ')} → ${out.split('\n')[0].slice(0, 60)}` }
}

/** Spawn an MCP stdio server, send a JSON-RPC `initialize`, require a response. */
function checkMcpBin(name: string, binRel: string): Promise<Result> {
  const bin = join(repoRoot, binRel)
  if (!existsSync(bin)) return Promise.resolve({ name, ok: false, detail: `bin missing: ${binRel}` })
  return new Promise<Result>((res) => {
    const child = spawn('node', [bin], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let settled = false
    const done = (ok: boolean, detail: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      res({ name, ok, detail })
    }
    const timer = setTimeout(
      () => done(false, 'no JSON-RPC response within 8s — server never started (no-op / dead bin)'),
      8_000,
    )
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString()
      // A successful `initialize` returns a result with our id.
      if (/"id"\s*:\s*1\b/.test(stdout) && /"result"/.test(stdout)) {
        done(true, 'responded to initialize (server alive)')
      }
    })
    child.on('exit', (code) => done(false, `exited early (code ${code}) with no initialize response`))
    child.on('error', (e) => done(false, `spawn error: ${e.message}`))
    const initialize = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'liveness', version: '0' } },
    })
    child.stdin.write(`${initialize}\n`)
  })
}

const results: Result[] = [
  checkFlagBin('@pyreon/cli (pyreon)', 'packages/tools/cli/lib/index.js', ['--version']),
  checkFlagBin('@pyreon/lint (pyreon-lint)', 'packages/tools/lint/bin/pyreon-lint.js', ['--help']),
  await checkMcpBin('@pyreon/mcp (pyreon-mcp)', 'packages/tools/mcp/lib/index.js'),
]

const dead = results.filter((r) => !r.ok)
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(28)} ${r.detail}`)
}
if (dead.length > 0) {
  console.error(`\n[check-bin-liveness] ${dead.length} dead bin(s): ${dead.map((d) => d.name).join(', ')}`)
  process.exit(1)
}
console.log(`\n[check-bin-liveness] all ${results.length} published bins are alive`)

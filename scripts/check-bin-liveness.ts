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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type Result = { name: string; ok: boolean; detail: string }

/**
 * Spawn `node <bin> <args>` and require an allowed exit code + non-empty
 * output. `okExits` defaults to [0]; scaffolders that print usage-then-exit-1
 * on `--help` pass their own (liveness = it RAN, not that --help is exit 0).
 * Output is stdout by default; `stderrOk` also accepts usage printed to
 * stderr — but ONLY when the exit code is in `okExits`, so a crashing bin
 * (ERR_MODULE_NOT_FOUND traceback on stderr, exit 1) still fails for bins
 * whose contract is exit 0.
 */
function checkFlagBin(
  name: string,
  binRel: string,
  args: string[],
  opts: { okExits?: number[]; stderrOk?: boolean } = {},
): Result {
  const okExits = opts.okExits ?? [0]
  const bin = join(repoRoot, binRel)
  if (!existsSync(bin)) return { name, ok: false, detail: `bin missing: ${binRel} (build lib/ first?)` }
  const r = spawnSync('node', [bin, ...args], { encoding: 'utf8', timeout: 30_000 })
  const out = ((r.stdout ?? '') + (opts.stderrOk ? (r.stderr ?? '') : '')).trim()
  if (!okExits.includes(r.status ?? -1)) {
    return { name, ok: false, detail: `exit ${r.status}; stderr: ${(r.stderr ?? '').slice(0, 200)}` }
  }
  if (out.length === 0) {
    return { name, ok: false, detail: `exit ${r.status} but EMPTY output — the no-op bug shape (bin ran nothing)` }
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

// EVERY published bin. Adding a new package with a `bin`? Add it here —
// the drift check below fails the gate if a published bin is not covered.
// ── Policy per bin TARGET path, discovery from the manifests ────────────────
//
// The work list is DERIVED: every published (non-private) package's `bin` map
// is read and each target path must have a policy here — a bin with no
// policy fails by construction, and a policy whose bin no package declares
// fails too. The former hand-written table was keyed on the PACKAGE, so a
// second bin added to an already-covered package (create-zero ships two) was
// never spawned and never noticed: the drift guard asked "is the package
// listed?", not "is every bin it declares checked?".
type Policy = { kind: 'flag'; args: string[]; okExits?: number[]; stderrOk?: boolean } | { kind: 'mcp' }
const BIN_POLICY: Record<string, Policy> = {
  'packages/tools/cli/lib/index.js': { kind: 'flag', args: ['--version'] },
  'packages/tools/lint/bin/pyreon-lint.js': { kind: 'flag', args: ['--help'] },
  'packages/tools/atlas/bin/atlas.js': { kind: 'flag', args: ['--help'] },
  'packages/tools/loom/bin/loom.js': { kind: 'flag', args: ['--help'] },
  'packages/tools/lathe/bin/lathe.js': { kind: 'flag', args: ['--help'] },
  'packages/tools/mcp/lib/index.js': { kind: 'mcp' },
  'packages/zero/cli/bin/zero.js': { kind: 'flag', args: ['--help'] },
  'packages/zero/create-zero/bin/create-zero.js': { kind: 'flag', args: ['--help'] },
  'packages/zero/create-zero/bin/create-pyreon-app.js': { kind: 'flag', args: ['--help'] },
  // Was special-cased as "exits 1 to stderr on --help — that IS the liveness
  // signal", which ENCODED the bug: asking for help is a successful request,
  // and every other published Pyreon bin already exits 0 on stdout. Held to
  // the same bar, so a regression to the old behaviour fails.
  'packages/zero/create-multiplatform/bin/create-multiplatform.js': { kind: 'flag', args: ['--help'] },
  // The scaffolded native builds invoke this via `npx pyreon-native build …`
  // (scripts/build-ios.sh / build-android.sh), so NODE is the runtime that has
  // to work — and the bin previously pointed at `src/cli.ts`, which node
  // cannot execute (extensionless relative imports fail ESM resolution even on
  // Node 26's type-stripping path). Spawning it here is what proves the
  // published entry actually runs.
  'packages/native/cli/bin/pyreon-native.js': { kind: 'flag', args: ['--help'] },
}

/** Every `<name> → repo-relative target path` a published package declares. */
export function declaredBins(packagesRoot: string): Array<{ pkg: string; name: string; target: string }> {
  const out: Array<{ pkg: string; name: string; target: string }> = []
  for (const cat of readdirSync(packagesRoot)) {
    let pkgs: string[] = []
    try {
      pkgs = readdirSync(join(packagesRoot, cat))
    } catch {
      continue
    }
    for (const pkg of pkgs) {
      const pj = join(packagesRoot, cat, pkg, 'package.json')
      if (!existsSync(pj)) continue
      const manifest = JSON.parse(readFileSync(pj, 'utf8')) as {
        name?: string
        bin?: string | Record<string, string>
        private?: boolean
      }
      if (manifest.private || !manifest.bin) continue
      const rel = `packages/${cat}/${pkg}`
      const entries: Array<[string, string]> =
        typeof manifest.bin === 'string'
          ? [[manifest.name ?? pkg, manifest.bin]]
          : Object.entries(manifest.bin)
      for (const [name, target] of entries) {
        out.push({ pkg: manifest.name ?? rel, name, target: posix.normalize(`${rel}/${target}`) })
      }
    }
  }
  return out
}

const bins = declaredBins(join(repoRoot, 'packages'))
const results: Result[] = []
for (const b of bins) {
  const label = `${b.pkg} (${b.name})`
  const policy = BIN_POLICY[b.target]
  if (policy === undefined) {
    results.push({ name: label, ok: false, detail: `declares bin ${b.target} with NO liveness policy — add it to BIN_POLICY` })
  } else if (policy.kind === 'mcp') {
    results.push(await checkMcpBin(label, b.target))
  } else {
    results.push(checkFlagBin(label, b.target, policy.args, { okExits: policy.okExits, stderrOk: policy.stderrOk }))
  }
}
// The other direction: a policy for a bin no package declares is a dead
// table row that would mask a renamed/removed bin.
const declaredTargets = new Set(bins.map((b) => b.target))
for (const target of Object.keys(BIN_POLICY)) {
  if (!declaredTargets.has(target)) {
    results.push({ name: target, ok: false, detail: 'BIN_POLICY entry for a bin NO published package declares — remove or fix the path' })
  }
}

const dead = results.filter((r) => !r.ok)
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(28)} ${r.detail}`)
}
if (dead.length > 0) {
  console.error(`\n[check-bin-liveness] ${dead.length} dead bin(s): ${dead.map((d) => d.name).join(', ')}`)
  process.exit(1)
}
console.log(`\n[check-bin-liveness] all ${results.length} published bins are alive`)

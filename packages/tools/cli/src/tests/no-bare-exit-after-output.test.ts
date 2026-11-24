/**
 * The class lock for #4799: no Pyreon command calls a bare `process.exit(…)`
 * once it may have printed.
 *
 * On a pipe stdout and stderr are written asynchronously (macOS, Node and
 * Bun), and `process.exit` drops whatever is still queued: `pyreon doctor --ci
 * --json | jq` received 64 KiB of a 130 KiB report. A command exits through
 * `exitAfterFlush` (`@pyreon/ansi`; the hand-written bins get it re-exported
 * from their own `lib/`), sets `process.exitCode` and returns, or exits from
 * the callback of its last write.
 *
 * What is scanned is DERIVED, not listed: every published package's `bin`
 * targets, the `lib/` entries they import (read as their `src/` sources), and
 * every module those reach through relative imports (static and dynamic), plus
 * `@pyreon/ansi`, which every bin bundles. A new bin or command module is
 * covered the day it is added. Every remaining bare call is listed below with
 * the reason it cannot lose output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..', '..', '..')

/** `file` → why its bare `process.exit` calls cannot drop output. */
const ALLOWED_FILES: Record<string, string> = {
  'packages/zero/create-zero/src/prompts.ts':
    'interactive cancellation: one short `p.cancel` line, which libuv writes synchronously (only the part past a full pipe buffer is queued); the prompt tests mock `process.exit` to assert each abort',
  'packages/tools/lint/src/lsp/index.ts':
    "the LSP `exit` notification: the client sends it only after it has received the `shutdown` response, so nothing is queued",
}

/** Exact line text → why it is safe. */
const ALLOWED_LINES: Record<string, string> = {
  "if (error?.code === 'EPIPE') process.exit(0)": 'the reader closed the pipe (`| head`): nothing more can be delivered',
  '`process.exit(0)`,':
    "atlas's rescan child script (generated source): it writes the catalog to a file, never to stdout, then exits",
}

interface Pkg {
  dir: string
  bins: string[]
}

function publishedBins(): Pkg[] {
  const out: Pkg[] = []
  for (const group of readdirSync(join(ROOT, 'packages'))) {
    const groupDir = join(ROOT, 'packages', group)
    if (!existsSync(groupDir)) continue
    for (const name of readdirSync(groupDir)) {
      const manifest = join(groupDir, name, 'package.json')
      if (!existsSync(manifest)) continue
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { private?: boolean; bin?: string | Record<string, string> }
      if (pkg.private || !pkg.bin) continue
      const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin)
      out.push({ dir: join(groupDir, name), bins: bins.map((b) => join(groupDir, name, b)) })
    }
  }

  return out
}

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.mjs']

/** A built `lib/x.js` is read as its `src/x.ts`; a relative source import gets its extension. */
function toSource(pkgDir: string, file: string): string | undefined {
  const rel = relative(pkgDir, file)
  const candidates = rel.startsWith('lib/')
    ? SOURCE_EXT.map((ext) => join(pkgDir, 'src', rel.slice(4).replace(/\.(js|mjs)$/, '')) + ext)
    : [file, ...SOURCE_EXT.map((ext) => file.replace(/\.(js|mjs)$/, '') + ext), ...SOURCE_EXT.map((ext) => join(file, `index${ext}`))]

  return candidates.find((c) => existsSync(c) && statSync(c).isFile())
}

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g

/** Every file a bin reaches through relative imports inside its package, tests excluded. */
function reachable(pkg: Pkg): Set<string> {
  const seen = new Set<string>()
  const queue = pkg.bins.map((b) => toSource(pkg.dir, b) ?? b)
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file) || /\/(tests?|__tests__)\/|\.test\.[jt]sx?$/.test(file)) continue
    seen.add(file)
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const target = toSource(pkg.dir, resolve(dirname(file), m[1] as string))
      if (target && target.startsWith(pkg.dir)) queue.push(target)
    }
  }

  return seen
}

function scannedFiles(): string[] {
  const files = new Set<string>()
  for (const pkg of publishedBins()) for (const f of reachable(pkg)) files.add(f)
  const ansi = join(ROOT, 'packages/internals/ansi/src')
  for (const f of readdirSync(ansi)) if (f.endsWith('.ts')) files.add(join(ansi, f))

  return [...files]
}

describe('no bare process.exit after output in any command (#4799)', () => {
  const files = scannedFiles()

  it('derives the scan from every published bin and reaches its command modules', () => {
    const rel = files.map((f) => relative(ROOT, f))
    for (const expected of [
      'packages/tools/cli/bin/pyreon.js',
      'packages/tools/cli/src/index.ts',
      'packages/tools/cli/src/doctor.ts',
      'packages/tools/lint/src/cli.ts',
      'packages/zero/cli/src/commands/doctor.ts',
      'packages/zero/create-zero/src/prompts.ts',
      'packages/tools/mcp/src/index.ts',
      'packages/native/cli/src/cli.ts',
      'packages/internals/ansi/src/interrupt.ts',
    ]) {
      expect(rel).toContain(expected)
    }
  })

  it('every process.exit call is a flushed exit or listed with its reason', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(ROOT, file)
      if (rel in ALLOWED_FILES || rel === 'packages/internals/ansi/src/exit.ts') continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.trim()
          if (!code.includes('process.exit(')) return
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
          if (code in ALLOWED_LINES) return
          // Exiting from the callback of the last write waits for that write.
          if (/\.write\(.*,\s*\(\)\s*=>\s*process\.exit\(/.test(code) || /^\(\)\s*=>\s*process\.exit\(/.test(code)) return
          offenders.push(`${rel}:${i + 1}  ${code}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('the allowlist has no stale entries', () => {
    for (const file of Object.keys(ALLOWED_FILES)) {
      expect(files.map((f) => relative(ROOT, f))).toContain(file)
      expect(readFileSync(join(ROOT, file), 'utf8')).toContain('process.exit(')
    }
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    for (const line of Object.keys(ALLOWED_LINES)) expect(all).toContain(line)
  })
})

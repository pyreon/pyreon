// Every bounded command in CI must run under GNU `timeout`, through `scripts/gnu-timeout.sh`.
//
// ## Why this gate exists
//
// GNU `timeout` signals the command's whole process group at the deadline. Ubuntu 26.04 replaced it with the uutils
// rewrite, which signals only the direct child (measured in containers: 24.04's GNU 9.4 kills a grandchild, 26.04's
// uutils 0.10.0 does not). Two consequences, both shipped:
//   - `scripts/install-playwright.sh` could no longer kill a hung `apt` under `playwright install-deps`, so dpkg's lock
//     stayed held (#3961 fixed that one script);
//   - the docs build's `timeout 10m bun install | tee install.log` stopped ending at 10 minutes — a surviving
//     grandchild holds the pipe open, so `tee` never sees EOF — and ran to the job's 30-minute kill, which uploads no
//     logs. Build Docs went red on main and every PR with nothing to read.
//
// The second was the first bug in a different file. A fix applied to one call site is folklore, so this states the
// invariant for the whole repo: no bare `timeout` command. Use `bash scripts/gnu-timeout.sh …`, or — where a script
// already resolves GNU itself (`install-playwright.sh`) — a `$TIMEOUT` it set from a `--version` probe.
//
// Static and line-based, like `check-workflow-shell-order`: it runs in `validate-fast` in milliseconds.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPO = join(import.meta.dirname, '..')

/** The resolver is the one place that may name `timeout` directly. */
const RESOLVER = 'scripts/gnu-timeout.sh'

export interface Finding {
  readonly file: string
  readonly line: number
  readonly text: string
}

// `timeout` in COMMAND position: at the start of a command (line start, or after a separator / `sudo` / `exec` /
// `then` / `do` / `$(`), followed by an argument. A word inside a message or a `timeout-minutes:` key does not match.
const BARE_TIMEOUT = /(?:^|[;&|(]|\$\(|\b(?:sudo|exec|then|do|else|nice|env)\s+)\s*timeout(?=\s+\S)/

/** Bare `timeout` commands in one file's text. Pure — unit-tested. */
export function findBareTimeouts(file: string, text: string): Finding[] {
  if (file === RESOLVER) return []
  const out: Finding[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const code = raw.replace(/^\s*#.*$/, '').replace(/\s#\s.*$/, '')
    if (!BARE_TIMEOUT.test(code)) continue
    // Probing which `timeout` this is, to resolve GNU, is how a resolver works.
    if (/\btimeout\s+--version\b/.test(code)) continue
    out.push({ file, line: i + 1, text: raw.trim() })
  }
  return out
}

function walk(dir: string, accept: (path: string) => boolean, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.git') && name !== '.github') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, accept, out)
    else if (accept(path)) out.push(path)
  }
}

/** Workflows, composite actions and shell scripts — every place CI runs a shell command. */
export function scannedFiles(repo = REPO): string[] {
  const out: string[] = []
  walk(join(repo, '.github'), (p) => /\.ya?ml$/.test(p), out)
  walk(join(repo, 'scripts'), (p) => p.endsWith('.sh'), out)
  return out.sort()
}

function main(): void {
  const files = scannedFiles()
  if (files.length === 0) {
    console.error('[check-gnu-timeout] scanned NO files — the scan is broken, not clean')
    process.exit(1)
  }
  const findings = files.flatMap((f) => findBareTimeouts(relative(REPO, f), readFileSync(f, 'utf8')))
  if (findings.length === 0) {
    console.log(`[check-gnu-timeout] OK — ${files.length} files, every bounded command runs under GNU timeout`)
    return
  }
  console.error('[check-gnu-timeout] bare `timeout` — on Ubuntu 26.04 it cannot kill a process group:')
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.text}`)
  console.error('Fix: `bash scripts/gnu-timeout.sh <timeout args> <command>` (see that file for why).')
  process.exit(1)
}

if (import.meta.main) main()

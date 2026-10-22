/**
 * Contract for `scripts/check-gnu-timeout.ts`.
 *
 * On Ubuntu 26.04 a bare `timeout` is the uutils rewrite, which cannot kill a process group: the docs build's
 * `timeout 10m bun install | tee …` ran to the job's 30-minute kill with no logs instead of failing at 10 minutes.
 * The gate must report a bare `timeout` COMMAND anywhere CI runs one, and must not report the word in prose, a
 * `timeout-minutes:` key, a `--version` probe, or the resolver itself.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBareTimeouts, scannedFiles } from '../../../../../scripts/check-gnu-timeout'

const RESOLVER = join(import.meta.dirname, '../../../../../scripts/gnu-timeout.sh')

/**
 * Run the resolver with stub `timeout` / `gnutimeout` on PATH. Each stub records which one ran, with its arguments,
 * to a FILE: captured stdout from a spawned process is not reliable under parallel test load.
 */
function resolve(timeoutFlavor: 'gnu' | 'uutils', withGnutimeout: boolean): string {
  const bin = mkdtempSync(join(tmpdir(), 'gnu-timeout-'))
  const stub = (name: string, version: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\nif [ "$1" = --version ]; then echo '${version}'; exit 0; fi\necho "${name} $*" > "${join(bin, 'ran')}"\n`)
    chmodSync(join(bin, name), 0o755)
  }
  stub('timeout', timeoutFlavor === 'gnu' ? 'timeout (GNU coreutils) 9.4' : 'timeout (uutils coreutils) 0.10.0')
  if (withGnutimeout) stub('gnutimeout', 'timeout (GNU coreutils) 9.7')
  const r = spawnSync('/bin/bash', [RESOLVER, '--signal=KILL', '10m', 'bun', 'install'], {
    env: { PATH: `${bin}:/usr/bin:/bin` },
    encoding: 'utf8',
  })
  expect(r.status).toBe(0)
  return readFileSync(join(bin, 'ran'), 'utf8').trim()
}

describe('gnu-timeout.sh — runs GNU timeout whatever the image calls it', () => {
  it('uses the system `timeout` when it is GNU', () => {
    expect(resolve('gnu', true)).toBe('timeout --signal=KILL 10m bun install')
  })

  it('uses `gnutimeout` when the system `timeout` is the uutils rewrite (Ubuntu 26.04)', () => {
    expect(resolve('uutils', true)).toBe('gnutimeout --signal=KILL 10m bun install')
  })

  it('falls back to the system `timeout` when no GNU one exists', () => {
    expect(resolve('uutils', false)).toBe('timeout --signal=KILL 10m bun install')
  })
})

const lines = (file: string, text: string) => findBareTimeouts(file, text).map((f) => f.line)

describe('findBareTimeouts — reports a bare timeout command', () => {
  it('the shipped docs.yml line', () => {
    const yml = ['      run: |', '          timeout --verbose --signal=KILL 10m bun install --frozen-lockfile 2>&1 | tee x.log'].join('\n')
    expect(lines('.github/workflows/docs.yml', yml)).toEqual([2])
  })

  it.each([
    ['sudo', 'sudo timeout --signal=KILL 60s dpkg --configure -a'],
    ['after &&', 'cd docs && timeout 8m bunx vite build'],
    ['in a subshell', 'out=$(timeout 5s curl -s x)'],
    ['after then', 'if true; then timeout 1s sleep 2; fi'],
    ['after exec', 'exec timeout 1s sleep 2'],
  ])('%s', (_label, text) => {
    expect(lines('scripts/x.sh', text)).toEqual([1])
  })
})

describe('findBareTimeouts — does not report', () => {
  it.each([
    ['the resolver call', 'bash scripts/gnu-timeout.sh --verbose --signal=KILL 10m bun install'],
    ['a resolved variable', 'sudo "$TIMEOUT" --signal=KILL 60s dpkg --configure -a'],
    ['a --version probe', 'case "$(timeout --version 2>/dev/null)" in'],
    ['a job timeout key', '    timeout-minutes: 25'],
    ['the word in a message', "echo '::warning::GNU timeout not found; a hung apt could outlive its deadline'"],
    ['a comment', '# timeout 10m bun install used to hang here'],
    ['a YAML key with a value', '          timeout: 30'],
  ])('%s', (_label, text) => {
    expect(lines('scripts/x.sh', text)).toEqual([])
  })

  it('the resolver itself', () => {
    expect(lines('scripts/gnu-timeout.sh', 'exec timeout "$@"')).toEqual([])
  })
})

describe('scannedFiles', () => {
  it('covers workflows, composite actions and shell scripts', () => {
    const files = scannedFiles().map((f) => f.replace(/\\/g, '/'))
    expect(files.some((f) => f.endsWith('.github/workflows/docs.yml'))).toBe(true)
    expect(files.some((f) => f.endsWith('.github/actions/setup-pyreon/action.yml'))).toBe(true)
    expect(files.some((f) => f.endsWith('scripts/install-playwright.sh'))).toBe(true)
  })
})

/**
 * `atlas scan`'s TEXT summary leads with a config that could not be used: it
 * explains the missing groups, title and projects below it, so it is printed
 * on stderr before the counts rather than lost in them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../run'

let dir: string
let stdout: string[]
let stderr: string[]
const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-scan-text-'))
  write('package.json', JSON.stringify({ name: 'fixture', private: true, type: 'module' }))
  stdout = []
  stderr = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    stdout.push(String(c))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
    stderr.push(String(c))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('atlas scan text summary', () => {
  it('reports an unusable config on stderr, and still scans', async () => {
    write('atlas.config.ts', 'export default {\n')
    write('src/Badge.tsx', 'export function Badge(props: { label?: string }) { return props.label ?? null }\n')
    await runCli(['scan', dir, '--no-mount', '--no-write'])
    expect(stderr.join('')).toMatch(/atlas: could not load .*atlas\.config\.ts/)
    expect(stdout.join('')).toContain('1 component')
  }, 120_000)
})

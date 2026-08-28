import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plain, type PlainOptions } from '../plain'

/**
 * `pyreon plain` — readiness report + classic → plain codemod.
 *
 * Tests drive `plain()` directly (never a subprocess — see anti-patterns
 * "Subprocess testing as a default") and assert the report classification,
 * the declined-shape histogram, and that `--write` rewrites exactly the
 * convertible files.
 */
let tmp: string
let logs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-plain-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '))
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

const opts = (over: Partial<PlainOptions>): PlainOptions => ({
  paths: [],
  cwd: tmp,
  json: false,
  write: false,
  ...over,
})
const write = (name: string, src: string): string => {
  const p = join(tmp, name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, src, 'utf8')
  return p
}

const CLASSIC = `import { computed, signal } from '@pyreon/reactivity'
const count = signal(0)
const dbl = computed(() => count() * 2)
export const inc = () => { count.set(count() + 1) }
export const read = () => dbl()
`
const MIXED = `import { signal, wrapSignal } from '@pyreon/reactivity'
const ok = signal(1)
const wrapped = signal(2)
export const w = wrapSignal(wrapped, { set: () => {} })
export const r = () => ok()
`
const PLAIN_FILE = `'use plain'
export const a = 1
`

describe('readiness report (dry-run)', () => {
  it('classifies full / partial / already-plain and emits the histogram', async () => {
    write('src/store.ts', CLASSIC)
    write('src/mixed.ts', MIXED)
    write('src/already.ts', PLAIN_FILE)
    write('src/nothing.ts', 'export const x = 1\n')
    const code = await plain(opts({ json: true }))
    expect(code).toBe(0)
    const parsed = JSON.parse(logs.join('\n')) as {
      summary: Record<string, number>
      declinedHistogram: Record<string, number>
      files: Array<{ file: string; status: string }>
    }
    expect(parsed.summary).toMatchObject({
      scanned: 4,
      alreadyPlain: 1,
      full: 1,
      partial: 1,
      nothing: 1,
      written: 0,
    })
    expect(parsed.declinedHistogram['signal-as-value']).toBe(1)
    // 'nothing' files stay out of the per-file list — the report is signal,
    // not an inventory.
    expect(parsed.files.some((f) => f.file.endsWith('nothing.ts'))).toBe(false)
  })

  it('dry-run never writes', async () => {
    const p = write('src/store.ts', CLASSIC)
    await plain(opts({}))
    expect(readFileSync(p, 'utf8')).toBe(CLASSIC)
  })
})

describe('--write', () => {
  it('rewrites convertible files in place; declined bindings stay classic', async () => {
    const full = write('src/store.ts', CLASSIC)
    const mixed = write('src/mixed.ts', MIXED)
    await plain(opts({ write: true }))
    const migrated = readFileSync(full, 'utf8')
    expect(migrated).toContain(`import { state, derived } from '@pyreon/core/plain'`)
    expect(migrated).toContain('let count = state(0)')
    expect(migrated).toContain('count = count + 1')
    const partial = readFileSync(mixed, 'utf8')
    expect(partial).toContain(`let ok = state(1)`)
    expect(partial).toContain(`const wrapped = signal(2)`)
    expect(partial).toContain(`import { signal, wrapSignal } from '@pyreon/reactivity'`)
  })

  it('is idempotent — a second --write run reports already-plain and rewrites nothing', async () => {
    const p = write('src/store.ts', CLASSIC)
    await plain(opts({ write: true }))
    const once = readFileSync(p, 'utf8')
    logs = []
    await plain(opts({ write: true, json: true }))
    const parsed = JSON.parse(logs.join('\n')) as { summary: Record<string, number> }
    expect(parsed.summary['alreadyPlain']).toBe(1)
    expect(parsed.summary['written']).toBe(0)
    expect(readFileSync(p, 'utf8')).toBe(once)
  })
})

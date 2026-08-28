import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * Leak class F — a stale resolution overwriting a fresh one.
 *
 * The catalog lists this class as caught by nothing: "None — audit-time only".
 * It is not a crash and not visible in a heap snapshot; the UI just shows the
 * wrong answer, intermittently, under load.
 *
 * Every "does NOT fire" case is load-bearing. "An async function writes state"
 * describes an enormous amount of correct code, and the precision here came
 * from measuring: the first cut produced 42 findings on this repo, 40 of them
 * in tests and benches that cannot race with themselves, and one on a
 * `Map.set(key, value)` where order genuinely cannot matter.
 */

const RULE = 'pyreon/no-unguarded-async-signal-write'
const SIG = `import { signal } from '@pyreon/reactivity'\n`
const at = (src: string, file = '/proj/src/a.ts') =>
  lintFile(file, src, allRules, { rules: { [RULE]: 'error' } }).diagnostics.length

describe('pyreon/no-unguarded-async-signal-write', () => {
  it('fires on an unguarded write after an await', () => {
    expect(
      at(`${SIG}const data = signal(null)
export async function load(id: string) { const r = await fetch('/x' + id); data.set(await r.json()) }`),
    ).toBe(1)
  })

  it('is quiet when a version counter guards the write', () => {
    expect(
      at(`${SIG}const data = signal(null)
let version = 0
export async function load(id: string) { const v = ++version; const r = await fetch('/x' + id); if (v !== version) return; data.set(await r.json()) }`),
    ).toBe(0)
  })

  it('is quiet when an AbortSignal is forwarded', () => {
    expect(
      at(`${SIG}const data = signal(null)
export async function load(id: string, signal: AbortSignal) { const r = await fetch('/x' + id, { signal }); data.set(await r.json()) }`),
    ).toBe(0)
  })

  it('is quiet for a LOCAL signal — nothing else can observe it', () => {
    expect(
      at(`${SIG}export async function load() { const local = signal(0); await tick(); local.set(1); return local }`),
    ).toBe(0)
  })

  it('is quiet with no await — there is no interleaving to lose', () => {
    expect(at(`${SIG}const data = signal(null)\nexport function load() { data.set(1) }`)).toBe(0)
  })

  it('is quiet on a write BEFORE the await', () => {
    expect(
      at(`${SIG}const busy = signal(false)
export async function load() { busy.set(true); await fetch('/x') }`),
    ).toBe(0)
  })

  it('is quiet on `Map.set(key, value)` — two args, order cannot matter', () => {
    // The router caches lazy components this way; two resolutions write the
    // same value for the same key.
    expect(
      at(`const cache = new Map()
export async function load(rec: object) { const mod = await rec.loader(); cache.set(rec, mod) }`),
    ).toBe(0)
  })

  it('is quiet in a TEST file — a test cannot race with itself', () => {
    expect(
      at(`${SIG}const data = signal(null)
export async function load() { const r = await fetch('/x'); data.set(await r.json()) }`,
        '/proj/src/tests/a.test.ts'),
    ).toBe(0)
  })

  it('is OFF in the shipped presets — a single-shot load cannot race', () => {
    expect(allRules.find((r) => r.meta.id === RULE)?.meta.optIn).toBe(true)
  })
})

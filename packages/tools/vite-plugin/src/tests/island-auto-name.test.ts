/**
 * Tier-3 islands DX — auto-naming unit tests.
 *
 * The derivation contract: `const X = island(…)` in file F gets
 * `X$fnv1a6(relPath(F))` — deterministic, collision-free across files,
 * IDENTICAL in the transform (injects into served code) and the
 * auto-registry prescan (reads raw disk source), so marker and registry
 * can never disagree.
 */
import {
  deriveIslandName as compilerDeriveIslandName,
  fnv1a6 as compilerFnv1a6,
  islandRelPath as compilerIslandRelPath,
} from '@pyreon/compiler'
import { describe, expect, it } from 'vitest'
import { deriveIslandName, fnv1a6, injectIslandNames, islandRelPath } from '../island-auto-name'

const ROOT = '/app'
const FILE = '/app/src/islands.ts'

describe('derivation is single-sourced from @pyreon/compiler (drift lock)', () => {
  it('re-exports ARE the compiler functions — identity, not equivalence', () => {
    // If someone reintroduces a local copy in island-auto-name.ts, these
    // identity assertions fail even when the copy is byte-identical today —
    // that's the point: the derivation must have ONE home, because the
    // project scanner (`generateContext`) derives with the same functions
    // and a re-fork would let marker/registry/context names drift apart.
    expect(deriveIslandName).toBe(compilerDeriveIslandName)
    expect(fnv1a6).toBe(compilerFnv1a6)
    expect(islandRelPath).toBe(compilerIslandRelPath)
  })
})

describe('deriveIslandName', () => {
  it('is deterministic and file-scoped', () => {
    const a = deriveIslandName('Counter', 'src/islands.ts')
    expect(a).toBe(deriveIslandName('Counter', 'src/islands.ts'))
    expect(a).toMatch(/^Counter\$[0-9a-z]{1,6}$/)
    // same binding in a DIFFERENT file → different name (collision-free)
    expect(a).not.toBe(deriveIslandName('Counter', 'src/other.ts'))
  })

  it('fnv1a6 is stable', () => {
    expect(fnv1a6('src/islands.ts')).toBe(fnv1a6('src/islands.ts'))
  })

  it('islandRelPath normalizes to forward slashes', () => {
    expect(islandRelPath('/app', '/app/src/a.ts')).toBe('src/a.ts')
  })
})

describe('injectIslandNames', () => {
  it('injects a derived name into a nameless const-bound call (with options)', () => {
    const code = `export const Counter = island(() => import('./Counter'), { hydrate: 'visible' })`
    const out = injectIslandNames(code, FILE, ROOT)
    expect(out).not.toBeNull()
    const expected = deriveIslandName('Counter', 'src/islands.ts')
    expect(out).toContain(`{ name: ${JSON.stringify(expected)}, hydrate: 'visible' }`)
  })

  it('injects into the no-options form', () => {
    const code = `const Clock = island(() => import('./Clock'))`
    const out = injectIslandNames(code, FILE, ROOT)
    const expected = deriveIslandName('Clock', 'src/islands.ts')
    expect(out).toContain(`, { name: ${JSON.stringify(expected)} })`)
  })

  it('leaves explicit names untouched', () => {
    const code = `const Counter = island(() => import('./Counter'), { name: 'Counter', hydrate: 'load' })`
    expect(injectIslandNames(code, FILE, ROOT)).toBeNull()
  })

  it('leaves bindingless calls untouched (nothing stable to derive from)', () => {
    const code = `render(island(() => import('./X'), { hydrate: 'load' }))`
    expect(injectIslandNames(code, FILE, ROOT)).toBeNull()
  })

  it('handles multiple islands per file, mixed named/nameless', () => {
    const code = [
      `export const A = island(() => import('./A'), { hydrate: 'idle' })`,
      `export const B = island(() => import('./B'), { name: 'PrettyB' })`,
      `export const C = island(() => import('./C'))`,
    ].join('\n')
    const out = injectIslandNames(code, FILE, ROOT)!
    expect(out).toContain(`name: ${JSON.stringify(deriveIslandName('A', 'src/islands.ts'))}`)
    expect(out).toContain(`name: 'PrettyB'`)
    expect(out).toContain(`name: ${JSON.stringify(deriveIslandName('C', 'src/islands.ts'))}`)
  })

  it('returns null for files without island calls', () => {
    expect(injectIslandNames(`export const x = 1`, FILE, ROOT)).toBeNull()
  })
})

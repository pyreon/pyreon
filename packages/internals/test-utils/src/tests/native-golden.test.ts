import { describe, expect, it } from 'vitest'
import {
  collectCorpus,
  compileCorpus,
  diffGolden,
  digestResult,
} from '../../../../../scripts/check-native-golden'

describe('check-native-golden — digest and diff', () => {
  it('hashes code AND warnings, so a lost or added warning is a diff', () => {
    const a = digestResult({ code: 'x', warnings: [] })
    const b = digestResult({ code: 'x', warnings: ['w'] })
    expect(a.sha).not.toBe(b.sha)
    expect(digestResult({ code: 'x', warnings: [] }).sha).toBe(a.sha)
  })

  it('names every entry that changed, was added or was removed', () => {
    const e = (sha: string) => ({ sha, bytes: 1, warnings: 0 })
    const drift = diffGolden({ 'a|swift': e('1'), 'b|swift': e('1') }, { 'a|swift': e('2'), 'c|swift': e('1') })
    expect(drift.map((d) => [d.key, d.kind])).toEqual([
      ['a|swift', 'changed'],
      ['b|swift', 'removed'],
      ['c|swift', 'added'],
    ])
  })

  it('reports nothing when the maps agree', () => {
    const e = { sha: '1', bytes: 1, warnings: 0 }
    expect(diffGolden({ k: e }, { k: e })).toEqual([])
  })
})

describe('check-native-golden — the corpus', () => {
  const corpus = collectCorpus()

  it('covers fixtures, shared examples and the coverage-registry snippets', () => {
    const kinds = new Set(corpus.map((c) => c.key.split(':')[0]))
    expect([...kinds].sort()).toEqual(['example', 'fixture', 'registry'])
    expect(corpus.length).toBeGreaterThan(60)
  })

  it('never feeds the web entry-client bootstraps to PMTC', () => {
    expect(corpus.some((c) => c.key.endsWith('entry-client.tsx'))).toBe(false)
  })

  it('compiles deterministically (two compiles of one source agree)', () => {
    // A representative slice: the full corpus is the gate's job; this proves the determinism check itself works.
    const slice = corpus.filter((c) => c.key.startsWith('fixture:0')).slice(0, 4)
    const compiled = compileCorpus(slice)
    expect(compiled.nondeterministic).toEqual([])
    expect(Object.keys(compiled.digests)).toHaveLength(slice.length * 2)
  })
})

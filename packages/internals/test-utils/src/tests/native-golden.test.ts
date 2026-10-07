import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('covers fixtures, golden-only fixtures, shared examples and the coverage-registry snippets', () => {
    const kinds = new Set(corpus.map((c) => c.key.split(':')[0]))
    expect([...kinds].sort()).toEqual(['example', 'fixture', 'golden-fixture', 'registry'])
    expect(corpus.length).toBeGreaterThan(60)
  })

  it('never feeds the web entry-client bootstraps to PMTC', () => {
    expect(corpus.some((c) => c.key.endsWith('entry-client.tsx'))).toBe(false)
  })

  it('rejects duplicate keys instead of silently keeping the last compile result', () => {
    expect(() => compileCorpus([
      { key: 'fixture:shared', filename: 'first.tsx', source: 'export function A() { return <Text>first</Text> }' },
      { key: 'fixture:shared', filename: 'second.tsx', source: 'export function B() { return <Text>second</Text> }' },
    ])).toThrow(/Duplicate corpus key "fixture:shared".*first\.tsx.*second\.tsx/)
  })

  it('rejects a fixture copied into both compiler and package-owned directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-golden-duplicate-'))
    try {
      for (const path of ['packages/native/compiler/src/fixtures', 'examples']) mkdirSync(join(root, path), { recursive: true })
      for (const path of ['packages/native/compiler/src/golden-fixtures', 'packages/fundamentals/charts/native-golden']) {
        const dir = join(root, path)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'shared.tsx'), 'export function A() { return <Text>x</Text> }')
      }
      expect(() => collectCorpus(root)).toThrow(/Duplicate corpus key "golden-fixture:shared\.tsx"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('compiles deterministically (two compiles of one source agree)', () => {
    // A representative slice: the full corpus is the gate's job; this proves the determinism check itself works.
    const slice = corpus.filter((c) => c.key.startsWith('fixture:0')).slice(0, 4)
    const compiled = compileCorpus(slice)
    expect(compiled.nondeterministic).toEqual([])
    expect(Object.keys(compiled.digests)).toHaveLength(slice.length * 2)
  })
})

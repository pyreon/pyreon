import { describe, expect, it } from 'vitest'
import { createRanker, fuzzyMatch, MAX_QUERY_UNITS, MAX_TEXT_UNITS, prepareQuery, prepareText, rank } from '../core'
import type { MatchRange } from '../core'
import { int, pick, rng } from './rng'

const ranges = (query: string, text: string): MatchRange[] => [...(fuzzyMatch(query, text)?.ranges ?? [])]
const sliced = (text: string, rs: readonly MatchRange[]): string[] => rs.map(([s, e]) => text.slice(s, e))

describe('fuzzyMatch', () => {
  it('matches a subsequence and says where', () => {
    expect(sliced('Project', ranges('prj', 'Project'))).toEqual(['Pr', 'j'])
    expect(fuzzyMatch('xyz', 'Project')).toBeNull()
  })

  it('is case-insensitive in both directions', () => {
    expect(fuzzyMatch('NEW', 'new file')).not.toBeNull()
    expect(fuzzyMatch('new', 'NEW FILE')).not.toBeNull()
    expect(fuzzyMatch('new', 'new file')?.score).toBe(fuzzyMatch('NEW', 'NEW FILE')?.score)
  })

  it('is diacritic-insensitive: "resume" finds "Résumé", and the other way round', () => {
    expect(sliced('Résumé', ranges('resume', 'Résumé'))).toEqual(['Résumé'])
    expect(fuzzyMatch('résumé', 'Resume')).not.toBeNull()
    expect(fuzzyMatch('prehled', 'Přehled zákazníků')).not.toBeNull()
    expect(fuzzyMatch('zakaznik', 'Přehled zákazníků')).not.toBeNull()
  })

  it('folds a decomposed query and text (e + combining acute) to the same thing', () => {
    const decomposed = 'Résumé'
    expect(fuzzyMatch('resume', decomposed)).not.toBeNull()
    expect(fuzzyMatch(decomposed, 'Résumé')).not.toBeNull()
    // the range covers the whole decomposed unit, mark included
    expect(sliced(decomposed, ranges('re', decomposed))).toEqual(['Ré'])
  })

  it('spells out German letters: strasse finds Straße and Größe is found by grosse', () => {
    expect(sliced('Straßenkarte', ranges('strasse', 'Straßenkarte'))).toEqual(['Straße'])
    expect(fuzzyMatch('grosse', 'Größe ändern')).not.toBeNull()
    expect(fuzzyMatch('uber', 'Übersicht')).not.toBeNull()
  })

  it('folds katakana to hiragana and half-width to full-width, but keeps voiced and unvoiced kana apart', () => {
    expect(fuzzyMatch('ゆーざー', 'ユーザー一覧')).not.toBeNull()
    expect(fuzzyMatch('ユーザー', 'ゆーざー')).not.toBeNull()
    expect(fuzzyMatch('ﾕｰｻﾞｰ', 'ユーザー')).not.toBeNull()
    expect(fuzzyMatch('か', 'ガイド')).toBeNull()
    expect(fuzzyMatch('ガ', 'ガイド')).not.toBeNull()
  })

  it('returns ranges in UTF-16 offsets that are right for surrogate pairs and emoji sequences', () => {
    const text = '🎨 Select Theme'
    expect(ranges('🎨', text)).toEqual([[0, 2]])
    expect(sliced(text, ranges('sel', text))).toEqual(['Sel'])
    const family = 'Family 👨‍👩‍👧 Plan'
    expect(sliced(family, ranges('👨‍👩‍👧', family))).toEqual(['👨‍👩‍👧'])
    // a skin-tone modifier is part of its emoji, so the emoji matches itself and never half of itself
    const wave = 'Say 👋🏽 hello'
    const r = ranges('👋🏽', wave)
    expect(sliced(wave, r)).toEqual(['👋🏽'])
    // a flag is one unit
    const flag = 'Region 🇨🇿 Czechia'
    expect(sliced(flag, ranges('🇨🇿', flag))).toEqual(['🇨🇿'])
  })

  it('treats the variation selector of an emoji as nothing: ❤ finds ❤️', () => {
    expect(fuzzyMatch('❤', 'Love ❤️')).not.toBeNull()
  })

  it('matches the words of a query in any order', () => {
    expect(fuzzyMatch('project new', 'New Project')).not.toBeNull()
    expect(fuzzyMatch('push git', 'Git: Push')).not.toBeNull()
    expect(fuzzyMatch('new zzz', 'New Project')).toBeNull()
    expect(sliced('New Project', ranges('project new', 'New Project'))).toEqual(['New', 'Project'])
  })

  it('can be told to treat the query as one phrase', () => {
    expect(fuzzyMatch('project new', 'New Project', { anyOrder: false })).toBeNull()
    expect(fuzzyMatch('new pro', 'New Project', { anyOrder: false })).not.toBeNull()
  })

  it('rewards word starts, humps, consecutive characters and prefixes', () => {
    const s = (q: string, t: string): number => fuzzyMatch(q, t)?.score ?? -Infinity
    expect(s('np', 'New Project')).toBeGreaterThan(s('np', 'Open Panel'))
    expect(s('tb', 'toggleBold')).toBeGreaterThan(s('tb', 'tabulate'))
    expect(s('open', 'Open File')).toBeGreaterThan(s('open', 'Reopen File'))
    expect(s('file', 'File')).toBeGreaterThan(s('file', 'File Explorer'))
    expect(s('sav', 'Save')).toBeGreaterThan(s('sav', 'Disable Autosave Everything'))
  })

  it('finds an acronym: "np" finds New Project first', () => {
    const ranked = rank('np', ['Open Panel', 'New Project', 'Snap Pin'], (t) => t)
    expect(ranked[0]?.item).toBe('New Project')
    expect(sliced('New Project', ranges('np', 'New Project'))).toEqual(['N', 'P'])
  })

  describe('degenerate input', () => {
    it('an empty or blank query matches everything with score 0 and no ranges', () => {
      for (const q of ['', ' ', '\t\n  ']) expect(fuzzyMatch(q, 'anything')).toEqual({ score: 0, ranges: [] })
    })

    it('matches an empty text only with an empty query', () => {
      expect(fuzzyMatch('a', '')).toBeNull()
      expect(fuzzyMatch('', '')).toEqual({ score: 0, ranges: [] })
    })

    it('surrounding and repeated whitespace in the query changes nothing', () => {
      expect(fuzzyMatch('  new   project  ', 'New Project')).toEqual(fuzzyMatch('new project', 'New Project'))
    })

    it('a query longer than the text cannot match, and a very long query is answered at once', () => {
      expect(fuzzyMatch('abcdef', 'abc')).toBeNull()
      const long = 'a'.repeat(100_000)
      const t0 = Date.now()
      expect(fuzzyMatch(long, 'a'.repeat(50))).toBeNull()
      expect(Date.now() - t0).toBeLessThan(500)
    })

    it('cuts a query at MAX_QUERY_UNITS units, so a longer query matches what its first units match', () => {
      const text = 'x'.repeat(MAX_QUERY_UNITS + 40)
      expect(fuzzyMatch('x'.repeat(MAX_QUERY_UNITS + 30), text)).not.toBeNull()
    })

    it('matches only the first MAX_TEXT_UNITS units of a very long text', () => {
      const text = `${'a'.repeat(MAX_TEXT_UNITS)}zzz`
      expect(fuzzyMatch('zzz', text)).toBeNull()
      expect(prepareText(text).truncated).toBe(true)
      expect(fuzzyMatch('aaa', text)).not.toBeNull()
    })

    it('never throws for lone surrogates, lone marks, control characters and NUL', () => {
      for (const t of ['\ud83d', '\ude00', '́', '‍', '️', 'a\u0000b', '‮abc', '\ud83d x', 'é́́'])
        for (const q of ['a', '\ud83d', '́', 'b', '😀', ''])
          expect(() => fuzzyMatch(q, t)).not.toThrow()
    })

    it('handles right-to-left text: Hebrew and Arabic match themselves, and a Latin query does not match them', () => {
      expect(sliced('שלום עולם', ranges('שלום', 'שלום עולם'))).toEqual(['שלום'])
      expect(sliced('مرحبا بالعالم', ranges('مرحبا', 'مرحبا بالعالم'))).toEqual(['مرحبا'])
      expect(fuzzyMatch('abc', 'שלום')).toBeNull()
      // Arabic vowel marks (harakat) are marks of their letter, so a query without them still matches
      expect(fuzzyMatch('مرحبا', 'مَرْحَبًا')).not.toBeNull()
    })
  })

  describe('property tests', () => {
    const letters = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ   -_/0123456789éüřžŠČßøñÅ']
    const text = (r: () => number, n: number): string => Array.from({ length: n }, () => pick(r, letters)).join('')
    const oracle = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/ø/g, 'o')
    const isSubsequence = (needle: string, hay: string): boolean => {
      let i = 0
      for (const ch of hay) if (ch === needle[i]) i++
      return i === needle.length
    }

    it('agrees with a plain subsequence oracle on whether a text matches (3000 random cases)', () => {
      const r = rng(1)
      for (let i = 0; i < 3000; i++) {
        const t = text(r, int(r, 0, 24))
        const q = r() < 0.5 ? text(r, int(r, 1, 5)) : [...t].filter(() => r() < 0.4).join('')
        const words = oracle(q).split(/\s+/u).filter(Boolean)
        const expected = words.every((w) => isSubsequence(w, oracle(t)))
        expect(fuzzyMatch(q, t) !== null, `${JSON.stringify(q)} in ${JSON.stringify(t)}`).toBe(expected)
      }
    })

    it('returns sorted, merged, in-bounds ranges that never split a surrogate pair (2000 random cases)', () => {
      const r = rng(2)
      const pool = [...'abcxyz éÉ-_ 日本語ユーザー😀🎨👨‍👩‍👧🇨🇿'].concat(['é', '👋🏽'])
      for (let i = 0; i < 2000; i++) {
        const t = Array.from({ length: int(r, 0, 20) }, () => pick(r, pool)).join('')
        const q = Array.from({ length: int(r, 1, 4) }, () => pick(r, pool)).join('')
        const m = fuzzyMatch(q, t)
        if (m === null) continue
        let prevEnd = -1
        for (const [s, e] of m.ranges) {
          expect(s).toBeGreaterThanOrEqual(0)
          expect(e).toBeLessThanOrEqual(t.length)
          expect(s).toBeLessThan(e)
          expect(s).toBeGreaterThan(prevEnd) // sorted, and merged: a touching range would have been joined
          prevEnd = e
          const first = t.charCodeAt(s)
          expect(first >= 0xdc00 && first <= 0xdfff, 'starts inside a pair').toBe(false)
          const last = t.charCodeAt(e - 1)
          expect(last >= 0xd800 && last <= 0xdbff, 'ends inside a pair').toBe(false)
        }
      }
    })

    it('every prefix of a matching query matches too (the fact narrowing relies on)', () => {
      const r = rng(3)
      for (let i = 0; i < 2000; i++) {
        const t = text(r, int(r, 1, 24))
        const q = [...t].filter(() => r() < 0.4).join('')
        if (fuzzyMatch(q, t) === null) continue
        for (let n = 0; n <= q.length; n++) expect(fuzzyMatch(q.slice(0, n), t), `${JSON.stringify(q.slice(0, n))} in ${JSON.stringify(t)}`).not.toBeNull()
      }
    })

    it('a text matches itself over its whole length', () => {
      const r = rng(4)
      for (let i = 0; i < 500; i++) {
        const t = text(r, int(r, 1, 20)).trim().replace(/\s+/g, '-')
        if (t === '') continue
        const m = fuzzyMatch(t, t)
        expect(m).not.toBeNull()
        expect(m?.ranges).toEqual([[0, t.length]])
      }
    })

    it('is invariant under case and diacritics of the query', () => {
      const r = rng(5)
      for (let i = 0; i < 1000; i++) {
        const t = text(r, int(r, 1, 20))
        const q = [...t].filter(() => r() < 0.5).join('').replace(/ß|ø/g, 'a')
        if (q.trim() === '') continue
        const base = fuzzyMatch(q, t)
        const upper = fuzzyMatch(q.toUpperCase().replace(/SS/g, 'ss'), t)
        const stripped = fuzzyMatch(q.normalize('NFD').replace(/[̀-ͯ]/g, ''), t)
        expect(upper?.ranges).toEqual(base?.ranges)
        expect(stripped).toEqual(base)
      }
    })

    it('is deterministic: the same inputs give the same answer, every time', () => {
      const r = rng(6)
      for (let i = 0; i < 300; i++) {
        const t = text(r, int(r, 0, 30))
        const q = text(r, int(r, 0, 4))
        const a = JSON.stringify(fuzzyMatch(q, t))
        for (let k = 0; k < 3; k++) expect(JSON.stringify(fuzzyMatch(q, t))).toBe(a)
        expect(JSON.stringify(fuzzyMatch(prepareQuery(q), prepareText(t)))).toBe(a)
      }
    })

    it('fuzz: random Unicode never throws and keeps the range invariants', () => {
      const r = rng(7)
      for (let i = 0; i < 3000; i++) {
        const gen = (n: number): string => String.fromCharCode(...Array.from({ length: n }, () => (r() < 0.2 ? int(r, 0xd800, 0xdfff) : r() < 0.3 ? int(r, 0x300, 0x36f) : int(r, 0, 0xffff))))
        const t = gen(int(r, 0, 12))
        const q = r() < 0.5 ? gen(int(r, 0, 4)) : t.slice(int(r, 0, 3), int(r, 3, 8))
        const m = fuzzyMatch(q, t)
        if (m === null) continue
        for (const [s, e] of m.ranges) {
          expect(s).toBeGreaterThanOrEqual(0)
          expect(e).toBeLessThanOrEqual(t.length)
          expect(s).toBeLessThan(e)
        }
      }
    })
  })
})

describe('rank', () => {
  const items = ['Save', 'Save As…', 'Save All', 'Open File', 'Reopen Closed File']

  it('returns the matches best first, and keeps list order for equal scores', () => {
    const got = rank('save', items, (t) => t).map((r) => r.item)
    expect(got).toEqual(['Save', 'Save As…', 'Save All'])
    const tie = rank('x', ['ax', 'bx', 'cx'], (t) => t)
    expect(tie.map((r) => r.index)).toEqual([0, 1, 2])
  })

  it('is deterministic and does not depend on the history of the call', () => {
    const a = rank('op', items, (t) => t)
    const b = rank('op', items, (t) => t)
    expect(b).toEqual(a)
  })

  it('reports the index, the matched field and the ranges inside that field', () => {
    const rows = [{ title: 'Remove', keywords: ['delete', 'erase'] }, { title: 'Delete forever', keywords: [] as string[] }]
    const got = rank('delete', rows, (r) => [r.title, ...r.keywords])
    expect(got.map((g) => [g.index, g.field])).toEqual([[1, 0], [0, 1]])
    expect(got[1]?.ranges).toEqual([[0, 6]])
    // a keyword match ranks below a title match with the same shape
    expect(got[0]!.score).toBeGreaterThan(got[1]!.score)
  })

  it('applies a limit, a boost and a priority', () => {
    expect(rank('a', ['a1', 'a2', 'a3'], (t) => t, { limit: 2 })).toHaveLength(2)
    const boosted = rank('a', ['a1', 'a2', 'a3'], (t) => t, { boost: (item) => (item === 'a3' ? 100 : 0) })
    expect(boosted[0]?.item).toBe('a3')
    const prio = rank('a', ['a1', 'a2', 'a3'], (t) => t, { priority: (item) => (item === 'a2' ? 1 : 0) })
    expect(prio.map((r) => r.item)).toEqual(['a2', 'a1', 'a3'])
  })

  it('keeps duplicates as separate items (no deduplication by text)', () => {
    const got = rank('save', ['Save', 'Save', 'Save'], (t) => t)
    expect(got.map((r) => r.index)).toEqual([0, 1, 2])
  })

  it('ranks 10,000 items without trouble', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => `Command ${i} ${['open', 'close', 'save', 'toggle'][i % 4]}`)
    const got = rank('cmd 99 sav', many, (t) => t)
    expect(got.length).toBeGreaterThan(0)
    expect(got.every((g, i) => i === 0 || got[i - 1]!.score >= g.score)).toBe(true)
  })
})

describe('createRanker', () => {
  const words = ['open', 'close', 'save', 'toggle', 'format', 'rename', 'delete', 'create', 'reload', 'search']
  const items = Array.from({ length: 800 }, (_, i) => `${words[i % 10]} ${words[(i * 7) % 10]} ${i}`)

  it('narrows: a query that extends the previous one only looks at the previous matches', () => {
    const ranker = createRanker<string>((t) => t)
    ranker.rank('op', items)
    expect(ranker.lastScanned).toBe(items.length)
    const first = ranker.rank('ope', items)
    expect(ranker.lastScanned).toBeLessThan(items.length)
    expect(first.length).toBeGreaterThan(0)
  })

  it('gives exactly the same answer as a fresh rank, for every step of a typing session (differential)', () => {
    const r = rng(8)
    for (let session = 0; session < 60; session++) {
      const ranker = createRanker<string>((t) => t)
      let query = ''
      for (let step = 0; step < 8; step++) {
        const move = r()
        if (move < 0.7) query += pick(r, [...'abcdefghijklmnoprstu ']) // type
        else if (move < 0.85) query = query.slice(0, -1) // backspace
        else query = '' // clear
        expect(ranker.rank(query, items)).toEqual(rank(query, items, (t) => t))
      }
    }
  })

  it('does not narrow across a different list, different options, or after a reset', () => {
    const ranker = createRanker<string>((t) => t)
    ranker.rank('ope', items)
    ranker.rank('open', [...items])
    expect(ranker.lastScanned).toBe(items.length)
    ranker.rank('open', items)
    ranker.rank('openz', items, { anyOrder: false })
    expect(ranker.lastScanned).toBe(items.length)
    ranker.reset()
    ranker.rank('openz', items)
    expect(ranker.lastScanned).toBe(items.length)
  })

  it('reads the text of an item once per candidate and caches the prepared text (bounded)', () => {
    let reads = 0
    const ranker = createRanker<string>((t) => {
      reads++
      return t
    }, { cacheSize: 50 })
    ranker.rank('o', items)
    expect(reads).toBe(items.length)
    // a cache of 50 entries over 800 distinct texts still answers correctly
    expect(ranker.rank('open', items)).toEqual(rank('open', items, (t) => t))
  })
})

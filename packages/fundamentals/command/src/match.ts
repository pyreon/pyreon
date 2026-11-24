/**
 * The fuzzy matcher. Pure, with no dependencies.
 *
 * A text is split into UNITS (a code point plus the marks, joiners and variation selectors that belong to it, so an
 * emoji sequence or "e" + combining acute is one unit). Each unit has a FOLDED KEY: Unicode compatibility decomposed,
 * Latin/Greek/Cyrillic combining marks removed, lower-cased, katakana folded to hiragana, a few letters spelled out
 * (ß to ss). A query matches when its units occur in order in the text's units with equal keys (a subsequence). The
 * alignment with the best score wins, and the ranges come back as UTF-16 offsets into the original text, so highlighting
 * is right for any script. Typo tolerance is NOT part of v0.
 */

/** A half-open `[start, end)` range of UTF-16 offsets into the text that was matched. */
export type MatchRange = readonly [start: number, end: number]

export interface FuzzyMatch {
  /** Higher is better. Comparable only between matches of the same query. */
  score: number
  /** Sorted, non-overlapping, merged ranges of the matched text, for highlighting. Empty for an empty query. */
  ranges: readonly MatchRange[]
}

export interface FuzzyMatchOptions {
  /** Words of a query (split on whitespace) match in any order. Default `true`; `false` treats the query as one word. */
  anyOrder?: boolean
}

// ---------------------------------------------------------------- constants

const MATCH = 16
const CONSECUTIVE = 10
const WORD_START = 12
const HUMP = 9
const TEXT_START = 6
const GAP_OPEN = -4
const GAP_EXTEND = -1
const PREFIX = 14
const EXACT = 40
const NEG = -1_000_000

/** Texts longer than this many units are matched on their first units only. */
export const MAX_TEXT_UNITS = 512
/** Queries longer than this many units are cut. */
export const MAX_QUERY_UNITS = 128
/** Words of a query beyond this many are ignored. */
export const MAX_QUERY_WORDS = 8

// ---------------------------------------------------------------- folding

// Marks that are removed when comparing: accents, Hebrew points and Arabic vowel marks (usually left out when typing), and the
// emoji variation selectors. Marks that change the letter (kana voicing, Indic signs) are kept.
const STRIPPED: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x0591, 0x05c7],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe0e, 0xfe0f],
  [0xfe20, 0xfe2f],
]

function stripMarks(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number
    if (cp < 0x300 || !STRIPPED.some(([lo, hi]) => cp >= lo && cp <= hi)) out += ch
  }

  return out
}

const SPECIAL: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
  ı: 'i',
  ð: 'd',
  þ: 'th',
  ς: 'σ',
}

/** The folded keys of one unit: almost always one; a few letters spell out as several (ß is s, s). */
function foldUnit(unit: string): string[] {
  const code = unit.charCodeAt(0)
  if (unit.length === 1 && code < 128) {
    // ASCII fast path: lower-case letters only.
    return [code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : unit]
  }
  let s = stripMarks(unit.normalize('NFKD')).toLowerCase()
  if (s.length === 0) s = unit
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number
    out += cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : ch
  }
  // A unit that decomposes into several letters (a ligature, a roman numeral, a Hangul syllable, ß) is several keys, so the
  // query can match part of it ("ha" is the start of 한). One that keeps a mark (kana voicing) stays one key: が is not か,
  // and so does anything that is not made of letters and digits (an emoji sequence, "…").
  if (MARK.test(out) || !LETTERS.test(out)) return [out]

  return [...out].flatMap((ch) => [...(SPECIAL[ch] ?? ch)])
}

// ---------------------------------------------------------------- segmentation

const MARK = /\p{M}/u
const LETTERS = /^[\p{L}\p{N}]+$/u
const ZWJ = 0x200d

function isAttaching(cp: number, ch: string): boolean {
  if (cp < 0x300) return false
  return (
    cp === ZWJ ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0020 && cp <= 0xe007f) ||
    cp === 0xff9e ||
    cp === 0xff9f ||
    MARK.test(ch)
  )
}

function isRegional(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

/** 0 separator, 1 lower or caseless letter, 2 upper, 3 digit, 4 CJK (every character stands alone) */
function classOf(base: string): number {
  const cp = base.codePointAt(0) as number
  if (cp < 128) {
    if (cp >= 97 && cp <= 122) return 1
    if (cp >= 65 && cp <= 90) return 2
    if (cp >= 48 && cp <= 57) return 3

    return 0
  }
  if ((cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff)) return 4
  if (/[\p{Lu}\p{Lt}]/u.test(base)) return 2
  if (/\p{L}|\p{Nl}|\p{Lm}/u.test(base)) return 1
  if (/\p{Nd}|\p{No}/u.test(base)) return 3

  return 0
}

/** A text, split and folded once. Reusable: `fuzzyMatch` and `createRanker` accept it in place of the string. */
export interface PreparedText {
  readonly text: string
  /** Folded key per unit. */
  readonly keys: readonly string[]
  /** UTF-16 offsets: unit `i` covers `[starts[i], ends[i])`. */
  readonly starts: readonly number[]
  readonly ends: readonly number[]
  /** Position bonus per unit (word start, hump, text start). */
  readonly bonus: readonly number[]
  /** Whether the unit starts a word (also humps). */
  readonly initial: readonly boolean[]
  /** `true` when the text was longer than `MAX_TEXT_UNITS` and only the start is matched. */
  readonly truncated: boolean
}

export function prepareText(text: string): PreparedText {
  const keys: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  const bonus: number[] = []
  const initial: boolean[] = []
  let truncated = false
  let prevClass = 0
  let units = 0
  let i = 0
  const n = text.length
  while (i < n) {
    if (keys.length >= MAX_TEXT_UNITS) {
      truncated = true
      break
    }
    const start = i
    const first = text.codePointAt(i) as number
    i += first > 0xffff ? 2 : 1
    const firstChar = text.slice(start, i)
    if (isRegional(first) && i < n && isRegional(text.codePointAt(i) as number)) i += 2
    while (i < n) {
      const cp = text.codePointAt(i) as number
      const ch = String.fromCodePoint(cp)
      if (!isAttaching(cp, ch)) break
      i += ch.length
      if (cp === ZWJ && i < n) {
        const next = text.codePointAt(i) as number
        i += next > 0xffff ? 2 : 1
      }
    }
    const cls = classOf(firstChar)
    let b = 0
    let isInitial = false
    if (units === 0) {
      b = WORD_START + TEXT_START
      isInitial = cls !== 0
    } else if (cls !== 0 && prevClass === 0) {
      b = WORD_START
      isInitial = true
    } else if (prevClass === 1 && cls === 2) {
      b = HUMP
      isInitial = true
    }
    const folded = foldUnit(text.slice(start, i))
    for (let f = 0; f < folded.length; f++) {
      keys.push(folded[f] as string)
      starts.push(start)
      ends.push(i)
      bonus.push(f === 0 ? b : 0)
      initial.push(f === 0 && isInitial)
    }
    units++
    prevClass = cls
  }

  return { text, keys, starts, ends, bonus, initial, truncated }
}

/** A query, split into words of folded units. */
export interface PreparedQuery {
  readonly query: string
  /** The words, each a list of folded unit keys. */
  readonly words: readonly (readonly string[])[]
  /** The words joined by one space: equal keys mean equal queries; a key that starts with another narrows it. */
  readonly key: string
}

export function prepareQuery(query: string, options?: FuzzyMatchOptions): PreparedQuery {
  const parts = options?.anyOrder === false ? [query.trim()] : query.trim().split(/\s+/u)
  const words: string[][] = []
  let total = 0
  for (const part of parts) {
    if (part === '' || words.length >= MAX_QUERY_WORDS || total >= MAX_QUERY_UNITS) continue
    const prepared = prepareText(part)
    const keys = prepared.keys.slice(0, MAX_QUERY_UNITS - total)
    if (keys.length === 0) continue
    // A unit that folds to nothing cannot be matched; drop empty keys.
    const kept = keys.filter((k) => k !== '')
    if (kept.length === 0) continue
    total += kept.length
    words.push(kept)
  }

  return { query, words, key: words.map((w) => w.join('')).join(' ') }
}

// ---------------------------------------------------------------- matching one word

interface WordMatch {
  score: number
  /** Unit indices of the matched units. */
  positions: number[]
}

/** For each query unit, the earliest and the latest text unit it can sit at; `null` when the word is not a subsequence. */
function feasibleWindow(word: readonly string[], keys: readonly string[]): { first: number[]; last: number[] } | null {
  const m = word.length
  const n = keys.length
  const first: number[] = new Array(m)
  let from = 0
  for (let j = 0; j < m; j++) {
    const at = keys.indexOf(word[j] as string, from)
    if (at < 0) return null
    first[j] = at
    from = at + 1
  }
  const last: number[] = new Array(m)
  let upto = n - 1
  for (let j = m - 1; j >= 0; j--) {
    const at = keys.lastIndexOf(word[j] as string, upto)
    last[j] = at
    upto = at - 1
  }

  return { first, last }
}

/** `S[j * n + i]` is the best score with query unit `j` matched at text unit `i`; `P` holds the predecessor of that match. */
function fillScores(word: readonly string[], text: PreparedText, first: readonly number[], last: readonly number[]): { S: Int32Array; P: Int16Array } {
  const m = word.length
  const n = text.keys.length
  const keys = text.keys
  const S = new Int32Array(m * n).fill(NEG)
  const P = new Int16Array(m * n).fill(-1)
  for (let i = first[0] as number; i <= (last[0] as number); i++) {
    // No penalty for the characters before the first match: where the match starts is what the position bonuses are for.
    if (keys[i] === word[0]) S[i] = MATCH + (text.bonus[i] as number)
  }
  for (let j = 1; j < m; j++) {
    const row = j * n
    const prev = row - n
    // `run` is the best predecessor strictly before i - 1, with the gap penalty up to i.
    let run = NEG
    let runAt = -1
    for (let i = (first[j - 1] as number) + 1; i <= (last[j] as number); i++) {
      if (i >= 2) {
        const open = S[prev + i - 2] as number
        const opened = open === NEG ? NEG : open + GAP_OPEN
        const extended = run === NEG ? NEG : run + GAP_EXTEND
        if (opened >= extended) {
          run = opened
          runAt = i - 2
        } else {
          run = extended
        }
      }
      if (keys[i] !== word[j]) continue
      const adjacent = S[prev + i - 1] as number
      const viaRun = run !== NEG
      const viaAdjacent = adjacent !== NEG
      if (!viaRun && !viaAdjacent) continue
      const takeRun = viaRun && (!viaAdjacent || run > adjacent + CONSECUTIVE)
      S[row + i] = (takeRun ? run : adjacent + CONSECUTIVE) + MATCH + (text.bonus[i] as number)
      P[row + i] = takeRun ? runAt : i - 1
    }
  }

  return { S, P }
}

function matchWord(word: readonly string[], text: PreparedText): WordMatch | null {
  const m = word.length
  const n = text.keys.length
  if (m > n) return null
  const window = feasibleWindow(word, text.keys)
  if (window === null) return null
  const { S, P } = fillScores(word, text, window.first, window.last)

  let bestScore = NEG
  let bestEnd = -1
  for (let i = m - 1; i < n; i++) {
    const v = S[(m - 1) * n + i] as number
    if (v > bestScore) {
      bestScore = v
      bestEnd = i
    }
  }
  if (bestEnd < 0) return null
  const positions: number[] = new Array(m)
  let at = bestEnd
  for (let j = m - 1; j >= 0; j--) {
    positions[j] = at
    at = P[j * n + at] as number
  }
  let score = bestScore
  if (positions.every((p, j) => p === j)) {
    score += PREFIX
    if (m === n) score += EXACT
  }
  // Shorter texts first among equal shapes.
  score -= Math.min(n - m, 32) >> 2

  return { score, positions }
}

function toRanges(text: PreparedText, positions: readonly number[]): MatchRange[] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const p of sorted) {
    const s = text.starts[p] as number
    const e = text.ends[p] as number
    const tail = out[out.length - 1]
    if (tail !== undefined && tail[1] >= s) tail[1] = Math.max(tail[1], e)
    else out.push([s, e])
  }

  return out
}

/** Match a prepared query against a prepared text. The engine behind `fuzzyMatch`. */
export function matchPrepared(query: PreparedQuery, text: PreparedText): FuzzyMatch | null {
  if (query.words.length === 0) return { score: 0, ranges: [] }
  let score = 0
  const all: number[] = []
  for (const word of query.words) {
    const hit = matchWord(word, text)
    if (hit === null) return null
    score += hit.score
    for (const p of hit.positions) all.push(p)
  }

  return { score, ranges: toRanges(text, all) }
}

/**
 * Match `query` against `text`: case- and diacritic-insensitive, a subsequence of the text, scored for word starts,
 * camelCase humps, consecutive characters and prefixes (so "np" finds "New Project": both letters start a word). Words of the query match in any order. An empty query
 * matches everything with score 0. Returns `null` when the text does not match.
 */
export function fuzzyMatch(query: string | PreparedQuery, text: string | PreparedText, options?: FuzzyMatchOptions): FuzzyMatch | null {
  const q = typeof query === 'string' ? prepareQuery(query, options) : query
  const t = typeof text === 'string' ? prepareText(text) : text
  return matchPrepared(q, t)
}

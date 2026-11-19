import type { FuzzyMatch, FuzzyMatchOptions, MatchRange, PreparedQuery, PreparedText } from './match'
import { matchPrepared, prepareQuery, prepareText } from './match'

/** One ranked item. */
export interface Ranked<T> {
  item: T
  /** Position of the item in the list that was ranked (its registration order). */
  index: number
  /** The match score plus the boost. Higher is better. */
  score: number
  /** Which of the item's texts matched best: 0 is the first text returned by `getText`. */
  field: number
  /** Ranges inside the matched text. */
  ranges: readonly MatchRange[]
}

export interface RankOptions<T> extends FuzzyMatchOptions {
  /** Keep only the best `limit` results. */
  limit?: number
  /** The score of the texts after the first is multiplied by this (default 0.6): a keyword match ranks below a title match. */
  secondaryWeight?: number
  /** Added to the score of every match (a bounded recency boost). Must be finite. */
  boost?: (item: T, index: number) => number
  /** Breaks ties between equal scores: higher first. Then registration order decides. */
  priority?: (item: T, index: number) => number
}

export interface RankerOptions {
  /** How many prepared texts the ranker keeps. Default 20000; the cache is cleared when it is full. */
  cacheSize?: number
}

export interface Ranker<T> {
  rank(query: string, items: readonly T[], options?: RankOptions<T>): Ranked<T>[]
  /** Forget the previous query: the next call scans every item. Call it when the texts of the items changed. */
  reset(): void
  /** How many items the last call looked at (an observable of narrowing). */
  readonly lastScanned: number
}

const DEFAULT_WEIGHT = 0.6

function scoreOf(score: number, field: number, weight: number): number {
  return field === 0 ? score : Math.floor(score * weight)
}

/** The best of an item's texts against the query, or `null` when none matches. */
function bestMatch<T>(item: T, index: number, texts: readonly string[], weight: number, matchText: (text: string) => FuzzyMatch | null): Ranked<T> | null {
  let best: Ranked<T> | null = null
  for (let f = 0; f < texts.length; f++) {
    const hit = matchText(texts[f] as string)
    if (hit === null) continue
    const weighted = scoreOf(hit.score, f, weight)
    if (best === null || weighted > best.score) best = { item, index, score: weighted, field: f, ranges: hit.ranges }
  }

  return best
}

function limited<T>(out: Ranked<T>[], limit: number | undefined): Ranked<T>[] {
  return limit !== undefined && limit >= 0 && out.length > limit ? out.slice(0, limit) : out
}

function order<T>(out: Ranked<T>[], priority: RankOptions<T>['priority']): void {
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (priority !== undefined) {
      const d = priority(b.item, b.index) - priority(a.item, a.index)
      if (d !== 0) return d
    }

    return a.index - b.index
  })
}

/**
 * A ranker keeps what is worth keeping between keystrokes: the prepared (split and folded) texts, so a text is processed
 * once, and the previous candidates, so a query that extends the previous one only looks at the items that matched it.
 * The narrowing is exact: a longer query can only match what its prefix matched.
 */
export function createRanker<T>(getText: (item: T) => string | readonly string[], rankerOptions?: RankerOptions): Ranker<T> {
  const cacheSize = rankerOptions?.cacheSize ?? 20000
  let cache = new Map<string, PreparedText>()
  let lastItems: readonly T[] | null = null
  let lastKey = ''
  let lastAnyOrder = true
  let candidates: number[] | null = null
  let scanned = 0

  function prepared(text: string): PreparedText {
    let p = cache.get(text)
    if (p === undefined) {
      if (cache.size >= cacheSize) cache = new Map()
      p = prepareText(text)
      cache.set(text, p)
    }

    return p
  }

  function reset(): void {
    lastItems = null
    lastKey = ''
    candidates = null
  }

  /** The previous candidates when this query can only match what the previous one matched, else `null` (scan everything). */
  function reusable(items: readonly T[], anyOrder: boolean, key: string): readonly number[] | null {
    const same = lastItems === items && lastAnyOrder === anyOrder && lastKey !== ''

    return same && key.startsWith(lastKey) ? candidates : null
  }

  function search(query: string, items: readonly T[], options?: RankOptions<T>): Ranked<T>[] {
    const weight = options?.secondaryWeight ?? DEFAULT_WEIGHT
    const anyOrder = options?.anyOrder !== false
    const q: PreparedQuery = prepareQuery(query, options)
    const out: Ranked<T>[] = []
    const pool = reusable(items, anyOrder, q.key)
    const next: number[] = []
    const count = pool === null ? items.length : pool.length
    scanned = count
    for (let k = 0; k < count; k++) {
      const index = pool === null ? k : (pool[k] as number)
      const item = items[index] as T
      const raw = getText(item)
      const best = bestMatch(item, index, typeof raw === 'string' ? [raw] : raw, weight, (text) => matchPrepared(q, prepared(text)))
      if (best === null) continue
      next.push(index)
      if (options?.boost !== undefined) best.score += options.boost(item, index)
      out.push(best)
    }
    // Remember this query as the base of the next one. An empty query matches everything: keep nothing to narrow.
    lastItems = items
    lastAnyOrder = anyOrder
    lastKey = q.key
    candidates = q.key === '' ? null : next

    order(out, options?.priority)

    return limited(out, options?.limit)
  }

  return {
    rank: search,
    reset,
    get lastScanned() {
      return scanned
    },
  }
}

/**
 * Rank `items` against `query`: the matches, best first. Equal scores keep the order of `items`. Use `createRanker` when
 * the same list is searched again and again (as a palette does): it narrows and caches.
 */
export function rank<T>(query: string, items: readonly T[], getText: (item: T) => string | readonly string[], options?: RankOptions<T>): Ranked<T>[] {
  return createRanker(getText).rank(query, items, options)
}

/**
 * ECharts' `selectedMap` — which items start selected. Keyed by item name
 * (a datum's own `name`, else its category), or `'all'` for every item.
 * With `selectedMode: 'series'` a selected series is pinned whole.
 */
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface SelectedSeed {
  /** Pinned data (category) indices. */
  data: number[]
  /** Pinned compiled-series indices (`selectedMode: 'series'`). */
  series: number[]
}

/**
 * The pins a cartesian option starts with. `seriesSource[k]` is the option's
 * series index behind compiled series `k`; `categories` are the category names.
 * Null when no series carries a `selectedMap`, so a caller leaves the pins alone.
 */
export function selectedSeed(rawSeries: unknown[], seriesSource: number[], categories: string[]): SelectedSeed | null {
  let any = false
  const data = new Set<number>()
  const series: number[] = []
  seriesSource.forEach((src, k) => {
    const s = rawSeries[src]
    if (!isObj(s) || s['selectedMap'] === undefined || s['selectedMode'] === undefined || s['selectedMode'] === false) return
    any = true
    const map = s['selectedMap']
    if (s['selectedMode'] === 'series') {
      if (map === 'all' || (isObj(map) && Object.values(map).some((v) => v === true))) series.push(k)
      return
    }
    const items = Array.isArray(s['data']) ? (s['data'] as unknown[]) : []
    const n = Math.max(categories.length, items.length)
    for (let i = 0; i < n; i++) {
      if (map === 'all') {
        data.add(i)
        continue
      }
      if (!isObj(map)) continue
      const item = items[i]
      const name = isObj(item) && typeof item['name'] === 'string' ? (item['name'] as string) : categories[i]
      if (name !== undefined && map[name] === true) data.add(i)
    }
  })
  return any ? { data: [...data].sort((a, b) => a - b), series } : null
}

import { type EChartsOption, Chart } from '@pyreon/charts'
import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'
import { computed } from '@pyreon/reactivity'
import { groupBy, take } from '@pyreon/rx'
import { fetchFeed, type Story } from '../lib/api'

/**
 * Stats page — exercises:
 *   - `@pyreon/query`  (fetch a corpus of ~150 stories)
 *   - `@pyreon/rx`     (groupBy + take + sortBy)
 *   - `@pyreon/charts` (bar + pie + scatter via lazy ECharts)
 *   - `computed()`     (derived aggregations chain off query.data)
 *
 * Demonstrates the canonical real-app shape: server data → rx aggregation
 * → echarts visualization. ECharts is lazy-loaded — zero bytes until the
 * page mounts.
 */
export default function StatsPage() {
  const { t } = useI18n()
  useHead(() => ({ title: `${t('nav.stats')} — Hacker News (Pyreon)` }))

  // Fetch ~150 stories across 5 pages of /news.
  const query = useQuery(() => ({
    queryKey: ['stats-corpus'],
    queryFn: async () => {
      const pages = await Promise.all([1, 2, 3, 4, 5].map((p) => fetchFeed('news', p)))
      return pages.flat()
    },
    staleTime: 5 * 60 * 1000,
  }))

  const stories = computed<Story[]>(() => query.data() ?? [])

  // Top 10 domains by story count — rx groupBy + a Pyreon computed for
  // the sort+take (rx doesn't sort Records directly; we materialize the
  // groups, count them, then sort and take).
  const domainGroups = groupBy(stories as never, (s: Story) => s.domain ?? 'self')

  const topDomains = computed(() => {
    const grouped = (domainGroups as never as () => Record<string, Story[]>)()
    return Object.entries(grouped)
      .map(([domain, items]) => ({ domain, count: items.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  })

  // Top 10 users by submission count.
  const userGroups = groupBy(stories as never, (s: Story) => s.user ?? '(anon)')
  const topUsers = computed(() => {
    const grouped = (userGroups as never as () => Record<string, Story[]>)()
    return Object.entries(grouped)
      .map(([user, items]) => ({
        user,
        count: items.length,
        points: items.reduce((a, b) => a + (b.points ?? 0), 0),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  })

  // Points distribution buckets — for the bar histogram.
  const pointsBuckets = computed(() => {
    const buckets = [0, 50, 100, 200, 500, 1000, 2000, 5000]
    const counts = Array.from<number>({ length: buckets.length }).fill(0)
    for (const s of stories()) {
      const p = s.points ?? 0
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (p >= (buckets[i] ?? 0)) {
          counts[i] = (counts[i] ?? 0) + 1
          break
        }
      }
    }
    return { labels: buckets.map((b) => `${b}+`), data: counts }
  })

  // Scatter: points × comments — uses rx take to cap.
  const scatterTake = take(stories as never, 100)
  const scatterData = computed(() => {
    const arr = (scatterTake as never as () => Story[])()
    return arr.map<[number, number, string]>((s) => [s.points ?? 0, s.comments_count ?? 0, s.title])
  })

  // ── Chart options ─────────────────────────────────────────────────────────
  const domainBar = computed<EChartsOption>(() => ({
    title: { text: 'Top 10 domains', left: 'center' },
    tooltip: { trigger: 'axis' },
    grid: { left: 110, right: 24 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: topDomains()
        .map((d) => d.domain)
        .reverse(),
    },
    series: [
      {
        type: 'bar',
        data: topDomains()
          .map((d) => d.count)
          .reverse(),
        itemStyle: { color: '#ff6600' },
      },
    ],
  }))

  const userPie = computed<EChartsOption>(() => ({
    title: { text: 'Top 10 submitters', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} stories' },
    series: [
      {
        type: 'pie',
        radius: ['35%', '70%'],
        data: topUsers().map((u) => ({ name: u.user, value: u.count })),
      },
    ],
  }))

  const pointsHistogram = computed<EChartsOption>(() => {
    const { labels, data } = pointsBuckets()
    return {
      title: { text: 'Points distribution', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels, name: 'points ≥' },
      yAxis: { type: 'value', name: 'stories' },
      series: [{ type: 'bar', data, itemStyle: { color: '#5470c6' } }],
    }
  })

  const pointsVsComments = computed<EChartsOption>(() => ({
    title: { text: 'Points vs Comments', left: 'center', subtext: 'first 100 stories' },
    tooltip: {
      trigger: 'item',
      formatter: ((p: { data: [number, number, string] }) =>
        `${p.data[2]}<br/>points: ${p.data[0]}<br/>comments: ${p.data[1]}`) as never,
    },
    xAxis: { type: 'value', name: 'points', nameLocation: 'middle', nameGap: 25 },
    yAxis: { type: 'value', name: 'comments', nameLocation: 'middle', nameGap: 35 },
    series: [
      {
        type: 'scatter',
        data: scatterData(),
        symbolSize: 8,
        itemStyle: { color: '#91cc75', opacity: 0.7 },
      },
    ],
  }))

  return (
    <section class="stats-page">
      <header>
        <h1>{() => t('nav.stats')}</h1>
        <p class="stats-meta">
          {() => {
            if (query.isPending()) return t('feed.loading')
            if (query.isError()) return String(query.error())
            return `Analyzing ${stories().length} stories`
          }}
        </p>
      </header>

      {() =>
        query.isPending() ? (
          <div class="feed-state">{t('feed.loading')}</div>
        ) : (
          <div class="stats-grid">
            <div class="chart-card">
              <Chart options={() => domainBar()} style="height: 360px; width: 100%" />
            </div>
            <div class="chart-card">
              <Chart options={() => userPie()} style="height: 360px; width: 100%" />
            </div>
            <div class="chart-card">
              <Chart options={() => pointsHistogram()} style="height: 360px; width: 100%" />
            </div>
            <div class="chart-card">
              <Chart options={() => pointsVsComments()} style="height: 360px; width: 100%" />
            </div>
          </div>
        )
      }
    </section>
  )
}

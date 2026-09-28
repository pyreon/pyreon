import { Arc, Axis, Bar, Chart, Dot, Tooltip } from '@pyreon/charts'
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
 *   - `@pyreon/charts` (bar + donut + scatter, marks as children)
 *   - `computed()`     (derived aggregations chain off query.data)
 *
 * Demonstrates the canonical real-app shape: server data → rx aggregation
 * → a chart. Each chart pays only for the marks it imports.
 */
export default function StatsPage() {
  const { t } = useI18n()
  useHead(() => ({ title: `${t('nav.stats')} — Hacker News (Pyreon)` }))

  // Fetch ~150 stories across 5 pages of /news.
  const query = useQuery(() => ({
    queryKey: ['stats-corpus'],
    queryFn: async () => {
      const pages = await Promise.all(
        [1, 2, 3, 4, 5].map((p) => fetchFeed('news', p)),
      )
      return pages.flat()
    },
    staleTime: 5 * 60 * 1000,
  }))

  const stories = computed<Story[]>(() => query.data() ?? [])

  // Top 10 domains by story count — rx groupBy + a Pyreon computed for
  // the sort+take (rx doesn't sort Records directly; we materialize the
  // groups, count them, then sort and take).
  const domainGroups = groupBy(
    stories as never,
    (s: Story) => s.domain ?? 'self',
  )

  const topDomains = computed(() => {
    const grouped = (domainGroups as never as () => Record<string, Story[]>)()
    return Object.entries(grouped)
      .map(([domain, items]) => ({ domain, count: items.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  })

  // Top 10 users by submission count.
  const userGroups = groupBy(
    stories as never,
    (s: Story) => s.user ?? '(anon)',
  )
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
    return buckets.map((b, i) => ({ bucket: `${b}+`, stories: counts[i] ?? 0 }))
  })

  // Scatter: points × comments — uses rx take to cap.
  const scatterTake = take(stories as never, 100)
  const scatterData = computed(() =>
    (scatterTake as never as () => Story[])().map((s) => ({
      points: s.points ?? 0,
      comments: s.comments_count ?? 0,
    })),
  )

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
              <Chart data={() => topDomains()} x="domain" horizontal height={360} title="Top 10 domains">
                <Bar y="count" label="Stories" color="#ff6600" />
                <Tooltip />
              </Chart>
            </div>
            <div class="chart-card">
              <Chart data={() => topUsers()} height={360} title="Top 10 submitters">
                <Arc value="count" label="user" innerRadius={0.5} />
                <Tooltip />
              </Chart>
            </div>
            <div class="chart-card">
              <Chart data={() => pointsBuckets()} x="bucket" height={360} title="Points distribution">
                <Bar y="stories" label="Stories" />
                <Axis x title="points ≥" />
                <Axis y title="stories" />
                <Tooltip />
              </Chart>
            </div>
            <div class="chart-card">
              <Chart data={() => scatterData()} xValue="points" height={360} title="Points vs comments" subtitle="first 100 stories">
                <Dot y="comments" label="Comments" color="#91cc75" />
                <Axis x title="points" />
                <Axis y title="comments" />
                <Tooltip />
              </Chart>
            </div>
          </div>
        )
      }
    </section>
  )
}

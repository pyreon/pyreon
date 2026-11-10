import stats from 'virtual:pyreon-open-stats'
import { usePageHead } from '../components/site-head'
import { OpenStatsView } from '../open/OpenStatsView'

// The chart's first frame is serialized to SVG in the prerendered HTML when
// the server has imported `@pyreon/charts/svg`; the browser never needs that
// serializer, so only the server build loads it.
if (import.meta.env.SSR) await import('@pyreon/charts/svg')

/**
 * `/open` — live project numbers. The data is fetched once per build by
 * `vite-plugins/open-stats.ts`, so the daily deploy refreshes it and no
 * visitor's browser ever calls GitHub or npm.
 */
export default function OpenPage() {
  usePageHead({
    path: '/open',
    title: 'Open stats · Pyreon',
    description:
      'Pyreon in numbers, live: GitHub stars, contributors, issues, releases and npm downloads, plus the benchmark record with every withdrawn claim.',
  })
  return <OpenStatsView stats={stats} />
}

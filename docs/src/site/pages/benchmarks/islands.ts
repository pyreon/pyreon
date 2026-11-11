import { island } from '@pyreon/zero'

/**
 * The two live-chart islands on `/benchmarks`. `hydrate: 'visible'` loads
 * the (small) island when it nears the viewport; the island itself loads
 * `@pyreon/charts` only if the reader has not asked for reduced data. See
 * `LiveChart.tsx`.
 */
export const LiveRowBoard = island(() => import('./LiveChart'), { name: 'BenchLiveRowBoard', hydrate: 'visible' })
export const LiveScaling = island(() => import('./LiveChart'), { name: 'BenchLiveScaling', hydrate: 'visible' })

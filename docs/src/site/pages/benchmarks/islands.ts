import { island } from '@pyreon/zero'

/**
 * The islands on `/benchmarks` (a static page: anything with a handler is an
 * island). `hydrate: 'visible'` loads each one when it nears the viewport.
 *
 * - The two live charts (`LiveChart.tsx`) load `@pyreon/charts` only if the
 *   reader has not asked for reduced data.
 * - The reactivity engine switcher and the product filter render their
 *   default selection on the server, so the page reads complete without
 *   JavaScript.
 */
export const LiveRowBoard = island(() => import('./LiveChart'), { name: 'BenchLiveRowBoard', hydrate: 'visible' })
export const LiveScaling = island(() => import('./LiveChart'), { name: 'BenchLiveScaling', hydrate: 'visible' })
export const BenchReactivity = island(() => import('./ReactivityTable'), { name: 'BenchReactivity', hydrate: 'visible' })
export const BenchProducts = island(() => import('./ProductCards'), { name: 'BenchProducts', hydrate: 'visible' })

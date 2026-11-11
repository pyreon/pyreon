import type { ComponentFn, VNode } from '@pyreon/core'
import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { BenchmarksPage } from '../../content/types-site'

/**
 * The chart island on `/benchmarks` (a zero island, `hydrate: 'visible'`).
 *
 * The static SVG chart from the asset set is rendered by the PAGE, beside
 * this island, with the id `fallbackId`: it is what readers without
 * JavaScript, crawlers and readers who asked for reduced data
 * (`prefers-reduced-data`, `navigator.connection.saveData`) keep. The island
 * renders nothing on the server, so hydration has nothing to adopt; once
 * mounted, and only when reduced data is not asked for, it loads the live
 * `@pyreon/charts` view (a separate chunk), hides the static SVG and draws.
 * The table under every chart is the text alternative either way.
 */
export type LiveChartProps =
  | {
      kind: 'rows'
      fallbackId: string
      frameworks: BenchmarksPage['frameworks']
      rowBoard: BenchmarksPage['rowBoard']
      rowVerdicts: BenchmarksPage['rowVerdicts']
      initial: string
    }
  | { kind: 'scaling'; fallbackId: string; scaling: BenchmarksPage['scaling'] }

export function wantsReducedData(): boolean {
  if (typeof window === 'undefined') return true
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return true
  return window.matchMedia?.('(prefers-reduced-data: reduce)').matches === true
}

export default function LiveChart(props: LiveChartProps) {
  const view = signal<VNode | null>(null)

  onMount(() => {
    if (wantsReducedData()) return
    let cancelled = false
    void import('./charts').then((m) => {
      if (cancelled) return
      const fallback = document.getElementById(props.fallbackId)
      if (fallback) fallback.hidden = true
      // Capitalised locals, never `<m.RowBoardChart …/>`: the compiler treats a
      // member-expression tag as a DOM element and passes unbranded arrows as
      // props (pyreon/pyreon#4368).
      if (props.kind === 'rows') {
        const RowBoard = m.RowBoardChart as ComponentFn<Omit<Extract<LiveChartProps, { kind: 'rows' }>, 'kind' | 'fallbackId'>>
        view.set(<RowBoard frameworks={props.frameworks} rowBoard={props.rowBoard} rowVerdicts={props.rowVerdicts} initial={props.initial} />)
      } else {
        const Scaling = m.ScalingChart
        view.set(<Scaling scaling={props.scaling} />)
      }
    })
    return () => {
      cancelled = true
    }
  })

  return <div data-live-chart={props.kind}>{() => view()}</div>
}

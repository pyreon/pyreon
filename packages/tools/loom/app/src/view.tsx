/**
 * One routed view. Every route file is three lines on top of this: the
 * Observatory shell seeded with that route's view id, and told how to build
 * hrefs so its tabs navigate for real instead of flipping a signal.
 */
import { h } from '@pyreon/core'
import { Observatory } from '../../src/ui/Observatory'
import type { ViewId } from '../../src/ui/model'
import { loomReport } from './report'

const HREF: Record<ViewId, string> = {
  graph: '/',
  matrix: '/matrix',
  cycles: '/cycles',
  impact: '/impact',
  table: '/manifests',
}

export function view(id: ViewId) {
  return h(Observatory, {
    report: loomReport,
    initialView: id,
    hrefFor: (v: ViewId) => HREF[v],
  })
}

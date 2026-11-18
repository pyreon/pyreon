/**
 * One routed view. Every route file is three lines on top of this: the
 * Observatory shell seeded with that route's view id, and told how to build
 * hrefs so its tabs navigate for real instead of flipping a signal.
 */
import { h } from '@pyreon/core'
import { Observatory } from '../../src/ui/Observatory'
import type { ViewId } from '../../src/ui/model'
import { loomReport } from './report'

interface ViteEnvMeta {
  readonly env?: { readonly BASE_URL?: string }
}

// Vite's resolved base (`/`, or `/demos/loom/` under `loom build --base`),
// without its trailing slash. The tabs are plain links, so a hard-coded root
// path left a site built for a sub-path linking out of it (#4391).
const BASE = ((import.meta as ViteEnvMeta).env?.BASE_URL ?? '/').replace(/\/$/, '')

const HREF: Record<ViewId, string> = {
  graph: `${BASE}/`,
  matrix: `${BASE}/matrix`,
  cycles: `${BASE}/cycles`,
  impact: `${BASE}/impact`,
  table: `${BASE}/manifests`,
}

export function view(id: ViewId) {
  return h(Observatory, {
    report: loomReport,
    initialView: id,
    hrefFor: (v: ViewId) => HREF[v],
  })
}

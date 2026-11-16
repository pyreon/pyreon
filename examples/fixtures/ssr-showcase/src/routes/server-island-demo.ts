/**
 * Phase 4 probe — a server island inside an SSR page. The page itself is
 * cacheable (the island renders ONLY a marker into it); the fragment is
 * rendered per request by the auto-mounted `/_pyreon/fragment/ServerStamp`
 * endpoint. The e2e proof is the inverse of hybrid-static's: two fragment
 * fetches return DIFFERENT stamps (per-request), while the page around the
 * marker carries none of the fragment's content.
 */
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { serverIsland } from '@pyreon/zero'

const ServerStamp = serverIsland(
  async () => ((props: { label?: string }) =>
    h(
      'span',
      { 'data-testid': 'server-stamp' },
      `${props.label ?? 'stamp'}:${Date.now()}`,
    )) as ComponentFn,
  {
    name: 'ServerStamp',
    fallback: h('span', { 'data-testid': 'server-stamp-fallback' }, 'loading stamp…'),
  },
)

export default function ServerIslandDemoPage() {
  return h(
    'div',
    { 'data-testid': 'server-island-demo' },
    h('h1', null, 'Server island demo'),
    h(ServerStamp as ComponentFn, { label: 'now' }),
  )
}

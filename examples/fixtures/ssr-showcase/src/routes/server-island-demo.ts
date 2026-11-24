/**
 * Phase 4 probe — a server island inside an SSR page. The page itself is
 * cacheable (the island renders ONLY a marker into it); the fragment is
 * rendered per request by the auto-mounted `/_pyreon/fragment/ServerStamp`
 * endpoint. The e2e proof is the inverse of hybrid-static's: two fragment
 * fetches return DIFFERENT stamps (per-request), while the page around the
 * marker carries none of the fragment's content.
 */
import { h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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
  // A second marker rendered only on the CLIENT (after the click), with the
  // same props as the server-rendered one: it carries no signature, so its
  // first fragment request is refused (403) and it retries with the signed
  // marker from the page's server render (`e2e/ssr-base.spec.ts`).
  const revealed = signal(false)
  return h(
    'div',
    { 'data-testid': 'server-island-demo' },
    h('h1', null, 'Server island demo'),
    h(ServerStamp as ComponentFn, { label: 'now' }),
    h('button', { type: 'button', 'data-testid': 'reveal-client-island', onClick: () => revealed.set(true) }, 'Reveal'),
    h(
      Show,
      { when: () => revealed() },
      h('div', { 'data-testid': 'client-rendered-island' }, h(ServerStamp as ComponentFn, { label: 'now' })),
    ),
  )
}

import { For } from '@pyreon/core'
import { RouterLink, useRouter } from '@pyreon/router'
import { useChatModel } from '../lib/chat-store'
import type { Channel } from '../lib/types'

/**
 * Left rail with the channel list.
 *
 * Active channel is derived from the current route's URL (not from
 * the store) — single source of truth, prevents drift if the user
 * navigates via address bar.
 */
export default function ChannelRail() {
  const store = useChatModel()
  const router = useRouter()

  // Derive active channel from the URL — `/channels/<id>`.
  const activeId = () => {
    const m = router.currentRoute().path.match(/^\/channels\/([^/?]+)/)
    return m?.[1] ?? null
  }

  return (
    <aside class="channel-rail" data-testid="channel-rail">
      <header class="channel-rail-header">
        <h1>Pyreon Chat</h1>
      </header>
      <nav class="channel-list">
        <For each={() => store.channels() as Channel[]} by={(c) => c.id}>
          {(c) => (
            <RouterLink
              to={`/channels/${c.id}`}
              class={() => `channel-link ${activeId() === c.id ? 'active' : ''}`}
              data-testid={`channel-link-${c.id}`}
            >
              <span class="channel-hash">#</span>
              {c.name}
              <span class="channel-count">{c.memberCount}</span>
            </RouterLink>
          )}
        </For>
      </nav>
    </aside>
  )
}

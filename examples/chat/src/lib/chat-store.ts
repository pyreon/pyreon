import { model } from '@pyreon/state-tree'
import { effect } from '@pyreon/reactivity'
import type { Channel } from './types'

/**
 * Chat session state-tree.
 *
 * Holds:
 *   - channels: known channels
 *   - lastVisitedChannelId: persisted to localStorage so a reload
 *     lands the user back where they were
 *
 * Messages themselves do NOT live here — they live in the per-channel
 * `useSSE` stream + `useQuery` history (see channels/[id].tsx). This
 * keeps state-tree responsible only for what survives across mounts,
 * NOT for the high-frequency stream (which would push the W23 shape
 * we just fixed in PR #982).
 */

const DEFAULT_CHANNELS: Channel[] = [
  {
    id: 'general',
    name: 'general',
    topic: 'Company-wide announcements and updates',
    memberCount: 142,
  },
  {
    id: 'engineering',
    name: 'engineering',
    topic: 'Tech talk, code reviews, infra',
    memberCount: 38,
  },
  {
    id: 'design',
    name: 'design',
    topic: 'Design crits, Figma threads, brand',
    memberCount: 24,
  },
  { id: 'random', name: 'random', topic: 'Off-topic chatter and memes', memberCount: 87 },
  { id: 'launches', name: 'launches', topic: 'Ship logs and launch coordination', memberCount: 19 },
]

const STORAGE_KEY = 'pyreon-chat-last-channel'

export const ChatModel = model({
  state: {
    channels: DEFAULT_CHANNELS as Channel[],
    lastVisitedChannelId: 'general' as string,
  },
}).actions((self) => ({
  setLastVisited(channelId: string) {
    self.lastVisitedChannelId.set(channelId)
  },
}))

export const useChatModel = ChatModel.asHook('pyreon-chat-store')

let persistenceInstalled = false
export function installChatPersistence(): void {
  if (persistenceInstalled) return
  if (typeof window === 'undefined') return
  persistenceInstalled = true

  const store = useChatModel()

  // Hydrate from localStorage if available.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw && typeof raw === 'string') {
      store.setLastVisited(raw)
    }
  } catch {
    /* corrupt / disabled — keep default */
  }

  // Mirror state-tree → storage. `effect()` runs once at install
  // AND on every change to lastVisitedChannelId.
  effect(() => {
    const id = store.lastVisitedChannelId() as string
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* quota / disabled */
    }
  })
}

import { state, derived, signalOf } from '@pyreon/core/plain'
import { untrack } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { chatBus } from './data/eventBus'
import { ME, channels, initialMessages } from './data/seed'
import type { Message } from './data/types'

/**
 * Chat store.
 *
 * Holds the message log keyed by channel id, plus the currently
 * selected channel. The store subscribes to `chatBus` once at
 * creation time and merges incoming messages into the log so every
 * channel view stays in sync.
 *
 * Why a composition store and not a state-tree model:
 *   • The shape is simple — one Record<string, Message[]> + one selected
 *     id signal. State-tree's snapshot/patch features don't add value
 *     for ephemeral chat data.
 *   • The chatBus subscription needs to live somewhere reactive AND
 *     long-lived. A module-level signal works; defineStore gives us
 *     the store registry + reset semantics for free.
 */
export const useChat = defineStore('chat', () => {
  // Seeded message log — built from `initialMessages` once at module load.
  let messagesByChannel = state<Record<string, Message[]>>(initialMessages)

  // Currently selected channel — defaults to the first one.
  let selectedChannelId = state<string>(channels[0]?.id ?? 'general')

  // Subscribe to the mock server. The unsubscribe is intentionally
  // never called: the store is a singleton for the lifetime of the
  // section, so we want messages to keep flowing even when the user
  // navigates between channels.
  chatBus.subscribe((message) => {
    messagesByChannel = ((current) => {
      const channelMessages = current[message.channelId] ?? []
      return {
        ...current,
        [message.channelId]: [...channelMessages, message],
      }
    })(untrack(() => messagesByChannel))
  })

  /** Reactive accessor for the messages in the currently selected channel. */
  const visibleMessages = derived(() => {
    const id = selectedChannelId
    return messagesByChannel[id] ?? []
  })

  // ── Actions ────────────────────────────────────────────────────────
  function selectChannel(id: string): void {
    selectedChannelId = id
  }

  /**
   * Optimistic send: immediately appends a `pending` message to the
   * log, then awaits the bus. On success the pending entry is replaced
   * with the server-acknowledged copy. On failure the pending entry
   * is removed and the caller can show a toast.
   */
  async function sendMessage(channelId: string, body: string): Promise<void> {
    const optimisticId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Message = {
      id: optimisticId,
      channelId,
      author: ME.name,
      authorColor: ME.color,
      body,
      createdAt: new Date().toISOString(),
      own: true,
      pending: true,
    }
    messagesByChannel = ({
      ...messagesByChannel,
      [channelId]: [...(messagesByChannel[channelId] ?? []), optimistic],
    })

    try {
      const server = await chatBus.send(channelId, body, ME)
      messagesByChannel = ((current) => ({
        ...current,
        [channelId]: (current[channelId] ?? []).map((m) =>
          m.id === optimisticId ? { ...server, own: true } : m,
        ),
      }))(untrack(() => messagesByChannel))
    } catch (error) {
      // Roll back the optimistic insert.
      messagesByChannel = ((current) => ({
        ...current,
        [channelId]: (current[channelId] ?? []).filter((m) => m.id !== optimisticId),
      }))(untrack(() => messagesByChannel))
      throw error
    }
  }

  return {
    channels,
    messagesByChannel: signalOf<typeof messagesByChannel>(messagesByChannel),
    selectedChannelId: signalOf<typeof selectedChannelId>(selectedChannelId),
    visibleMessages: signalOf<typeof visibleMessages>(visibleMessages),
    selectChannel,
    sendMessage,
  }
})

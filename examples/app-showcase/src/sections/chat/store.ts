import { computed, signal } from '@pyreon/reactivity'
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
  const messagesByChannel = signal<Record<string, Message[]>>(initialMessages)

  // Currently selected channel — defaults to the first one.
  const selectedChannelId = signal<string>(channels[0]?.id ?? 'general')

  // Subscribe to the mock server. The unsubscribe is intentionally
  // never called: the store is a singleton for the lifetime of the
  // section, so we want messages to keep flowing even when the user
  // navigates between channels.
  chatBus.subscribe((message) => {
    messagesByChannel.update((current) => {
      const channelMessages = current[message.channelId] ?? []
      return {
        ...current,
        [message.channelId]: [...channelMessages, message],
      }
    })
  })

  /** Reactive accessor for the messages in the currently selected channel. */
  const visibleMessages = computed(() => {
    const id = selectedChannelId()
    return messagesByChannel()[id] ?? []
  })

  // ── Actions ────────────────────────────────────────────────────────
  function selectChannel(id: string): void {
    selectedChannelId.set(id)
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
    messagesByChannel.update((current) => ({
      ...current,
      [channelId]: [...(current[channelId] ?? []), optimistic],
    }))

    try {
      const server = await chatBus.send(channelId, body, ME)
      messagesByChannel.update((current) => ({
        ...current,
        [channelId]: (current[channelId] ?? []).map((m) =>
          m.id === optimisticId ? { ...server, own: true } : m,
        ),
      }))
    } catch (error) {
      // Roll back the optimistic insert.
      messagesByChannel.update((current) => ({
        ...current,
        [channelId]: (current[channelId] ?? []).filter((m) => m.id !== optimisticId),
      }))
      throw error
    }
  }

  return {
    channels,
    messagesByChannel,
    selectedChannelId,
    visibleMessages,
    selectChannel,
    sendMessage,
  }
})

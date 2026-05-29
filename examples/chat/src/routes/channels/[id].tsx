import { onMount } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { useRouter } from '@pyreon/router'
import { useMutation, useQuery, useSSE } from '@pyreon/query'
import { computed, effect, signal } from '@pyreon/reactivity'
import { useUrlState } from '@pyreon/url-state'
import { toast } from '@pyreon/toast'
import { useChatModel } from '../../lib/chat-store'
import type { Channel, Message } from '../../lib/types'
import MessageList from '../../components/MessageList'
import MessageInput from '../../components/MessageInput'

/**
 * Per-channel view — history fetch + live SSE stream + send form.
 *
 * Reactivity flow:
 *   - channelId comes from router params (reactive — re-derives on
 *     route change without remount of the surrounding layout)
 *   - useQuery fetches the initial history (keyed by channelId →
 *     refetches automatically when channelId changes)
 *   - useSSE subscribes to /api/stream/<channelId> (reactive URL →
 *     closes + reopens on channel change)
 *   - A local `messages` signal merges history + live appends. Reset
 *     to history on channel change.
 *   - Search filter from URL state narrows the visible subset.
 */
export default function ChannelPage() {
  const router = useRouter()
  const store = useChatModel()

  // Reactive channelId from route params.
  const channelId = computed<string>(() => (router.currentRoute().params.id ?? 'general') as string)

  // Persist last-visited channel to localStorage as user navigates.
  effect(() => {
    const id = channelId()
    store.setLastVisited(id)
  })

  // Reactive channel metadata.
  const channel = computed<Channel | undefined>(() =>
    (store.channels() as Channel[]).find((c) => c.id === channelId()),
  )

  useHead(() => ({ title: `#${channel()?.name ?? channelId()} — Chat` }))

  // URL-synced search filter.
  const q = useUrlState('q', '')

  // History fetch via @pyreon/query — reactive queryKey re-fetches on
  // channel change. Options are passed as a function so reactive
  // reads inside (channelId()) re-run on change.
  const history = useQuery<Message[]>(() => ({
    queryKey: ['history', channelId()],
    queryFn: async () => {
      const res = await fetch(`/api/history/${channelId()}`)
      if (!res.ok) throw new Error(`history fetch failed: ${res.status}`)
      return res.json() as Promise<Message[]>
    },
  }))

  // Local mutable message list — starts empty, populated by history,
  // appended by SSE, prepended by optimistic sends. Reset on channel
  // change (handled by the effect below).
  const messages = signal<Message[]>([])

  effect(() => {
    // Seed from history when it lands.
    const h = history.data()
    if (h && Array.isArray(h)) {
      messages.set(h)
    }
  })

  // Reset messages BEFORE the new history arrives so we don't show
  // the old channel's messages while the new ones are in flight.
  effect(() => {
    channelId()
    messages.set([])
  })

  // Live stream — useSSE reconnects when channelId changes (reactive URL).
  const sse = useSSE<{ kind?: string } & Partial<Message>>({
    url: () => `/api/stream/${channelId()}`,
    parse: (raw) => JSON.parse(raw) as { kind?: string } & Partial<Message>,
    onMessage: (msg) => {
      if (msg?.kind === 'open') return // connection-ack ping
      if (!msg?.id || !msg?.body) return
      // Append (or deduplicate by id — server echo of an optimistic send).
      messages.update((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev.map((m) =>
            m.id === msg.id ? ({ ...m, ...msg, pending: false } as Message) : m,
          )
        }
        return [...prev, msg as Message]
      })
    },
  })

  // Send mutation — POST to /api/send. The server echoes the message
  // via SSE which the onMessage handler reconciles into the local list.
  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channelId(),
          body,
          author: { name: 'You', color: '#4338ca' },
        }),
      })
      if (!res.ok) throw new Error(`send failed: ${res.status}`)
      return res.json() as Promise<Message>
    },
    onError: (err) => {
      toast.error(`Send failed: ${(err as Error).message}`)
    },
  })

  // Connection status indicator toast (only on transitions to error).
  let lastStatus: string | null = null
  effect(() => {
    const s = sse.status()
    if (lastStatus === 'error' && s === 'connected') {
      toast.success('Reconnected')
    } else if (s === 'error' && lastStatus !== 'error') {
      toast.warning('Connection lost — retrying…')
    }
    lastStatus = s
  })

  function handleSend(body: string) {
    const trimmed = body.trim()
    if (!trimmed) return
    // Optimistic insert.
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    messages.update((prev) => [
      ...prev,
      {
        id: optimisticId,
        channelId: channelId(),
        author: 'You',
        authorColor: '#4338ca',
        body: trimmed,
        createdAt: new Date().toISOString(),
        own: true,
        pending: true,
      },
    ])
    sendMutation.mutate(trimmed)
  }

  // Filtered messages — narrows by search term (case-insensitive).
  const visible = computed<Message[]>(() => {
    const term = q().trim().toLowerCase()
    const all = messages() as Message[]
    if (!term) return all
    return all.filter((m) => m.body.toLowerCase().includes(term))
  })

  // Auto-focus textarea on mount.
  onMount(() => {
    // No-op for now — focus is managed in MessageInput itself.
  })

  return (
    <section class="channel-page" data-testid={`channel-page-${channelId()}`}>
      <header class="channel-header">
        <div class="channel-header-title">
          <span class="channel-hash">#</span>
          <h2>{() => channel()?.name ?? channelId()}</h2>
          <span class="channel-topic">{() => channel()?.topic ?? ''}</span>
        </div>
        <div class="channel-header-status" data-testid="connection-status">
          <span class={() => `conn-dot conn-${sse.status()}`} />
          {() => sse.status()}
        </div>
      </header>

      <div class="channel-search">
        <input
          type="search"
          placeholder="Search this channel…"
          value={() => q()}
          onInput={(e) => q.set((e.currentTarget as HTMLInputElement).value)}
          data-testid="channel-search"
        />
        <span class="channel-search-stats" data-testid="channel-search-stats">
          {() =>
            q().trim()
              ? `${visible().length} of ${(messages() as Message[]).length} match`
              : `${(messages() as Message[]).length} messages`
          }
        </span>
      </div>

      <MessageList messages={visible()} />

      <MessageInput onSend={handleSend} disabled={sendMutation.isPending()} />
    </section>
  )
}

/* oxlint-disable max-lines-per-function -- LiveChannel is one Plain Mode component: its `messages` and `draft` state is written by the history query, the stream, the send mutation and the composer, and read by the render; splitting it would thread that state through props */
import { useHead } from '@pyreon/head'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useSSE } from '@pyreon/query'
import { effect, untrack } from '@pyreon/reactivity'
import { RouterLink, useRouter } from '@pyreon/router'
import { Toaster, toast } from '@pyreon/toast'
import { useUrlState } from '@pyreon/url-state'
import { state, derived } from '@pyreon/core/plain'
import { channels, ME } from '../../../sections/chat/data/seed'
import type { Message } from '../../../sections/chat/data/types'
import { formatTime } from '../../../sections/chat/format'
import {
  ChannelHash,
  ChannelMembers,
  ChannelSidebar,
  ChatHeader,
  ChatHeaderText,
  ChatHeaderTitle,
  ChatHeaderTopic,
  ChatLayout,
  ChatMain,
  ComposerBar,
  ComposerInput,
  MessageAuthor,
  MessageBody,
  MessageBubble,
  MessageContent,
  MessageMeta,
  MessageTime,
  SendButton,
  SidebarHeader,
  SidebarLabel,
  SidebarSubtitle,
  SidebarTitle,
  StatusDot,
  StatusPill,
} from '../../../sections/chat/styled'
import type { ConnectionState } from '../../../sections/chat/connectionMachine'

/**
 * Chat against a real server: the same channels as /chat, but every message
 * goes over HTTP. The in-browser /chat view simulates its server; this one
 * talks to the dev server's chat endpoints (`sections/chat/data/devServer.ts`):
 *
 *   • @pyreon/query `useQuery`    — the channel history, keyed by channel id,
 *                                     so switching channels refetches it
 *   • @pyreon/query `useSSE`      — the live stream; its URL derives from the
 *                                     route param, so it reconnects per channel
 *   • @pyreon/query `useMutation` — an optimistic send, reconciled with the
 *                                     server's copy whether its echo over the
 *                                     stream lands before or after the response
 *   • @pyreon/url-state           — the channel search lives in `?q=`
 *   • @pyreon/router              — one route per channel (/chat/live/:id)
 */
export default function LiveChatRoute() {
  // One client per mounted view, never module-level: a module client would be
  // shared by every request during SSR.
  const client = new QueryClient()
  return (
    <QueryClientProvider client={client}>
      <ChatLayout>
        <ChannelSidebar data-testid="channel-rail">
          <SidebarHeader>
            <SidebarTitle>Pyreon HQ</SidebarTitle>
            <SidebarSubtitle>live server (dev server) · SSE</SidebarSubtitle>
          </SidebarHeader>
          <div>
            <SidebarLabel>Channels</SidebarLabel>
            {channels.map((channel) => (
              <RouterLink
                to={`/chat/live/${channel.id}`}
                data-testid={`channel-link-${channel.id}`}
                style="display: flex; justify-content: space-between; padding: 8px 12px; text-decoration: none; color: inherit;"
              >
                <span>
                  <ChannelHash>#</ChannelHash>
                  {channel.name}
                </span>
                <ChannelMembers>{channel.memberCount}</ChannelMembers>
              </RouterLink>
            ))}
          </div>
        </ChannelSidebar>
        <LiveChannel />
      </ChatLayout>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  )
}

/** `useSSE` status → the connection pill the /chat view already styles. */
const PILL: Record<string, ConnectionState> = {
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'idle',
  error: 'reconnecting',
}

function LiveChannel() {
  const router = useRouter()
  const channelId = derived<string>(() => (router.currentRoute().params.id ?? 'general') as string)
  const channel = derived(() => channels.find((c) => c.id === channelId))
  useHead(() => ({ title: `#${channel?.name ?? channelId} — Live chat — Pyreon App Showcase` }))

  const q = useUrlState('q', '')

  const history = useQuery<Message[]>(() => ({
    queryKey: ['chat-history', channelId],
    queryFn: async () => {
      const res = await fetch(`/api/chat/history/${channelId}`)
      if (!res.ok) throw new Error(`history fetch failed: ${res.status}`)
      return (await res.json()) as Message[]
    },
  }))

  // History, then live appends and optimistic sends. Cleared on a channel
  // change so the old channel never shows while the new history loads.
  let messages = state.raw<Message[]>([])
  effect(() => {
    void channelId
    messages = []
  })
  effect(() => {
    const loaded = history.data()
    if (Array.isArray(loaded)) messages = loaded
  })

  const sse = useSSE<{ kind?: string } & Partial<Message>>({
    url: () => `/api/chat/stream/${channelId}`,
    parse: (raw) => JSON.parse(raw) as { kind?: string } & Partial<Message>,
    onMessage: (msg) => {
      if (msg.kind === 'open' || !msg.id || !msg.body) return
      const current = untrack(() => messages) as Message[]
      // The echo of our own send arrives here too: update it by id, do not duplicate it.
      messages = current.some((m) => m.id === msg.id)
        ? current.map((m) => (m.id === msg.id ? ({ ...m, ...msg, pending: false } as Message) : m))
        : [...current, msg as Message]
    },
  })

  const send = useMutation({
    mutationFn: async (input: { optimisticId: string; body: string }) => {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, body: input.body, author: ME }),
      })
      if (!res.ok) throw new Error(`send failed: ${res.status}`)
      return (await res.json()) as Message
    },
    // The stream may echo the server copy before or after this response: drop
    // the optimistic row if the echo is already in, otherwise give it the
    // server id so the echo dedupes onto it.
    onSuccess: (server, input) => {
      const current = untrack(() => messages) as Message[]
      messages = current.some((m) => m.id === server.id)
        ? current.filter((m) => m.id !== input.optimisticId)
        : current.map((m) => (m.id === input.optimisticId ? ({ ...m, ...server, own: true, pending: false } as Message) : m))
    },
    onError: (error, input) => {
      messages = (untrack(() => messages) as Message[]).filter((m) => m.id !== input.optimisticId)
      toast.error(`Send failed: ${(error as Error).message}`)
    },
  })

  let draft = state('')
  function submit(event: Event): void {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    messages = [
      ...messages,
      {
        id: optimisticId,
        channelId,
        author: ME.name,
        authorColor: ME.color,
        body,
        createdAt: new Date().toISOString(),
        own: true,
        pending: true,
      },
    ]
    draft = ''
    send.mutate({ optimisticId, body })
  }

  const visible = derived<Message[]>(() => {
    const term = q().trim().toLowerCase()
    const all = messages as Message[]
    return term ? all.filter((m) => m.body.toLowerCase().includes(term)) : all
  })

  return (
    <ChatMain data-testid={() => `channel-page-${channelId}`}>
      <ChatHeader>
        <ChatHeaderText>
          <ChatHeaderTitle>
            <ChannelHash>#</ChannelHash>
            {() => channel?.name ?? channelId}
          </ChatHeaderTitle>
          <ChatHeaderTopic>{() => channel?.topic ?? ''}</ChatHeaderTopic>
        </ChatHeaderText>
        {() => {
          const pill = PILL[sse.status()] ?? 'idle'
          return (
            <StatusPill $state={pill} data-testid="connection-status">
              <StatusDot $state={pill} />
              {sse.status()}
            </StatusPill>
          )
        }}
      </ChatHeader>

      <div style="display: flex; gap: 12px; align-items: center; padding: 8px 16px;">
        <input
          type="search"
          placeholder="Search this channel…"
          value={() => q()}
          onInput={(e) => q.set((e.currentTarget as HTMLInputElement).value)}
          data-testid="channel-search"
          style="flex: 1;"
        />
        <span data-testid="channel-search-stats">
          {() =>
            q().trim()
              ? `${visible.length} of ${(messages as Message[]).length} match`
              : `${(messages as Message[]).length} messages`
          }
        </span>
      </div>

      <div data-testid="message-list" style="flex: 1; overflow-y: auto; padding: 0 16px;">
        {() =>
          visible.map((m) => (
            <MessageBubble $own={m.own} $pending={m.pending}>
              <MessageContent $own={m.own}>
                <MessageMeta>
                  <MessageAuthor $color={m.authorColor}>{m.author}</MessageAuthor>
                  <MessageTime>{formatTime(m.createdAt)}</MessageTime>
                </MessageMeta>
                <MessageBody $own={m.own}>{m.body}</MessageBody>
              </MessageContent>
            </MessageBubble>
          ))
        }
      </div>

      <ComposerBar onSubmit={submit}>
        <ComposerInput
          placeholder={() => `Message #${channel?.name ?? channelId}`}
          value={() => draft}
          onInput={(e: Event) => {
            draft = (e.currentTarget as HTMLInputElement).value
          }}
          data-testid="message-input"
        />
        <SendButton type="submit" disabled={() => send.isPending()} data-testid="message-send">
          Send
        </SendButton>
      </ComposerBar>
    </ChatMain>
  )
}

export const meta = {
  title: 'Live chat — Pyreon App Showcase',
}

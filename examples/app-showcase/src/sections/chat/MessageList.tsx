import { effect, signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'
import { formatTime, initials } from './format'
import {
  Avatar,
  MessageBody,
  MessageBubble,
  MessageContent,
  MessageMeta,
  MessageScroll,
  MessageAuthor,
  MessageTime,
  StateCard,
  StateText,
  VirtualInner,
  VirtualRow,
} from './styled'
import { useChat } from './store'

const ROW_HEIGHT = 76
const OVERSCAN = 6

/**
 * Virtualized message list.
 *
 * Demonstrates `@pyreon/virtual`:
 *   • Each channel has 60+ seeded messages, plus live messages pushed
 *     by the mock event bus every few seconds. Without virtualization
 *     a busy chat window would re-render hundreds of DOM nodes per
 *     incoming message.
 *   • The scroll container auto-pins to the bottom so new messages
 *     stay in view — but only when the user is already at the bottom,
 *     so reading older history isn't interrupted.
 */
export function MessageList() {
  const chat = useChat()
  const { store } = chat

  // Scroll container ref — captured via the styled component's ref
  // callback so the virtualizer knows what element it's measuring.
  const scrollEl = signal<HTMLElement | null>(null)
  const setScrollRef = (el: HTMLElement | null) => scrollEl.set(el)

  // Virtualizer over the visible message list.
  const virtual = useVirtualizer<HTMLElement, HTMLElement>(() => ({
    count: store.visibleMessages().length,
    getScrollElement: () => scrollEl(),
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  }))

  // Track whether the user is scrolled to (or near) the bottom. We
  // only auto-scroll on new messages when this is true, so reading
  // older history doesn't get interrupted by incoming chatter.
  const pinnedToBottom = signal(true)

  function onScroll() {
    const el = scrollEl()
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    pinnedToBottom.set(atBottom)
  }

  // Auto-scroll to the bottom when:
  //   • the channel changes (always — pretend the user just clicked in)
  //   • new messages arrive AND the user is already pinned
  effect(() => {
    const id = store.selectedChannelId()
    void id // dependency
    queueMicrotask(() => {
      const el = scrollEl()
      if (el) el.scrollTop = el.scrollHeight
    })
  })
  effect(() => {
    const count = store.visibleMessages().length
    void count // dependency
    if (!pinnedToBottom()) return
    queueMicrotask(() => {
      const el = scrollEl()
      if (el) el.scrollTop = el.scrollHeight
    })
  })

  return () => {
    const messages = store.visibleMessages()
    if (messages.length === 0) {
      return (
        <MessageScroll innerRef={setScrollRef} onScroll={onScroll}>
          <StateCard>
            <StateText>No messages in this channel yet. Say hello!</StateText>
          </StateCard>
        </MessageScroll>
      )
    }
    return (
      <MessageScroll innerRef={setScrollRef} onScroll={onScroll}>
        <VirtualInner style={`--total-h: ${virtual.totalSize()}px`}>
          {() =>
            virtual.virtualItems().map((item) => {
              const message = messages[item.index]
              if (!message) return null
              return (
                <VirtualRow style={`--row-h: ${item.size}px; --row-y: ${item.start}px`}>
                  <MessageBubble $own={message.own} $pending={message.pending}>
                    <Avatar $color={message.authorColor}>{initials(message.author)}</Avatar>
                    <MessageContent $own={message.own}>
                      <MessageMeta>
                        <MessageAuthor $color={message.authorColor}>
                          {message.author}
                        </MessageAuthor>
                        <MessageTime>
                          {formatTime(message.createdAt)}
                          {message.pending ? ' · sending…' : ''}
                        </MessageTime>
                      </MessageMeta>
                      <MessageBody $own={message.own}>{message.body}</MessageBody>
                    </MessageContent>
                  </MessageBubble>
                </VirtualRow>
              )
            })
          }
        </VirtualInner>
      </MessageScroll>
    )
  }
}

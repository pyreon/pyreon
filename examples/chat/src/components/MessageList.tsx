import { onMount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'
import type { Message } from '../lib/types'

interface MessageListProps {
  /**
   * The visible message array. Pyreon's compiler wraps reactive prop
   * expressions as getter-backed accessors via `_rp` + `makeReactiveProps`
   * (CLAUDE.md "Reactive vs Static"). Inside this component, reading
   * `props.messages` returns the LIVE value on each access — putting
   * the read inside a tracking scope (effect / computed / accessor)
   * subscribes to the upstream computed.
   *
   * W24 from chat audit: a typed `messages: () => Message[]` would have
   * matched if the parent passed an arrow explicitly, but does NOT
   * match the canonical `<MessageList messages={visible} />` shape
   * where `visible` is a computed — that pattern's `_rp` wrap unwraps
   * to a value-typed getter, not to a function-typed prop. Type
   * accordingly.
   */
  messages: Message[]
}

/**
 * Virtualized message list. Auto-scrolls to bottom when new messages
 * arrive (the standard chat UX) UNLESS the user has scrolled up
 * intentionally — then leave them where they are.
 */
export default function MessageList(props: MessageListProps) {
  const scrollEl = signal<HTMLDivElement | null>(null)
  const isAtBottom = signal(true)

  const v = useVirtualizer<HTMLDivElement, HTMLElement>(() => ({
    count: props.messages.length,
    getScrollElement: () => scrollEl(),
    estimateSize: () => 64,
    overscan: 8,
    getItemKey: (i) => (props.messages[i]?.id ?? i) as string | number,
  }))

  onMount(() => {
    const el = scrollEl()
    if (!el) return
    el.scrollTop = el.scrollHeight
  })

  effect(() => {
    const el = scrollEl()
    if (!el) return
    const handler = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
      isAtBottom.set(atBottom)
    }
    el.addEventListener('scroll', handler, { passive: true })
    handler()
    return () => el.removeEventListener('scroll', handler)
  })

  // When messages append AND user was at bottom, stick to bottom.
  effect(() => {
    const count = props.messages.length
    const el = scrollEl()
    if (!el || !isAtBottom()) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    void count
  })

  return (
    <div
      class="message-list-scroll"
      ref={(el) => scrollEl.set(el as HTMLDivElement)}
      data-testid="message-list"
    >
      <div
        class="message-list-inner"
        style={() => `height: ${v.totalSize()}px; position: relative;`}
      >
        {() =>
          (v.virtualItems() as Array<{ index: number; key: string | number; start: number; size: number }>).map(
            (vi) => {
              const m = props.messages[vi.index]
              if (!m) return null
              return (
                <article
                  class={`message ${m.own ? 'message-own' : ''} ${m.pending ? 'message-pending' : ''}`}
                  data-message-id={m.id}
                  data-testid={`message-${m.id}`}
                  style={`position:absolute;top:0;left:0;right:0;transform:translateY(${vi.start}px);min-height:${vi.size}px;`}
                >
                  <div class="message-meta">
                    <span class="message-author" style={`color:${m.authorColor}`}>
                      {m.author}
                    </span>
                    <time class="message-time">
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p class="message-body">{m.body}</p>
                </article>
              )
            },
          )
        }
      </div>
    </div>
  )
}

import { signal } from '@pyreon/reactivity'
import { toast } from '@pyreon/toast'
import { ComposerBar, ComposerInput, SendButton } from './styled'
import { useChat } from './store'

interface MessageComposerProps {
  /** Whether the connection is currently in a state that allows sending. */
  enabled: () => boolean
}

/**
 * Message composer at the bottom of the chat. Demonstrates the
 * optimistic-update + toast-on-error pattern via the chat store's
 * `sendMessage` action:
 *
 *   1. Type → press Enter or click Send
 *   2. The store inserts a `pending: true` message immediately
 *   3. The mock bus resolves after ~250ms with the server-acknowledged copy
 *   4. The pending entry is replaced with the real one (no flicker)
 *   5. Every 9th send fails on purpose → the entry is rolled back AND
 *      a toast.error fires so the user knows what happened
 */
export function MessageComposer(props: MessageComposerProps) {
  const chat = useChat()
  const { store } = chat
  const draft = signal('')

  async function submit(e?: Event) {
    e?.preventDefault()
    const body = draft().trim()
    if (!body) return
    if (!props.enabled()) {
      toast.warning('Not connected — wait for the chat to reconnect')
      return
    }
    draft.set('')
    try {
      await store.sendMessage(store.selectedChannelId(), body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send'
      toast.error(message)
    }
  }

  return (
    <ComposerBar onSubmit={submit}>
      <ComposerInput
        type="text"
        placeholder="Message #channel…"
        value={draft()}
        disabled={!props.enabled()}
        onInput={(e: Event) => draft.set((e.target as HTMLInputElement).value)}
      />
      <SendButton type="submit" disabled={!props.enabled() || !draft().trim()}>
        Send
      </SendButton>
    </ComposerBar>
  )
}

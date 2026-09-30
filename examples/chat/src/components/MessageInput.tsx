import { state } from '@pyreon/core/plain'

interface MessageInputProps {
  onSend: (body: string) => void
  disabled: boolean
}

/**
 * Message input. Enter to send (Shift+Enter for newline). Plain
 * `signal()` for the draft — no @pyreon/form because the form layer
 * adds nothing for a single textarea with one validator and the
 * audit's focus is on the streaming path.
 */
export default function MessageInput(props: MessageInputProps) {
  let draft = state('')

  function handleSubmit() {
    const body = draft
    if (!body.trim() || props.disabled) return
    props.onSend(body)
    draft = ''
  }

  return (
    <form
      class="message-input"
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      data-testid="message-input-form"
    >
      <textarea
        class="message-input-textarea"
        placeholder="Message — Enter to send, Shift+Enter for newline"
        rows={2}
        value={() => draft}
        disabled={() => props.disabled}
        onInput={(e) => { draft = (e.currentTarget as HTMLTextAreaElement).value }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
        data-testid="message-input"
      />
      <button
        type="submit"
        class="message-send-btn"
        disabled={() => props.disabled || !draft.trim()}
        data-testid="message-send"
      >
        Send
      </button>
    </form>
  )
}

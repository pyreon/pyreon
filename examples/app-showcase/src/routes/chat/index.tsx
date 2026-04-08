import { onMount, onUnmount } from '@pyreon/core'
import { Toaster } from '@pyreon/toast'
import { ChannelList } from '../../sections/chat/ChannelList'
import { MessageComposer } from '../../sections/chat/MessageComposer'
import { MessageList } from '../../sections/chat/MessageList'
import {
  ChatHeader,
  ChatHeaderText,
  ChatHeaderTitle,
  ChatHeaderTopic,
  ChatLayout,
  ChatMain,
  ChannelHash,
  StatusDot,
  StatusPill,
} from '../../sections/chat/styled'
import {
  STATUS_LABEL,
  connectionMachine,
  type ConnectionState,
} from '../../sections/chat/connectionMachine'
import { chatBus } from '../../sections/chat/data/eventBus'
import { useChat } from '../../sections/chat/store'

/**
 * Chat section — real-time messaging with channels.
 *
 * Demonstrates five fundamentals packages working together:
 *   • @pyreon/store    — chat store holds messagesByChannel + selectedChannelId
 *   • @pyreon/virtual  — virtualized message list (60+ seeded messages
 *                          per channel + live pushes)
 *   • @pyreon/machine  — typed connection state machine
 *                          (idle → connecting → connected → reconnecting → failed)
 *   • @pyreon/toast    — error feedback when a send fails (every 9th
 *                          send deterministically fails)
 *   • @pyreon/styler   — every visual element is a styled component
 *
 * The mock event bus replaces a real WebSocket / SSE connection so the
 * demo runs entirely client-side. Swapping in a real bus is a matter
 * of replacing `chatBus.send` / `chatBus.subscribe` with the actual
 * transport — the route shape stays unchanged.
 */
export default function ChatRoute() {
  const chat = useChat()
  const { store } = chat

  // Connect to the mock server on mount and disconnect on unmount.
  // The state machine drives both the status pill in the header and
  // whether the composer is enabled.
  onMount(() => {
    connectionMachine.send('CONNECT')
    chatBus
      .connect()
      .then(() => connectionMachine.send('OPEN'))
      .catch(() => connectionMachine.send('FAIL'))
  })

  onUnmount(() => {
    chatBus.disconnect()
    connectionMachine.send('DISCONNECT')
  })

  // The composer is only enabled when the machine is in the
  // `connected` state. Reconnecting / failed / idle all disable it.
  const composerEnabled = () => connectionMachine() === 'connected'

  return (
    <ChatLayout>
      <ChannelList />
      <ChatMain>
        <ChatHeader>
          <ChatHeaderText>
            {() => {
              const channel = store.channels.find((c) => c.id === store.selectedChannelId())
              if (!channel) return null
              return (
                <>
                  <ChatHeaderTitle>
                    <ChannelHash>#</ChannelHash>
                    {channel.name}
                  </ChatHeaderTitle>
                  <ChatHeaderTopic>{channel.topic}</ChatHeaderTopic>
                </>
              )
            }}
          </ChatHeaderText>
          {() => {
            const state = connectionMachine() as ConnectionState
            return (
              <StatusPill $state={state}>
                <StatusDot $state={state} />
                {STATUS_LABEL[state]}
              </StatusPill>
            )
          }}
        </ChatHeader>

        <MessageList />
        <MessageComposer enabled={composerEnabled} />
      </ChatMain>

      <Toaster position="bottom-right" />
    </ChatLayout>
  )
}

export const meta = {
  title: 'Chat — Pyreon App Showcase',
}

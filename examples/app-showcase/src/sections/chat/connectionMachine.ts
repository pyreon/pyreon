import { createMachine } from '@pyreon/machine'

/**
 * Chat connection state machine.
 *
 * Models the four states a real-time chat client cycles through:
 *
 *   ┌─────┐  CONNECT   ┌────────────┐  OPEN     ┌────────────┐
 *   │idle │ ─────────> │ connecting │ ─────────>│ connected  │
 *   └─────┘            └────────────┘           └────────────┘
 *      ▲                     │                        │
 *      │                     │ FAIL                   │ DROP
 *      │                     ▼                        ▼
 *      │              ┌────────────┐  RETRY     ┌─────────────┐
 *      └── RESET ───  │   failed   │ <───────── │reconnecting │
 *                     └────────────┘            └─────────────┘
 *                                       FAIL
 *
 * The route component dispatches CONNECT on mount, OPEN once the mock
 * `chatBus.connect()` resolves, and DROP/RETRY in response to bus
 * events. Using a state machine instead of a `connectionStatus` signal
 * gives us:
 *
 *   • Type-safe transitions — `send('OPEN')` only compiles for events
 *     the current state accepts.
 *   • A free read-only `matches('connecting' | 'reconnecting')` API
 *     for the connection-status pill in the header.
 *   • A clear place to hang `onEnter('reconnecting', …)` side-effects
 *     (e.g. exponential-backoff timers).
 */
export const connectionMachine = createMachine({
  initial: 'idle' as const,
  states: {
    idle: {
      on: { CONNECT: 'connecting' },
    },
    connecting: {
      on: { OPEN: 'connected', FAIL: 'failed' },
    },
    connected: {
      on: { DROP: 'reconnecting', DISCONNECT: 'idle' },
    },
    reconnecting: {
      on: { OPEN: 'connected', FAIL: 'failed' },
    },
    failed: {
      on: { RETRY: 'reconnecting', RESET: 'idle' },
    },
  },
})

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

/** Display label for the status pill in the chat header. */
export const STATUS_LABEL: Record<ConnectionState, string> = {
  idle: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  failed: 'Connection failed',
}

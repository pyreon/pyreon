import { AUTHOR_POOL, LIVE_BODIES, channels } from './seed'
import type { Message } from './types'

/**
 * Mock chat server. Replaces the real WebSocket / SSE endpoint a
 * production chat app would use, so the demo runs entirely client-side
 * with no extra services.
 *
 * Exposes the same conceptual surface as a real bus:
 *   • subscribe(listener) — call the listener whenever a "server" event arrives
 *   • send(channelId, message) — pretend to send a message to the server.
 *     Resolves with the server-acknowledged copy after a tiny delay.
 *   • connect() / disconnect() — flip the simulated connection state.
 *     The chat route uses these to drive the @pyreon/machine state machine.
 *
 * The push interval is 4–8 seconds and bodies are picked from the
 * same seed corpus the initial history uses, so messages feel
 * naturally on-topic per channel.
 */

type Listener = (message: Message) => void

let listeners: Set<Listener> = new Set()
let pushTimer: ReturnType<typeof setTimeout> | undefined
let connected = false

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function nextMessage(): Message {
  const channel = pickRandom(channels)
  const author = pickRandom(AUTHOR_POOL)
  const body = pickRandom(LIVE_BODIES[channel.id] ?? ['👋'])
  return {
    id: `msg_${channel.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    channelId: channel.id,
    author: author.name,
    authorColor: author.color,
    body,
    createdAt: new Date().toISOString(),
  }
}

function schedulePush(): void {
  if (!connected) return
  // 4–8 seconds between pushes — enough to see the kinetic enter
  // animation without spamming the demo.
  const delay = 4000 + Math.random() * 4000
  pushTimer = setTimeout(() => {
    if (!connected) return
    const message = nextMessage()
    for (const listener of listeners) listener(message)
    schedulePush()
  }, delay)
}

export const chatBus = {
  /** Register a listener for incoming messages. Returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Pretend to send a message to the server. Resolves with the
   * server-acknowledged copy after a small delay so the route can
   * demonstrate optimistic-update + rollback patterns.
   *
   * Every 9th send fails on purpose so the toast.error path is
   * exercised in the demo.
   */
  async send(channelId: string, body: string, author: { name: string; color: string }): Promise<Message> {
    return new Promise((resolve, reject) => {
      sendCounter += 1
      const shouldFail = sendCounter % 9 === 0
      setTimeout(() => {
        if (shouldFail) {
          reject(new Error('Server unreachable — try again'))
          return
        }
        resolve({
          id: `msg_${channelId}_${Date.now()}`,
          channelId,
          author: author.name,
          authorColor: author.color,
          body,
          createdAt: new Date().toISOString(),
          own: true,
        })
      }, 250)
    })
  },

  /** Simulate connecting to the chat server. */
  connect(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        connected = true
        schedulePush()
        resolve()
      }, 350)
    })
  },

  /** Simulate disconnecting from the chat server. */
  disconnect(): void {
    connected = false
    if (pushTimer !== undefined) {
      clearTimeout(pushTimer)
      pushTimer = undefined
    }
  },

  /** True if the simulated connection is currently open. */
  isConnected(): boolean {
    return connected
  },

  /** Test helper — clears all listeners. Used by `_layout` reset. */
  _reset(): void {
    if (pushTimer !== undefined) clearTimeout(pushTimer)
    pushTimer = undefined
    listeners = new Set()
    connected = false
    sendCounter = 0
  },
}

/**
 * Counter used to deterministically fail every 9th send so the demo
 * always exercises the toast.error path. Module-level so the counter
 * persists across re-renders.
 */
let sendCounter = 0

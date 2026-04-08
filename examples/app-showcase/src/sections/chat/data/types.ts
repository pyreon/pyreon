/**
 * Types for the chat section.
 *
 * The data layer is fully self-contained — no real backend, no real
 * SSE endpoint. A mock event bus simulates a server pushing messages
 * so the @pyreon/query useSubscription pattern looks identical to a
 * production setup.
 */

export interface Channel {
  id: string
  /** Display name shown in the sidebar (without the leading #). */
  name: string
  /** Short description tooltip shown in the channel header. */
  topic: string
  /** Number of members — drives the sidebar member count. */
  memberCount: number
}

export interface Message {
  id: string
  channelId: string
  /** Author display name. */
  author: string
  /** Author hex color used for the avatar swatch. */
  authorColor: string
  /** Plain text body — no markdown rendering for the showcase. */
  body: string
  /** ISO timestamp the server (mock) accepted the message. */
  createdAt: string
  /** Whether this message is the user's own — drives the bubble alignment. */
  own?: boolean
  /** Optimistic flag — true while the message is in flight. */
  pending?: boolean
}

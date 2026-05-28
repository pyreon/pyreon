/** Shared type definitions for chat. */

export interface Channel {
  id: string
  name: string
  topic: string
  memberCount: number
}

export interface Message {
  id: string
  channelId: string
  author: string
  authorColor: string
  body: string
  createdAt: string
  own?: boolean
  pending?: boolean
}

/** The local user identity used when sending. */
export const ME = { name: 'You', color: '#4338ca' } as const

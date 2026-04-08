import type { Channel, Message } from './types'

/**
 * Deterministic seed channels and message history. Same Mulberry32
 * trick as the dashboard so screenshots stay stable across reloads.
 */

export const channels: Channel[] = [
  { id: 'general', name: 'general', topic: 'Company-wide announcements and updates', memberCount: 142 },
  { id: 'engineering', name: 'engineering', topic: 'Tech talk, code reviews, infra', memberCount: 38 },
  { id: 'design', name: 'design', topic: 'Design crits, Figma threads, brand', memberCount: 24 },
  { id: 'random', name: 'random', topic: 'Off-topic chatter and memes', memberCount: 87 },
  { id: 'launches', name: 'launches', topic: 'Ship logs and launch coordination', memberCount: 19 },
]

const AUTHORS: Array<{ name: string; color: string }> = [
  { name: 'Aisha Aldridge', color: '#6366f1' },
  { name: 'Ben Brennan', color: '#10b981' },
  { name: 'Chiara Castellano', color: '#ef4444' },
  { name: 'Dmitri Diaz', color: '#f59e0b' },
  { name: 'Elena Eriksson', color: '#0ea5e9' },
  { name: 'Felix Fontaine', color: '#a855f7' },
  { name: 'Gabriela Greene', color: '#14b8a6' },
] as const

const SEED_BODIES: Record<string, string[]> = {
  general: [
    'Quick reminder: company all-hands tomorrow at 10am UTC.',
    'Welcome aboard, Priya! 👋 Glad to have you on the team.',
    'New office snacks have arrived. Kitchen, third floor.',
    'Heads up — VPN maintenance window tonight 11pm to 1am.',
    'Q2 OKR draft is in the planning doc, comments welcome.',
    'Friday demo day moved to 4pm so EU folks can attend.',
    'Reminder to file expense reports before end of month.',
  ],
  engineering: [
    'Just merged the lazy-route PR — main entry dropped 10x.',
    "Anyone seen the flaky test in `runtime-dom`? It's been 3 days.",
    "I'm grabbing a fresh build of the compiler if anyone needs.",
    'PR review queue is down to 4 — nice work everyone.',
    'Postgres v17 upgrade is scheduled for Saturday morning.',
    'Switched the staging deploy to Bun 1.4 — feels noticeably faster.',
    'New benchmark numbers are up: createRows down to 9ms.',
    "Anyone want to pair on the websocket retry logic?",
  ],
  design: [
    'Posted the new auth-flow mocks in Figma. Crit Friday at 2pm.',
    'Color palette refresh is live — see the design-tokens doc.',
    'Looking for feedback on the empty-state illustration set.',
    'Updated the spacing scale to use 4px as base unit.',
  ],
  random: [
    'Coffee machine is broken again 😭',
    'Anyone want to grab lunch at the new ramen place?',
    'My cat learned to open doors today and I\'m a little scared',
    'Sunset over the office tonight is unreal',
    'Reminder: pet pictures channel exists and is empty',
  ],
  launches: [
    'Launch checklist for v0.13 is live in the launches doc.',
    'Marketing assets approved by Sarah, ready to ship.',
    'Tagging the release branch in 30 minutes.',
    'Production deploy completed. Monitoring dashboards green.',
  ],
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = makeRng(0xc4afe)

function pickAuthor(): { name: string; color: string } {
  return AUTHORS[Math.floor(rng() * AUTHORS.length)] as { name: string; color: string }
}

/**
 * Build a long history per channel — at least 60 messages so the
 * virtualizer is meaningfully exercised. Timestamps walk backwards
 * from "now" by random 1–10 minute increments.
 */
function buildHistory(channelId: string): Message[] {
  const bodies = SEED_BODIES[channelId] ?? []
  const messages: Message[] = []
  let cursor = Date.now()
  const total = 60
  for (let i = 0; i < total; i++) {
    const author = pickAuthor()
    const body = bodies[Math.floor(rng() * bodies.length)] ?? '👍'
    cursor -= Math.floor(rng() * 9 + 1) * 60_000
    messages.push({
      id: `msg_${channelId}_${i}`,
      channelId,
      author: author.name,
      authorColor: author.color,
      body,
      createdAt: new Date(cursor).toISOString(),
    })
  }
  // Reverse so the oldest is first and the newest is at the bottom.
  return messages.reverse()
}

/** Initial message history per channel — keyed by channel id. */
export const initialMessages: Record<string, Message[]> = {}
for (const channel of channels) {
  initialMessages[channel.id] = buildHistory(channel.id)
}

/** Body strings used by the mock server when it pushes "live" messages. */
export const LIVE_BODIES = SEED_BODIES

/** Author pool the mock server picks from when it pushes a message. */
export const AUTHOR_POOL = AUTHORS

/** Identity used by `MessageComposer` when sending — the user is "you". */
export const ME = { name: 'You', color: '#4338ca' } as const

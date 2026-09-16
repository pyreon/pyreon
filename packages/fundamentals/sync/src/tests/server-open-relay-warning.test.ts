import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSyncServer, type SyncServer } from '../server'

// `authorize` is optional and its default is "accept everything". A relay
// deployed without it is an OPEN relay: anyone who can reach the port joins any
// room and reads and rewrites its document. The default was documented as
// dev-only and said nothing at runtime, so the only signal a deploy got was a
// doc comment nobody re-reads.

let server: SyncServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
  vi.restoreAllMocks()
})

type WarnSpy = { mock: { calls: unknown[][] } }

function warnings(spy: WarnSpy): string[] {
  return spy.mock.calls
    .map((c) => String(c[0]))
    .filter((m) => m.includes('[Pyreon sync]'))
}

describe('an un-authorized relay says so', () => {
  it('warns when `authorize` is omitted, naming the option', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server = await createSyncServer({ port: 0 })

    const found = warnings(warn)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('authorize')
  })

  it('warns exactly ONCE per server, not once per connection', async () => {
    // Warning on every upgrade would make a busy relay's logs unreadable, which
    // is its own way of being unseen.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server = await createSyncServer({ port: 0 })
    expect(warnings(warn)).toHaveLength(1)
  })

  it('stays silent when `authorize` IS supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server = await createSyncServer({ port: 0, authorize: () => true })

    expect(warnings(warn)).toEqual([])
  })

  it('warns in PRODUCTION too — a live misconfiguration, not a dev nicety', async () => {
    // Gating this on NODE_ENV would hide it from exactly the deploy it is about.
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      server = await createSyncServer({ port: 0 })
      expect(warnings(warn)).toHaveLength(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('each fresh server gets its own verdict', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = await createSyncServer({ port: 0 })
    const b = await createSyncServer({ port: 0 })
    try {
      expect(warnings(warn)).toHaveLength(2)
    } finally {
      await a.close()
      await b.close()
    }
  })
})

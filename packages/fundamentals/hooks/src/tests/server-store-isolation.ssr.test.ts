// The server arm, in its own file because it mocks the environment flag at
// module load — a per-file mock, not something a single `it` can scope. Same
// convention as `useCamera.ssr.test.ts`.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@pyreon/reactivity', async () => {
  const actual = await vi.importActual<typeof import('@pyreon/reactivity')>('@pyreon/reactivity')
  return { ...actual, isServer: true, isClient: false }
})

const { useDatabase } = await import('../useDatabase')
const { useSecureStorage } = await import('../useSecureStorage')

/**
 * Both hooks back their web arm with a MODULE-SCOPED map. That is the right
 * scope in a browser, where one process serves one user, and the wrong one on a
 * server, where one process serves everyone: a component that writes during SSR
 * leaves the value there for every LATER request to read.
 *
 * These specs model two requests as two calls in the same module instance,
 * which is exactly what two SSR renders in one server process are.
 */
describe('server-side stores do not cross request boundaries', () => {
  it('useDatabase: one render’s records are invisible to the next', () => {
    useDatabase().insert('notes', {
      id: 'n1',
      fields: { owner: 'alice', body: 'alice private note' },
    } as never)

    // A different visitor, same process.
    expect(useDatabase().all('notes')).toEqual([])
  })

  it('useSecureStorage: one render’s SECRET is invisible to the next', () => {
    useSecureStorage().write('session-token', 'alice-bearer-abc123')

    const next = useSecureStorage()
    expect(next.read('session-token')).toBeNull()
    expect(next.contains('session-token')).toBe(false)
  })

  it('useSecureStorage.write reports that it stored nothing', () => {
    // Returning `true` would claim a secret was stored somewhere it can be read
    // back from. It cannot be — a caller that needs server-side secrets should
    // use the request context or the environment.
    expect(useSecureStorage().write('k', 'v')).toBe(false)
  })

  it('reads are consistent within one render — every caller sees empty', () => {
    // The alternative to a shared map is a PER-CALL one, which would make two
    // components in the same render disagree. An inert store is consistent for
    // everyone AND carries nothing across requests.
    expect(useDatabase().all('notes')).toEqual([])
    expect(useDatabase().all('notes')).toEqual([])
    expect(useSecureStorage().read('anything')).toBeNull()
  })
})

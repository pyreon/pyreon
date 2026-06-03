import { describe, expect, it } from 'vitest'
import { island as islandFromClient } from '../client'
import { island as islandFromIndex } from '../index'
import { island as islandFromSource } from '../island'

// `island()` is client-safe and must be importable WITHOUT the server barrel.
// A zero route (which ships to the client) that did `import { island } from
// '@pyreon/server'` dragged createHandler/prerender + their node: deps + the
// package's registerSingleton into the client/route bundle → dual @pyreon/*
// instance (sentinel) + node: in the browser. Exporting island() from the
// CLIENT-safe `@pyreon/server/client` subentry is the fix; the
// `check-client-bundle-node-imports` gate (now covering `/client`) locks that
// `/client` never transitively pulls a node: import.
describe('island() — client-safe export', () => {
  it('is re-exported from @pyreon/server/client', () => {
    expect(typeof islandFromClient).toBe('function')
  })

  it('is the SAME function as the source module + the main barrel (real, not a stub)', () => {
    expect(islandFromClient).toBe(islandFromSource)
    expect(islandFromIndex).toBe(islandFromSource)
  })

  it('returns a component that renders the <pyreon-island> marker', () => {
    const Probe = islandFromClient(() => Promise.resolve({ default: () => null }), {
      name: 'Probe',
      hydrate: 'visible',
    })
    expect(typeof Probe).toBe('function')
  })
})

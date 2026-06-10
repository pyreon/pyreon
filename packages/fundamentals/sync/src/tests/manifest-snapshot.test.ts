import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'

// Snapshot of the @pyreon/sync manifest's rendered output. Lives inside the
// package (not @pyreon/manifest) so a future API change that needs a manifest
// edit + regenerated docs stays within this package's review scope. The
// one-liner is locked as a full inline snapshot (stable, single line); the
// large llms-full section + the MCP api-reference are spot-checked (count +
// key symbols) rather than full-body snapshotted, since prose-dense text rots
// fast under -u. Update the inline snapshot intentionally via `bun run test -- -u`.
describe('gen-docs — @pyreon/sync manifest snapshot', () => {
  it('renders the llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/sync — Local-first CRDT-backed sync for signals — a synced signal IS a signal, so a remote op drives ONE fine-grained DOM update, not a re-render. \`@pyreon/sync\` (core bridge — engine-free, universal), \`@pyreon/sync/yjs\` (real Yjs engine + transports + persistence + collaborative text/lists — pulls in \`yjs\`), \`@pyreon/sync/server\` (Node/Bun relay — pulls in \`ws\` + \`node:http\`, never import into client code)."`,
    )
  })

  it('renders the llms-full.txt section header + key content', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section).toContain('## @pyreon/sync — Local-First Sync')
    expect(section).toContain('wrapSignal')
    expect(section).toContain('@pyreon/sync/yjs')
    expect(section).toContain('@pyreon/sync/server')
    // Honest-limits gotcha must survive into the generated section.
    expect(section).toContain('CRDTs prevent lost UPDATES, not semantic conflicts')
  })

  it('renders the MCP api-reference region with every API entry', () => {
    const entries = renderApiReferenceEntries(manifest)
    // One MCP entry per manifest.api[] symbol, keyed `sync/<name>`.
    expect(Object.keys(entries).length).toBe(manifest.api.length)
    // The load-bearing public surface across all three subpaths.
    for (const key of [
      'sync/syncedSignal',
      'sync/syncedStore',
      'sync/createYjsDoc',
      'sync/syncedText',
      'sync/syncedList',
      'sync/persistViaIndexedDB',
      'sync/connectViaBroadcastChannel',
      'sync/connectViaWebSocket',
      'sync/createSyncServer',
      'sync/LOCAL_ORIGIN',
      'sync/REMOTE_ORIGIN',
    ]) {
      expect(entries[key], `missing api-reference entry: ${key}`).toBeDefined()
    }
    // Flagship APIs carry a foot-gun catalog (MCP `validate` density).
    expect(entries['sync/createSyncServer']?.mistakes).toBeTruthy()
    expect(entries['sync/syncedSignal']?.mistakes).toBeTruthy()
  })
})

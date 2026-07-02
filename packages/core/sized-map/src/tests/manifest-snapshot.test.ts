import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — sized-map snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/sized-map — Bounded Map<K, V> — evicts the oldest entry at a maxEntries cap; FIFO (default) or LRU-on-read mode. FIFO fits hot paths where a per-read recency bump (a \`delete\` + \`set\` pair) would dominate the real work (runtime-dom \`_tplCache\`, router loader/component caches). LRU-on-read fits caches where frequently-read entries must survive small caps (rocketstyle \`_rsMemo\`, \`@pyreon/lint\` AstCache, \`@pyreon/zero\` ISR \`createMemoryStore\`)."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/sized-map — Sized Map

      A bounded \`Map<K, V>\` primitive that evicts the oldest entry when a size cap is exceeded. Two modes per instance: FIFO (default) — \`.get()\` never touches ordering, cheapest semantics for hot paths; LRU-on-read (\`lru: true\`) — \`.get()\` re-inserts the entry at the tail so frequently-read entries survive cap pressure. In BOTH modes \`.set()\` treats a key collision as a recency hit (delete + re-append at the tail). It is the one shared eviction implementation behind Pyreon's internal sized caches — it replaced 9 hand-rolled inline eviction snippets (Memory Leak Class C).

      \`\`\`typescript
      import { SizedMap } from '@pyreon/sized-map'

      // FIFO (default) — hot path: get() never touches ordering
      const tplCache = new SizedMap<string, HTMLTemplateElement>({ maxEntries: 1024 })
      tplCache.set('key', tpl)
      tplCache.get('key')      // pure read — no recency bump

      // LRU-on-read — frequently-read entries survive small caps
      const memo = new SizedMap<string, Entry>({ maxEntries: 128, lru: true })
      memo.get('hot')          // re-inserted at the tail — evicted last

      // Map-shaped surface
      memo.has('hot')          // true
      memo.size                // number (getter, not a method)
      for (const [k, v] of memo) { /* insertion/recency order */ }

      const opts: SizedMapOptions = { maxEntries: 256, lru: true }
      const cache = new SizedMap<string, string>(opts)
      \`\`\`

      > **Mode choice**: FIFO fits hot paths where a per-read recency bump (a \`delete\` + \`set\` pair) would dominate the real work (runtime-dom \`_tplCache\`, router loader/component caches). LRU-on-read fits caches where frequently-read entries must survive small caps (rocketstyle \`_rsMemo\`, \`@pyreon/lint\` AstCache, \`@pyreon/zero\` ISR \`createMemoryStore\`).
      >
      > **Not a Map subclass**: SizedMap wraps a private \`Map\` rather than extending it — \`instanceof Map\` is \`false\` and there is no \`forEach\`. The surface is \`get\` / \`set\` / \`delete\` / \`has\` / \`clear\` / \`size\` (getter) / \`keys\` / \`values\` / \`entries\` / \`[Symbol.iterator]\`.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(2)
    expect(record['sized-map/SizedMap']!.notes).toContain('FIFO')
    expect(record['sized-map/SizedMap']!.mistakes?.split('\n').length).toBe(5)
  })
})

import { describe, expect, it } from 'vitest'
import { renderApiReferenceEntries, renderLlmsTxtLine } from '@pyreon/manifest'
import zeroManifest from '../manifest'

// Snapshot of the rendered llms.txt + MCP api-reference output for
// @pyreon/zero. Lives inside the package so ownership tracks with the
// manifest — a future zero API change that needs a manifest edit +
// regenerated snapshot stays within this package's review scope.
//
// Update intentionally via `bun run test -- -u` after a deliberate
// manifest change.
//
// Coverage matches the flow-package reference: a tight llms.txt
// bullet snapshot (one line, locks the tagline + first-gotcha teaser)
// + a `renderApiReferenceEntries` structural spot-check (entry count +
// key fields). The MCP body itself is dense prose — inline-snapshotting
// the full body rots fast and produces noisy diffs.

describe('gen-docs — zero snapshot', () => {
  it('renders @pyreon/zero to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(zeroManifest)).toMatchInlineSnapshot(
      `"- @pyreon/zero — Full-stack meta-framework: fs-routing, SSR/SSG/ISR/SPA, API routes, server actions, adapters, i18n. mode: 'ssg' returns Plugin[] (the SSG plugin auto-attaches a companion \`ssgPlugin()\`); Vite's plugins array flattens nested arrays so \`plugins: [pyreon(), zero()]\` works as-is."`,
    )
  })

  it('renders the full MCP api-reference surface — entry count + key fields', () => {
    // Spot-check the entries that AI agents most commonly query for —
    // missing any of these is a regression (the SSG roadmap surface was
    // shipped specifically to be MCP-discoverable). The full body of
    // each entry is too dense for inline snapshots to be useful; locking
    // the SHAPE (keys present, signature non-empty, mistakes catalogued
    // for flagship APIs) catches structural drift without false-positive
    // churn on every prose tweak.
    const record = renderApiReferenceEntries(zeroManifest)
    const keys = Object.keys(record)

    // Every API entry rendered as `zero/<name>` — confirms the per-package
    // namespacing convention is intact (mirrors `flow/createFlow` etc.).
    expect(keys.every((k) => k.startsWith('zero/'))).toBe(true)

    // Flagship SSG roadmap surface — these are the entries that make
    // the manifest worth shipping. Dropping any of them defeats the
    // "AI agents can discover the SSG/i18n APIs via MCP" goal.
    expect(keys).toContain('zero/zero')
    expect(keys).toContain('zero/I18nRoutingConfig')
    expect(keys).toContain('zero/expandRoutesForLocales')
    expect(keys).toContain('zero/GetStaticPaths')
    expect(keys).toContain('zero/Adapter')
    expect(keys).toContain('zero/createISRHandler')
    expect(keys).toContain('zero/vercelAdapter')
    expect(keys).toContain('zero/cloudflareAdapter')
    expect(keys).toContain('zero/netlifyAdapter')
    expect(keys).toContain('zero/seoPlugin')
    expect(keys).toContain('zero/aiPlugin')
    expect(keys).toContain('zero/i18nRouting')
    expect(keys).toContain('zero/validateEnv')
    expect(keys).toContain('zero/cspMiddleware')
    expect(keys).toContain('zero/useRequestLocals')

    // Three-layer extensibility surface — Link / Image / Script each
    // expose a hook + HOC + default component. AI agents need every
    // entry to discover the extensibility pattern (otherwise they'll
    // only find the default component and miss the customization path).
    expect(keys).toContain('zero/Link')
    expect(keys).toContain('zero/useLink')
    expect(keys).toContain('zero/createLink')
    expect(keys).toContain('zero/prefetchRoute')
    expect(keys).toContain('zero/Icon')
    expect(keys).toContain('zero/createIcon')
    expect(keys).toContain('zero/iconsPlugin')
    expect(keys).toContain('zero/createNamedIcon')
    expect(keys).toContain('zero/Image')
    expect(keys).toContain('zero/useImage')
    expect(keys).toContain('zero/createImage')
    expect(keys).toContain('zero/Script')
    expect(keys).toContain('zero/useScript')
    expect(keys).toContain('zero/createScript')

    // Total entry count — locks the count so an accidental delete shows
    // up as a snapshot failure. Bump intentionally when adding a new
    // API entry. The `gen-docs --check` CI gate catches the same drift
    // from the OTHER direction (rendered file out of sync with source).
    expect(keys.length).toBe(29)

    // Flagship APIs MUST carry MCP-density mistakes lists — drop one
    // and the snapshot fails loudly. The 6+ mistakes convention is
    // documented in CLAUDE.md (manifest-driven docs pipeline).
    const flagship = [
      'zero/zero',
      'zero/I18nRoutingConfig',
      'zero/expandRoutesForLocales',
      'zero/Link',
      'zero/useLink',
      'zero/createLink',
      'zero/Image',
      'zero/useImage',
      'zero/createImage',
      'zero/Script',
      'zero/useScript',
      'zero/createScript',
    ]
    for (const key of flagship) {
      expect(record[key]?.mistakes).toBeDefined()
      expect(record[key]?.mistakes?.length).toBeGreaterThan(0)
    }

    // Every entry has a signature + example (load-bearing for the MCP
    // get_api_reference tool — agents see these fields directly).
    for (const key of keys) {
      const entry = record[key]
      expect(entry?.signature).toBeTruthy()
      expect(entry?.example).toBeTruthy()
    }
  })
})

// The multiplatform-tier contract gate (backlog M6.2) — unit coverage for
// its pure policy pieces plus the REAL-REPO invariant the gate exists to
// hold: every published package either declares a multiplatform story in its
// manifest or sits on the explicit no-consumable-runtime-API exempt list.
//
// Policy functions are called DIRECTLY (no subprocess fork — see
// .claude/rules/anti-patterns.md "Subprocess testing as a default").

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findManifests } from '../../../manifest/src'
import {
  listPublishedPackages,
  renderTierTable,
} from '../../../../../scripts/check-multiplatform-tier'

const REPO = resolve(__dirname, '../../../../..')

describe('renderTierTable', () => {
  const rows = [
    { name: '@pyreon/reactivity', tier: 'shared', rationale: 'L0 lowers everywhere' },
    { name: '@pyreon/router', tier: 'service-backend', rationale: 'native router ports' },
    { name: '@pyreon/charts', tier: 'web-only', rationale: 'wraps ECharts' },
    { name: '@pyreon/flow', tier: 'web-only', rationale: 'wraps elkjs' },
  ]

  it('renders one section per tier with per-tier counts', () => {
    const table = renderTierTable(rows)
    expect(table).toContain('`shared` — the authoring surface lowers on every target (1)')
    expect(table).toContain('`service-backend` — one API, per-target runtime backends (1)')
    expect(table).toContain('`web-only` — architecturally coupled to the web platform (2)')
  })

  it('places every row under its own tier with its rationale', () => {
    const table = renderTierTable(rows)
    expect(table).toContain('| `@pyreon/charts` | wraps ECharts |')
    expect(table).toContain('| `@pyreon/reactivity` | L0 lowers everywhere |')
    // The web-only section must not swallow the shared rows: reactivity
    // appears exactly once.
    expect(table.match(/@pyreon\/reactivity/g)).toHaveLength(1)
  })

  it('emits MDX-safe output — zero-content compiles docs .md as MDX', () => {
    // Two classes broke the REAL docs build (Build Docs red on the first CI
    // run): HTML comments (<!-- -->) are invalid MDX, and a raw <Tag> in a
    // table cell parses as an unclosed JSX element. Markers are MDX comments
    // and every OPENING angle bracket must live inside a backtick code span (a bare > is legal markdown — blockquotes).
    const table = renderTierTable(rows)
    expect(table).not.toContain('<!--')
    for (const line of table.split('\n')) {
      const outsideCode = line.split('`').filter((_, i) => i % 2 === 0).join('')
      expect(outsideCode, `raw angle bracket outside a code span in: ${line}`).not.toMatch(/</)
    }
  })

  it('the REAL rendered table is MDX-safe too — rationales are data, not markup', async () => {
    const manifests = await findManifests(REPO)
    const realRows = manifests.map((m) => {
      const mp = (m.manifest as { multiplatform?: { tier?: string; rationale?: string } })
        .multiplatform
      return { name: m.manifest.name, tier: mp?.tier ?? '', rationale: mp?.rationale ?? '' }
    })
    for (const line of renderTierTable(realRows).split('\n')) {
      const outsideCode = line.split('`').filter((_, i) => i % 2 === 0).join('')
      expect(outsideCode, `raw angle bracket outside a code span in: ${line}`).not.toMatch(/</)
    }
  })

  it('is wrapped in the gen markers the drift check keys on (MDX comments, not HTML)', () => {
    const table = renderTierTable(rows)
    expect(table.startsWith('{/* gen:multiplatform-tiers:start */}')).toBe(true)
    expect(table.endsWith('{/* gen:multiplatform-tiers:end */}')).toBe(true)
  })
})

describe('listPublishedPackages (real repo)', () => {
  it('finds the published set and excludes private packages', () => {
    const pkgs = listPublishedPackages(REPO)
    const names = pkgs.map((p) => p.name)
    expect(names).toContain('@pyreon/reactivity')
    expect(names).toContain('@pyreon/native-cli') // publishable since #2558
    expect(names).not.toContain('@pyreon/test-utils') // private
    expect(names).not.toContain('@pyreon/manifest') // private
    expect(pkgs.length).toBeGreaterThan(70)
  })
})

describe('the real-repo contract the gate holds', () => {
  it('every manifest declares a valid multiplatform story (web-only ⇒ rationale)', async () => {
    const manifests = await findManifests(REPO)
    expect(manifests.length).toBeGreaterThan(50)
    for (const { manifest } of manifests) {
      const mp = (manifest as { multiplatform?: { tier?: string; rationale?: string } })
        .multiplatform
      expect(mp, `${manifest.name} declares no multiplatform story`).toBeDefined()
      expect(
        ['shared', 'service-backend', 'web-only'],
        `${manifest.name} has an unknown tier`,
      ).toContain(mp!.tier)
      if (mp!.tier === 'web-only') {
        expect(
          mp!.rationale,
          `${manifest.name} is web-only without a rationale — "why can this never ` +
            `lower?" is the load-bearing sentence`,
        ).toBeTruthy()
      }
    }
  })

  it('the PMTC compiler and the declared tiers agree on web-only', async () => {
    // The compiler warns on imports from its WEB_ONLY_PACKAGES set; a package
    // the compiler treats as web-only must not DECLARE itself shared or
    // service-backend — that disagreement is exactly the silent divergence
    // the tier field exists to prevent. (The reverse is fine: a package can
    // be web-only for reasons the compiler has no list entry for.)
    const parseSource = (await import('node:fs')).readFileSync(
      resolve(REPO, 'packages/native/compiler/src/parse.ts'),
      'utf8',
    )
    const setMatch = parseSource.match(
      /const WEB_ONLY_PACKAGES = new Set\(\[([\s\S]*?)\]\)/,
    )
    expect(setMatch, 'WEB_ONLY_PACKAGES not found in parse.ts').toBeTruthy()
    const compilerWebOnly = [...setMatch![1]!.matchAll(/'(@pyreon\/[a-z-]+)'/g)].map(
      (m) => m[1]!,
    )
    expect(compilerWebOnly.length).toBeGreaterThan(10)

    const manifests = await findManifests(REPO)
    const tierOf = new Map(
      manifests.map((m) => [
        m.manifest.name,
        (m.manifest as { multiplatform?: { tier?: string } }).multiplatform?.tier,
      ]),
    )
    for (const name of compilerWebOnly) {
      const tier = tierOf.get(name)
      if (tier === undefined) continue // no manifest (e.g. ui-components) — out of scope
      expect(
        tier,
        `${name} is in the compiler's WEB_ONLY_PACKAGES but declares tier '${tier}'`,
      ).toBe('web-only')
    }
  })
})

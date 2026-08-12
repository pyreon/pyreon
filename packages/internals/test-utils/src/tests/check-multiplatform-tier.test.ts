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
  deriveWebOnlyPackages,
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

  it('the PMTC compiler and the declared tiers agree on web-only — BOTH ways', async () => {
    // This assertion used to run in ONE direction: every entry in the
    // compiler's set must declare tier 'web-only'. Its comment then waved the
    // other direction through — "the reverse is fine: a package can be
    // web-only for reasons the compiler has no list entry for".
    //
    // The reverse was not fine, and it is the harmful direction. A package
    // that DECLARES web-only while the compiler has no entry produces no
    // diagnostic at all: the import emits verbatim and the native build dies
    // with `cannot find 'x' in scope`, pointing nowhere near the cause. Four
    // packages shipped that way (url-state / head / hotkeys / feature), and
    // the two the maintainers had already found by hand — sync and rich-text
    // — were patched into the literal after the fact with a comment saying so.
    //
    // The set is now DERIVED from the declarations, so equality is the honest
    // assertion, and the gate regenerates it. Partially-lowering packages are
    // excluded by declaring `nativeFrontend`, not by being absent.
    const parseSource = (await import('node:fs')).readFileSync(
      resolve(REPO, 'packages/native/compiler/src/parse.ts'),
      'utf8',
    )
    const setMatch = parseSource.match(
      /const WEB_ONLY_PACKAGES: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/,
    )
    expect(setMatch, 'WEB_ONLY_PACKAGES not found in parse.ts').toBeTruthy()
    const compilerWebOnly = [...setMatch![1]!.matchAll(/'(@pyreon\/[a-z-]+)'/g)].map((m) => m[1]!)
    expect(compilerWebOnly.length).toBeGreaterThan(10)

    const manifests = await findManifests(REPO)
    const rows = manifests.map((m) => {
      const mp = (m.manifest as {
        multiplatform?: { tier?: string; rationale?: string; nativeFrontend?: string }
      }).multiplatform
      return {
        name: m.manifest.name,
        tier: mp?.tier ?? '',
        rationale: mp?.rationale ?? '',
        nativeFrontend: mp?.nativeFrontend ?? '',
      }
    })
    expect(compilerWebOnly).toEqual(deriveWebOnlyPackages(rows))
  })
})

// The derivation that replaced the native compiler's hand-written
// WEB_ONLY_PACKAGES literal. That list rotted in both directions — a missing
// entry let an import emit verbatim and die with `cannot find 'x' in scope`
// and no diagnostic; a stale entry told users a working API was unusable.
// Deriving it from the declared tier is what closes the class; these lock the
// policy, and the gate (section 4) locks the generated file against it.
describe('deriveWebOnlyPackages', () => {
  const row = (name: string, tier: string, nativeFrontend = '') => ({
    name,
    tier,
    rationale: 'r',
    nativeFrontend,
  })

  it('includes web-only packages and excludes every other tier', () => {
    const got = deriveWebOnlyPackages([
      row('@pyreon/flow', 'web-only'),
      row('@pyreon/reactivity', 'shared'),
      row('@pyreon/store', 'service-backend'),
    ])
    expect(got).toContain('@pyreon/flow')
    expect(got).not.toContain('@pyreon/reactivity')
    expect(got).not.toContain('@pyreon/store')
  })

  // The load-bearing half. A package whose CORE lowers (toast → PyreonToast)
  // is still web-only in the large, so the tier alone cannot decide this; the
  // presence of `nativeFrontend` is what keeps it out of the blanket warning.
  it('excludes a web-only package that declares a nativeFrontend', () => {
    const got = deriveWebOnlyPackages([
      row('@pyreon/toast', 'web-only', 'PyreonToast — toast(...) and <Toaster />'),
      row('@pyreon/flow', 'web-only'),
    ])
    expect(got).not.toContain('@pyreon/toast')
    expect(got).toContain('@pyreon/flow')
  })

  it('always carries the manifest-less private packages', () => {
    const got = deriveWebOnlyPackages([])
    expect(got).toEqual(['@pyreon/ui-components', '@pyreon/ui-primitives'])
  })

  it('is sorted and de-duplicated so the generated file is stable', () => {
    const got = deriveWebOnlyPackages([
      row('@pyreon/zzz', 'web-only'),
      row('@pyreon/aaa', 'web-only'),
      row('@pyreon/ui-components', 'web-only'),
    ])
    expect(got).toEqual([...got].sort())
    expect(new Set(got).size).toBe(got.length)
  })
})

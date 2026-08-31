import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import type { Severity } from '../types'

/**
 * The hand-maintained surfaces that must track the rule registry.
 *
 * Two of them, both found rotted:
 *
 * 1. `schema/pyreonlintrc.schema.json` — what an editor validates a user's
 *    config against.
 * 2. `manifest.ts`'s per-group counts — what `gen-docs` renders into the docs
 *    site, llms.txt and the MCP api-reference.
 *
 * Neither is generated, and nothing checked either one. The `pyreon` group
 * had already drifted to 51 against a live 52 BEFORE any of this session's
 * work, so the number every AI assistant and every docs reader saw was simply
 * wrong, and had been silently.
 *
 * The schema is what an editor validates a user's `.pyreonlintrc.json`
 * against, and its `groups` block is a hand-maintained list with
 * `additionalProperties: false`. That combination rots in the one direction
 * nobody notices: adding a rule GROUP is a change in `rules/groups.ts`, and
 * nothing made the schema follow. It had drifted to FOUR of ten — so
 * `groups: { portable: 'warn' }`, the line that turns on the native tier for
 * a scaffolded multiplatform app, was flagged as an invalid key in every
 * editor while working perfectly at runtime.
 *
 * That is the worse half of the failure: the config is CORRECT and the tool
 * says it is wrong, which teaches people to delete working configuration.
 *
 * Same hand-maintained-subset class as the exemptPaths and doc-claim gates:
 * a list that must track a registry needs a test, or it tracks nothing.
 */

const SCHEMA_PATH = join(import.meta.dirname, '..', '..', 'schema', 'pyreonlintrc.schema.json')

interface Schema {
  properties: {
    groups: { properties: Record<string, unknown>; additionalProperties?: boolean }
    rules: { patternProperties?: Record<string, unknown> }
    preset: { enum?: string[] }
  }
  definitions: { severity: { enum: Severity[] } }
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Schema

describe('the config schema tracks the registry', () => {
  it('lists EVERY rule group — a missing one is flagged as invalid in the editor', () => {
    const live = [...new Set(allRules.map((r) => groupOf(r.meta)))].sort()
    expect(Object.keys(schema.properties.groups.properties).sort()).toEqual(live)
  })

  it('every group entry documents itself', () => {
    // A `groups` key with no description shows up bare in autocomplete, which
    // is how a tier nobody understands gets left off.
    for (const [name, entry] of Object.entries(schema.properties.groups.properties)) {
      const e = entry as { description?: string; $ref?: string }
      expect(e.$ref, `${name} $ref`).toBe('#/definitions/severity')
      expect((e.description ?? '').length, `${name} description`).toBeGreaterThan(20)
    }
  })

  it('keeps groups CLOSED — the closure is what makes the list load-bearing', () => {
    // If this were open, a typo would validate silently and the group it was
    // meant to configure would stay at its preset severity. The closure is
    // right; the list just has to be complete, which is the test above.
    expect(schema.properties.groups.additionalProperties).toBe(false)
  })

  it('accepts any rule id, in bare or tuple form', () => {
    // Rule ids are NOT enumerated on purpose — 115 of them would be a second
    // registry to keep in sync. The runner reports an unknown id as a config
    // diagnostic instead, which is a better error than a schema squiggle.
    expect(Object.keys(schema.properties.rules.patternProperties ?? {})).toEqual(['^.+$'])
  })

  it('lists every severity the runner accepts', () => {
    const runtime: Severity[] = ['error', 'warn', 'info', 'off']
    expect([...schema.definitions.severity.enum].sort()).toEqual([...runtime].sort())
  })
})

describe('the manifest tracks the registry', () => {
  const MANIFEST = readFileSync(join(import.meta.dirname, '..', 'manifest.ts'), 'utf8')

  /** Every `` `group` (N, … `` claim the manifest prose makes. */
  const claimed = new Map<string, number>()
  // `[a-z0-9-]` and not `[a-z-]`: `a11y` has digits in it, and the narrower
  // class silently matched every group EXCEPT the one with a number in its
  // name — a hole shaped exactly like the ones this file exists to catch.
  for (const m of MANIFEST.matchAll(/`([a-z0-9-]+)` \((\d+),/g)) {
    claimed.set(String(m[1]), Number(m[2]))
  }

  it('states the right size for every group it names', () => {
    // These counts are prose, and prose is exactly where a count rots: it is
    // rendered verbatim into the docs site, llms.txt and the MCP
    // api-reference, so a stale number is what an assistant reads back as
    // fact. `check-doc-claims` locks the TOTAL; nothing locked the split,
    // and the `pyreon` group had drifted by one before anyone noticed.
    const live = new Map<string, number>()
    for (const r of allRules) live.set(groupOf(r.meta), (live.get(groupOf(r.meta)) ?? 0) + 1)

    const wrong: string[] = []
    for (const [name, n] of claimed) {
      // BOTH directions. A drifted count is the common rot; a group the
      // manifest still names after the registry dropped it is the other
      // half, and a bare `continue` skips exactly that case. Safe to assert
      // because the regex only matches the backticked `group` (N, form —
      // categories are written without backticks and with the comma OUTSIDE
      // the paren — so every name reaching this loop is meant to be a group.
      const actual = live.get(name)
      if (actual === undefined) {
        wrong.push(`${name}: manifest names it, registry has no such group`)
      } else if (actual !== n) {
        wrong.push(`${name}: manifest ${n}, actual ${actual}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('names every group, so a new tier cannot ship undocumented', () => {
    const live = [...new Set(allRules.map((r) => groupOf(r.meta)))]
    const missing = live.filter((g) => !claimed.has(g))
    expect(missing).toEqual([])
  })
})

describe('the manifest tracks rule METADATA, not just counts', () => {
  const MANIFEST = readFileSync(join(import.meta.dirname, '..', 'manifest.ts'), 'utf8')

  /**
   * The counts above were the obvious rot. These are the quieter half: prose
   * that names SPECIFIC rules and asserts something about their meta. It reads
   * as documentation and behaves as an unchecked claim, which is the same
   * shape as the schema's group list — accurate when written, with nothing
   * keeping it that way.
   */

  it('only calls a rule auto-fixable when it actually is', () => {
    // A wrong `(auto-fixable)` sends someone to run `--fix` and wonder why
    // nothing changed. It renders verbatim into the docs site and the MCP
    // api-reference, so the claim travels further than this file.
    const claimed = [...MANIFEST.matchAll(/`(pyreon\/[a-z-]+)`[^.]{0,40}?auto-fixable/g)].map(
      (m) => String(m[1]),
    )
    expect(claimed.length, 'no auto-fixable claims found — did the prose change?').toBeGreaterThan(0)

    const fixable = new Set(allRules.filter((r) => r.meta.fixable === true).map((r) => r.meta.id))
    expect(claimed.filter((id) => !fixable.has(id))).toEqual([])
  })

  it('lists exactly the monorepo-scoped rules, in both directions', () => {
    // This list tells a consumer which rules EVERY shipped preset forces off,
    // because they encode the Pyreon repo itself. A rule missing from it reads
    // as shippable when it is not; a rule listed after losing the marker reads
    // as forced-off when it is now live in someone's project.
    const live = allRules
      .filter((r) => r.meta.scope === 'monorepo')
      .map((r) => r.meta.id.replace('pyreon/', ''))
      .sort()

    const block = MANIFEST.match(/meta\.scope: \\'monorepo\\'[^)]*\)/)
    expect(block, 'the monorepo-scope prose block moved — update this matcher').not.toBeNull()
    const named = [...(block?.[0] ?? '').matchAll(/`([a-z-]+)`/g)]
      .map((m) => String(m[1]))
      .filter((n) => n !== 'meta.scope')
      .sort()

    expect(named).toEqual(live)
  })
})

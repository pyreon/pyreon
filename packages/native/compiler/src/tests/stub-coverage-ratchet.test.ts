// Which capabilities does the type gate actually COVER?
//
// Nobody was tracking this, and the answer turned out to be "not the ones you
// would guess". `useClipboard` had no `PyreonClipboard` in either stub file, so
// every attempt to type-check a clipboard app died on
// `cannot find 'PyreonClipboard' in scope` — a failure indistinguishable from
// "the gate has no opinion here", which is what it was.
//
// Auditing the rest found NINE more shipped runtime types missing from one
// stub file each. That is the mechanism behind a recurring pattern in this
// compiler: emit bugs that reach the DEVICE gate (minutes of CI, or a nightly)
// when a per-fixture type-check (seconds) should have caught them. `useDatabase`
// shipped Swift without argument labels for months exactly this way.
//
// ## What this gate does
//
// It enumerates every `Pyreon*` type the emitters CONSTRUCT, keeps the ones
// that are real framework types (a same-named source file exists in
// runtime-swift or runtime-kotlin — which cleanly separates them from
// per-app synthesized names like `PyreonStore_counter`), and asserts each has a
// stub on both platforms.
//
// The nine already-missing ones are listed in `KNOWN_UNCOVERED` with the
// platform they lack. That list may only SHRINK — the same ratchet discipline
// as `lint-baseline.json`. Adding a capability without a stub fails
// immediately; removing an entry after writing its stub is the intended
// direction of travel.
//
// ## Why a ratchet and not just "add the nine stubs"
//
// A stub must mirror the real surface EXACTLY — argument labels, read-only
// properties, constructor arity — because a superset stub is itself a masking
// source (a rule this compiler has re-learned five times). Nine surfaces is
// nine careful readings of a runtime file, not a bulk edit, and doing them
// badly would be worse than the gap. What must not happen meanwhile is the
// list growing silently, which is what this locks.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { nativeRuntimeExists } from './native-runtime-locations'

const HERE = dirname(fileURLToPath(import.meta.url))
const COMPILER_SRC = join(HERE, '..')
const REPO = join(COMPILER_SRC, '../../../..')

/**
 * Types the emitters construct that have NO stub on the named platform.
 *
 * Started at NINE. Now ZERO — all nine were stubbed rather than tolerated:
 * `PyreonWebSocket`, `PyreonGeolocation`, `PyreonMapState`, `PyreonPayments`,
 * `PyreonPushNotifications` (Swift) and `PyreonHaptics`, `PyreonLinking`,
 * `PyreonNotifications`, `PyreonShare` (Kotlin).
 *
 * The list stays as the mechanism, not as debt: it is what makes "a new
 * capability arrives without a stub" fail loudly instead of silently widening
 * the blind spot again.
 *
 * SCOPE LIMIT worth knowing: this scans `Pyreon*` names, so a missing
 * COMPOSE or SwiftUI API is invisible to it. Two such gaps
 * (`AnimatedVisibility`, `combinedClickable` — both backing DEVICE-PROVEN
 * features) were found only by running a whole app's emit through
 * `validateKotlin` rather than a single-hook fixture. Whole-app validation
 * catches what a name scan cannot.
 *
 * Every entry is a shipped capability whose emitted code is currently
 * UNVERIFIED by the type gate on that platform — a real gap, not an
 * exemption. This list may only shrink.
 */
const KNOWN_UNCOVERED: Readonly<Record<string, 'swift' | 'kotlin'>> = {
  // EMPTY. Every emitted framework type is stubbed on both platforms.
  //
  // Keep it that way: an entry added here is a capability whose emitted code
  // nothing type-checks, which is how `useDatabase` shipped Swift without
  // argument labels for months. Prefer writing the stub.
}

/** `Pyreon*` names the emitters construct (constructor-call position). */
export function emittedRuntimeTypes(sources: readonly string[]): string[] {
  const found = new Set<string>()
  for (const src of sources) {
    for (const m of src.matchAll(/\b(Pyreon[A-Z]\w+)\s*\(/g)) found.add(m[1]!)
  }
  return [...found].sort()
}

/**
 * A FRAMEWORK type ships a same-named source file in one of the native
 * runtimes. Per-app synthesized names (`PyreonStore_counter`,
 * `PyreonZodSchema_userSchema`, `PyreonModel_counter`) never do — which is a
 * structural discriminator rather than a hand-maintained denylist that would
 * itself drift.
 */
export function isFrameworkType(name: string): boolean {
  // Resolves across the monolith AND every co-located native/ dir — a runtime
  // relocated out of the monolith (co-location) is still a framework type, so
  // it must stay in this coverage set rather than silently dropping out.
  return (
    nativeRuntimeExists(REPO, name, 'swift') || nativeRuntimeExists(REPO, name, 'kotlin')
  )
}

const emitSources = ['emit-swift.ts', 'emit-kotlin.ts'].map((f) =>
  readFileSync(join(COMPILER_SRC, f), 'utf8'),
)
const swiftStubs = readFileSync(join(COMPILER_SRC, 'swift-stubs.ts'), 'utf8')
const kotlinStubs = readFileSync(join(COMPILER_SRC, 'kotlin-stubs.ts'), 'utf8')

describe('type-gate stub coverage', () => {
  const frameworkTypes = emittedRuntimeTypes(emitSources).filter(isFrameworkType)

  it('finds a meaningful set of emitted framework types', () => {
    // A scan that silently matched nothing would make every assertion below
    // vacuously pass — the empty-input failure mode this repo has been bitten
    // by before.
    expect(frameworkTypes.length).toBeGreaterThan(10)
    expect(frameworkTypes).toContain('PyreonClipboard')
    expect(frameworkTypes).toContain('PyreonDatabase')
  })

  it('excludes per-app synthesized names', () => {
    // These appear in emitter docstrings and template output but are generated
    // per application, so no stub could exist for them.
    for (const synthesized of ['PyreonStore_counter', 'PyreonModel_counter']) {
      expect(isFrameworkType(synthesized)).toBe(false)
    }
  })

  it('every emitted framework type is stubbed on BOTH platforms, except the known gaps', () => {
    const uncovered: string[] = []
    for (const name of frameworkTypes) {
      if (!swiftStubs.includes(name) && KNOWN_UNCOVERED[name] !== 'swift') {
        uncovered.push(`${name} (missing: swift)`)
      }
      if (!kotlinStubs.includes(name) && KNOWN_UNCOVERED[name] !== 'kotlin') {
        uncovered.push(`${name} (missing: kotlin)`)
      }
    }
    expect(
      uncovered,
      'A capability with no stub cannot be type-checked at all — its emit is UNVERIFIED, ' +
        'and the failure reads as "cannot find X in scope" rather than as a gap. ' +
        'Add the stub (mirroring the REAL surface exactly — a superset stub masks), ' +
        'or add it to KNOWN_UNCOVERED with the platform it lacks.',
    ).toEqual([])
  })

  it('the KNOWN_UNCOVERED list only shrinks — no stale entries', () => {
    // An entry that HAS gained a stub must be deleted, or the list stops
    // describing reality and the ratchet quietly loosens.
    const stale: string[] = []
    for (const [name, platform] of Object.entries(KNOWN_UNCOVERED)) {
      const stubs = platform === 'swift' ? swiftStubs : kotlinStubs
      if (stubs.includes(name)) stale.push(`${name} (${platform} stub now exists — remove the entry)`)
    }
    expect(stale).toEqual([])
  })

  it('every KNOWN_UNCOVERED entry is a real framework type', () => {
    // Guards the list against absorbing a typo, which would silently exempt
    // nothing while looking like acknowledged debt.
    for (const name of Object.keys(KNOWN_UNCOVERED)) {
      expect(isFrameworkType(name), `${name} is not a framework runtime type`).toBe(true)
    }
  })
})

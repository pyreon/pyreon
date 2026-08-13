// A stub NARROWER than the runtime it mirrors rejects CORRECT code.
//
// This is not hypothetical and not rare: in one session it was found four
// separate times, each caught only because someone happened to compile a
// snippet that used the missing member.
//
//   PyreonShare         stub had `url`; the runtime has text/url/textUrl/canShare
//   PyreonHaptics       stub had `impact`; the runtime has three
//   PyreonNotifications stub had `notify`; the runtime also has requestPermission
//   PyreonPermissions   the init defaulted its parameter; the stub required it
//
// Every one of those members is reachable from a web hook, so a component
// using it compiled on the web and was refused by the type gate — the gate
// reporting a failure that did not exist. That is worse than a missed bug:
// it sends an author to "fix" working code.
//
// The documented trap is the SUPERSET stub, which masks real breakage. This
// is the mirror image, and the two need opposite checks. Masking is caught
// by compiling against the device; being narrow is caught here.
//
// ## Why this is DERIVED rather than a list
//
// The obvious guard is a suite that compiles a hand-written snippet per
// hook — and that is exactly the shape this repo calls a silent-hole
// generator, because it rots the moment someone adds a member and not a
// spec. So the check reads the runtimes and the stubs and compares them: a
// member added to a runtime is covered the day it lands, with no test edit.
//
// ## What it deliberately does NOT assert
//
// - Types the stub does not declare at all. A runtime with no stub is not
//   automatically a bug; it may be unreachable from any emit. Requiring a
//   stub for every runtime would fail on framework-internal types and teach
//   people to add empty stubs to shut it up.
// - Signatures. Comparing parameter lists across two languages needs a real
//   parser for each; NAMES catch the whole observed class at a fraction of
//   the cost and none of the false positives.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findNativeRuntime, nativeRuntimeRoots } from './native-runtime-locations'

const REPO = join(import.meta.dirname ?? __dirname, '..', '..', '..', '..', '..')

/**
 * Known-narrow members, recorded rather than hidden.
 *
 * This is a RATCHET, not a permission slip: it may only shrink, exactly as
 * `lint-baseline.json` does. Seeding it is the honest option — the
 * alternative was to hand-write 44 stub signatures in one pass, and a stub
 * with a WRONG signature is worse than a missing one, because it masks
 * breakage instead of merely refusing correct code.
 *
 * The gate's value does not depend on the list being empty. It depends on
 * the list not GROWING: a member added to a runtime tomorrow fails
 * immediately, which is the drift that kept reaching CI one instance at a
 * time.
 */
const KNOWN_NARROW: ReadonlySet<string> = new Set([
  // Lifecycle/monitor internals — reachable in principle, not from any emit
  // shape today.
  'PyreonAppState.isMonitoring', 'PyreonAppState.update',
  'PyreonCrashReporter.isMonitoring',
  'PyreonNetworkStatus.isMonitoring', 'PyreonNetworkStatus.update',
  // Delegate callbacks: invoked BY the platform, never by emitted code.
  'PyreonGeolocation.authorize', 'PyreonGeolocation.fail',
  'PyreonGeolocation.locationManager',
  'PyreonGeolocation.locationManagerDidChangeAuthorization',
  'PyreonGeolocation.update',
  'PyreonPushNotifications.authorize', 'PyreonPushNotifications.fail',
  'PyreonPushNotifications.notificationReceived',
  'PyreonPushNotifications.tokenReceived',
  'PyreonPayments.connect', 'PyreonPayments.productsLoaded',
  'PyreonPayments.purchaseFailed', 'PyreonPayments.purchaseStarted',
  'PyreonPayments.purchaseSucceeded', 'PyreonPayments.restored',
  'PyreonWebSocket.closed', 'PyreonWebSocket.failed',
  'PyreonWebSocket.opened', 'PyreonWebSocket.received',
  // Reachable from user code and genuinely missing — the real backlog this
  // gate exists to surface. Each is a `perms.grant(...)` / `machine.can(...)`
  // an author can write today and have refused.
  
  'PyreonI18n.fallbackLocale', 'PyreonI18n.locale', 'PyreonI18n.messages',
  'PyreonQuery.queryKey', 'PyreonQuery.staleSeconds',
  'PyreonToast.defaultDuration', 'PyreonToast.defaultDurationMillis',
  'PyreonToast.maxToasts', 'PyreonToast.remove',
  // Internals of the emit's own plumbing.
  'PyreonHttp.buildURLRequest', 'PyreonHttp.install',
  // Kotlin-side lifecycle + injection points, same reasoning as the Swift
  // monitors above: real members, not reachable from an emit shape today.
  'PyreonA11y.setAnnouncer',
  'PyreonAppState.start', 'PyreonAppState.stop',
  'PyreonNetworkStatus.start', 'PyreonNetworkStatus.stop',
  'PyreonPushNotifications.start',
  'PyreonFetch.load', 'PyreonQuery.load', 'PyreonWebSocket.connect',
  // SwiftUI View conformance / UIKit-only members the stub set cannot model.
  'PyreonWebView.body', 'PyreonWebView.makeUIView', 'PyreonWebView.updateUIView',
])

/**
 * The body of `type` in `src`, or null when it is not declared there.
 *
 * Brace-scoped rather than "from the declaration to the next one": a runtime
 * file routinely declares several types (PyreonBluetooth.swift also declares
 * PyreonBluetoothDevice and BluetoothScanner), and a scan that ran past the
 * closing brace attributed the SIBLING's members to this type. The first
 * draft of this gate did exactly that and reported 234 findings, nearly all
 * of them fictional — a gate that cries wolf is one nobody reads.
 */
export function typeBody(src: string, type: string): string | null {
  const decl = new RegExp(
    `(?:class|struct|object|interface|protocol|enum)\\s+${type}\\b`,
  ).exec(src)
  if (decl === null) return null
  const open = src.indexOf('{', decl.index)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return null
}

/**
 * The type body with every NESTED brace block elided — i.e. only the text
 * that sits directly inside the type.
 *
 * Two things this has to survive, both of which broke earlier drafts:
 *
 *  - A `let`/`val` inside a function body is a LOCAL, not a member. Counting
 *    those turned PyreonDatabase's parser temporaries (`c`, `e`, `sb`) into
 *    "missing stub members".
 *  - Many stubs declare a whole type on ONE line
 *    (`public struct X { public init() {}; public func y() {} }`). A
 *    line-based scan sees no depth-0 line at all there and reports every
 *    member of that type as missing — 21 fictional findings, including ones
 *    a sibling test already proves are present.
 *
 * Eliding rather than splitting handles both: members stay, bodies go, and
 * the layout stops mattering.
 */
export function depthZeroProjection(body: string): string {
  let out = ''
  let depth = 0
  for (const ch of body) {
    if (ch === '{') {
      depth++
      // Keep a separator so two adjacent members cannot fuse into one token.
      if (depth === 1) out += ' '
      continue
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0) out += ch
  }
  return out
}

/** Public member names of a Swift type. */
export function swiftMembers(src: string, type: string): Set<string> {
  const body = typeBody(src, type)
  const out = new Set<string>()
  if (body === null) return out
  // `private(set)` is publicly READABLE, so it is part of the surface an
  // emit can touch.
  const re = /public\s+(?:private\(set\)\s+)?(?:static\s+)?(?:func|var|let)\s+([A-Za-z_][A-Za-z0-9_]*)/g
  for (const m of depthZeroProjection(body).matchAll(re)) out.add(m[1]!)
  return out
}

/** Public member names of a Kotlin type. Kotlin members are public by DEFAULT. */
export function kotlinMembers(src: string, type: string): Set<string> {
  const body = typeBody(src, type)
  const out = new Set<string>()
  if (body === null) return out
  // Kotlin members are public by DEFAULT, so visibility is expressed by the
  // ABSENCE of a modifier — the negative lookbehind is what carries it.
  const re = /(?<!private )(?<!internal )(?<!protected )\b(?:fun|val|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g
  for (const m of depthZeroProjection(body).matchAll(re)) out.add(m[1]!)
  return out
}

/**
 * The member names a stub declares for `type`, or null when the stub does
 * not declare it at all.
 */
export function stubMembersFor(
  stubSource: string,
  type: string,
  lang: 'swift' | 'kotlin',
): Set<string> | null {
  if (typeBody(stubSource, type) === null) return null
  return lang === 'swift' ? swiftMembers(stubSource, type) : kotlinMembers(stubSource, type)
}

/** Every `PyreonX` type name that has a runtime source on this platform. */
function runtimeTypeNames(kind: 'swift' | 'kotlin'): string[] {
  const names = new Set<string>()
  const { readdirSync } = require('node:fs') as typeof import('node:fs')
  for (const root of nativeRuntimeRoots(REPO, kind)) {
    for (const f of readdirSync(root)) {
      const m = /^(Pyreon[A-Za-z0-9_]*)\.(swift|kt)$/.exec(f)
      if (m) names.add(m[1]!)
    }
  }
  return [...names].sort()
}

const STUBS = {
  swift: readFileSync(join(REPO, 'packages/native/compiler/src/swift-stubs.ts'), 'utf8'),
  kotlin: readFileSync(join(REPO, 'packages/native/compiler/src/kotlin-stubs.ts'), 'utf8'),
} as const

describe('every stubbed runtime type declares the members its runtime does', () => {
  for (const kind of ['swift', 'kotlin'] as const) {
    it(`${kind}`, () => {
      const gaps: string[] = []
      for (const type of runtimeTypeNames(kind)) {
        const stubbed = stubMembersFor(STUBS[kind], type, kind)
        // Not stubbed at all → out of scope, deliberately (see the header).
        if (stubbed === null) continue
        const path = findNativeRuntime(REPO, type, kind)
        if (path === null) continue
        const src = readFileSync(path, 'utf8')
        const real = kind === 'swift' ? swiftMembers(src, type) : kotlinMembers(src, type)
        for (const member of real) {
          if (stubbed.has(member)) continue
          if (KNOWN_NARROW.has(`${type}.${member}`)) continue
          gaps.push(`${type}.${member}`)
        }
      }
      expect(
        gaps.sort(),
        `stub is NARROWER than the runtime — the type gate would reject correct code using: ${gaps.join(', ')}`,
      ).toEqual([])
    })
  }
})

describe('the extractors themselves', () => {
  // The gate is only as good as these; a parser that silently matched
  // nothing would report a clean sweep forever.
  it('swift: finds funcs, vars and private(set) — which is publicly READABLE', () => {
    const m = swiftMembers(
      `public final class X {
      public func copy(_ t: String) { let local = 1 }
      public private(set) var copied: Bool = false
      public static let shared = X()
      private var hidden = 1
      func internalOnly() {}
    }`,
      'X',
    )
    expect([...m].sort()).toEqual(['copied', 'copy', 'shared'])
  })

  it('kotlin: public is the DEFAULT, so an unmodified member counts', () => {
    const m = kotlinMembers(
      `class X {
      fun copy(text: String) { val tmp = 1 }
      val copied: Boolean get() = false
      private var hidden = 1
      internal fun skipMe() {}
    }`,
      'X',
    )
    expect([...m].sort()).toEqual(['copied', 'copy'])
  })

  it('a member on a DIFFERENT type does not satisfy this one', () => {
    // The false pass that made a global-occurrence count brittle.
    const stub = `
class PyreonAlpha {
  fun one() {}
}
class PyreonBeta {
  fun two() {}
}`
    expect(stubMembersFor(stub, 'PyreonAlpha', 'kotlin')?.has('two')).toBe(false)
    expect(stubMembersFor(stub, 'PyreonBeta', 'kotlin')?.has('two')).toBe(true)
  })

  it('an unstubbed type reads as null, not as an empty surface', () => {
    // Returning an empty set would make every member of that runtime a
    // reported gap, which is the opposite of the documented scope.
    expect(stubMembersFor('class PyreonAlpha {}', 'PyreonMissing', 'swift')).toBeNull()
  })
})

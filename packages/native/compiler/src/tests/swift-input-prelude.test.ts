// The EMIT file's import prelude — a Linux-only contract, locked on any host.
//
// `URLSession` is in Foundation on Apple platforms but in a SEPARATE
// `FoundationNetworking` module on Linux, where plain Foundation carries only a
// placeholder typealias to `AnyObject`. A `useFetch` emit calls
// `URLSession.shared.data(from:)`, so on Linux it fails with
// "type 'URLSession' (aka 'AnyObject') has no member 'shared'".
//
// THE LESSON THIS FILE EXISTS FOR: **Swift imports are per-FILE.** The first fix
// added the conditional import to the concatenated STUB file — which references
// no URLSession — so the emit file still lacked it and CI failed identically.
// The import has to go where the symbol is USED.
//
// WHY A UNIT TEST RATHER THAN A COMPILE CHECK: on macOS `canImport(
// FoundationNetworking)` is FALSE and `URLSession` resolves from Foundation, so
// a `swiftc` run passes whether or not the shim is present. A compile-based
// assertion is therefore blind to this exact regression on every developer
// machine. Asserting the composed prelude is what makes it catchable anywhere.

import { describe, expect, it } from 'vitest'
import { SWIFT_NETWORKING_SHIM, _swiftInputPrelude } from '../validate'

describe('Swift emit-file import prelude', () => {
  it('always includes the conditional FoundationNetworking import', () => {
    // Unconditional by design: `canImport` already makes it inert on Apple
    // platforms, so sniffing the emit for `URLSession` would add a failure mode
    // (a missed spelling) for no benefit.
    expect(_swiftInputPrelude('let x = 0\n', '')).toContain(SWIFT_NETWORKING_SHIM)
  })

  it('uses canImport so it is inert on Apple platforms (never a bare import)', () => {
    // A bare `import FoundationNetworking` would fail on macOS, where the
    // module does not exist.
    expect(SWIFT_NETWORKING_SHIM).toContain('#if canImport(FoundationNetworking)')
    expect(SWIFT_NETWORKING_SHIM).toContain('#endif')
    expect(SWIFT_NETWORKING_SHIM.startsWith('import ')).toBe(false)
  })

  it('adds `import Foundation` when the emit lacks it', () => {
    expect(_swiftInputPrelude('let x = 0\n', '')).toContain('import Foundation')
  })

  it('does NOT duplicate `import Foundation` when the emit already has it', () => {
    const prelude = _swiftInputPrelude('import Foundation\nlet x = 0\n', '')
    expect(prelude.match(/^import Foundation\s*$/gm) ?? []).toHaveLength(0)
    // …but the networking shim is still added — the two are independent.
    expect(prelude).toContain(SWIFT_NETWORKING_SHIM)
  })

  it('threads the caller-supplied Observation import through', () => {
    // The @Observable guarantee is probe-gated by the caller, so the prelude
    // must pass it through rather than deciding for itself.
    expect(_swiftInputPrelude('let x = 0\n', 'import Observation\n')).toContain(
      'import Observation',
    )
  })

  it('orders imports before anything the caller appends', () => {
    const prelude = _swiftInputPrelude('let x = 0\n', '')
    expect(prelude.trimEnd().endsWith('#endif')).toBe(true)
  })
})

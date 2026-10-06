/**
 * The compile-gate stubs the `@pyreon/machine` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonMachine` container a `createMachine` declaration emits. They mirror the REAL runtimes
 * (`@pyreon/machine/native`) exactly — a superset stub masks real breakage, a narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names the type (see {@link machineStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const MACHINE_SWIFT_STUBS = `// Mirrors the real @Observable final class. The struct stub was missing
// \`can\` / \`nextEvents\` / the \`state\` property / \`transitions\`, so a correct
// \`m.can("GO")\` - a documented member of the web Machine interface, which
// \`createMachine\` lowers to this type - failed the type gate on iOS while
// compiling fine on Android, whose stub was already complete.
public final class PyreonMachine {
  public init(initial: String, transitions: [String: [String: String]]) {
    self.state = initial
    self.transitions = transitions
  }
  public private(set) var state: String
  public let transitions: [String: [String: String]]
  public func callAsFunction() -> String { state }
  public func send(_ event: String) {}
  public func matches(_ s: String) -> Bool { false }
  public func can(_ event: String) -> Bool { false }
  public func nextEvents() -> [String] { [] }
}
`

export const MACHINE_KOTLIN_STUBS = `// PyreonMachine — Gap 4 PR-2 (Strategy-B port for @pyreon/machine).
// Real impl in @pyreon/native-runtime-kotlin's PyreonMachine.kt.
class PyreonMachine(initial: String, val transitions: Map<String, Map<String, String>>) {
  var state: String = initial
    private set
  fun send(event: String) { transitions[state]?.get(event)?.let { state = it } }
  fun matches(s: String): Boolean = state == s
  fun can(event: String): Boolean = transitions[state]?.containsKey(event) == true
  fun nextEvents(): List<String> = transitions[state]?.keys?.toList() ?: emptyList()
  operator fun invoke(): String = state
}
`

/** The `PyreonMachine` compile-gate stub, appended only to an emit that names the type. */
export const machineStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonMachine\b/.test(source) ? MACHINE_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonMachine\b/.test(source) ? MACHINE_KOTLIN_STUBS : ''),
}

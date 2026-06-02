// PyreonViewModifier unit-level smoke — exercises the PyreonStylable
// marker interface shipped as the Kotlin parity mirror of
// `PyreonViewModifier.swift`'s `PyreonStylable` protocol. Phase B
// (native readiness audit 2026-06).
//
// What this verifies:
//   - The PyreonStylable interface is reachable
//   - Default `pyreonSource` getter returns the documented sentinel
//     "(unspecified)" — matches Swift parity
//   - An implementing class can override `pyreonSource` per-instance
//     (the emitter pattern the styler will generate)
//
// What this DOESN'T verify (intentional — marker-interface only):
//   - Compose Modifier integration (would need Compose-test
//     infrastructure)
//   - Devtools' detection logic — that's downstream consumer code

package com.pyreon.runtime

// Smoke class — represents what the styler emitter would generate.
private class FakeStyledButton(override val pyreonSource: String) : PyreonStylable

// Smoke class that DOESN'T override pyreonSource — exercises the
// interface default.
private class FakeDefaultStyled : PyreonStylable

fun testPyreonStylableInterfaceReachable() {
    val s: PyreonStylable = FakeStyledButton("Button:primary:medium")
    check(s.pyreonSource == "Button:primary:medium") {
        "Implementing class should expose its source via the interface, got=${s.pyreonSource}"
    }
}

fun testPyreonStylableDefaultIsUnspecified() {
    val s: PyreonStylable = FakeDefaultStyled()
    // Default mirrors the Swift side's `pyreonSource: String { "(unspecified)" }`
    // extension.
    check(s.pyreonSource == "(unspecified)") {
        "Default pyreonSource should be \"(unspecified)\", got=${s.pyreonSource}"
    }
}

fun main() {
    testPyreonStylableInterfaceReachable()
    testPyreonStylableDefaultIsUnspecified()
    println("[PyreonViewModifierTest] all smoke tests passed")
}

// PyreonViewModifier — base interface/extensions for the styler emitter.
// KOTLIN PARITY MIRROR of `PyreonViewModifier.swift`. Closes the Phase B
// (native readiness audit 2026-06) gap: Swift had the PyreonStylable
// marker protocol; Kotlin didn't, breaking parity for the styler
// emitter's cross-target output.
//
// Architectural note: the Swift side ships a `PyreonStylable` protocol
// for `ViewModifier`-shaped types. Compose's `Modifier` system is
// fundamentally different — modifiers are extension functions on
// `Modifier`, not class wrappers. So the Kotlin parity is a marker
// INTERFACE that emitter-generated Composable-style functions can
// implement, plus a companion-object pattern for the source-id
// metadata.
//
// In Phase 0 this file defines the minimum API the styler emitter will
// target: a `PyreonStylable` interface that emitter-generated style
// holders implement, exposing a `pyreonSource` companion-property so
// devtools can detect Pyreon-emitted modifiers vs hand-written ones
// without runtime reflection.
//
// Phase 0 (this file's current shape): the interface skeleton + a
// smoke default. Real styler emit from `@pyreon/styler` lands in
// PR 7b per the Phase 0 roadmap. Mirrors `PyreonStylable.pyreonSource`
// from the Swift side.

package com.pyreon.runtime

/**
 * Marker interface for compiler-generated style holders.
 *
 * The compiler's styler emit generates objects like
 * `PyreonButton(state = State.PRIMARY, size = Size.MEDIUM) : PyreonStylable`
 * that an extension-function pipeline applies to `Modifier`s. Conformance
 * to this marker is internal-only — it exists so devtools can detect
 * Pyreon-generated style holders vs hand-written Compose ones without
 * runtime reflection.
 *
 * Mirrors `PyreonStylable` on the Swift side; both targets share the
 * `pyreonSource` field as the source-identifier convention.
 */
public interface PyreonStylable {
    /**
     * Returns the generator-source identifier (component name + dimension
     * combo) the style holder was emitted from. Used by debug overlays
     * + the future per-component perf instrumentation.
     *
     * Default value `"(unspecified)"` mirrors the Swift default — emitter
     * output overrides this per-class via Kotlin's companion-object pattern.
     */
    public val pyreonSource: String
        get() = "(unspecified)"
}

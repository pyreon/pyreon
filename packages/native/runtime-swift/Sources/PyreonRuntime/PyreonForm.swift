// PyreonForm — the SwiftUI side of Pyreon's cross-platform form story
// (Phase 4.2). Mirrors the core `@pyreon/form` state surface:
//
//     { values, errors, touched, isSubmitting } + setValue / setError /
//     setTouched / reset / beginSubmit / endSubmit
//
// and the Kotlin `PyreonForm` one-for-one so iOS + Android stay in lockstep.
//
// ## What this delivers
//
// An `@Observable` container holding the reactive form state a `useForm`
// drives — per-field `values`, `errors`, `touched`, plus an `isSubmitting`
// flag and derived `isValid`. A SwiftUI view binds a field's value via
// `form.values["email"]` + `form.setValue("email", …)` and re-renders as
// the maps change, exactly like the web `useField('email')` signals.
//
// ## Scope — string-keyed state container (foundation)
//
// v1 stores field values as `[String: String]` — form inputs are strings
// at the UI layer; typed coercion + validation are the compiler-emit and
// `@pyreon/validation` layers' job (a later arc), exactly as the web form
// splits raw field state from schema validation. This is the per-service
// runtime PORT (the `PyreonFetch` / `PyreonStorage` pattern); the
// `useForm` / `useField` / `<Form>` / `<Submit>` emit builds on this
// contract in a follow-up.
//
// The container owns only the state machine — no DOM, no validation
// engine, no async — so it unit-tests synchronously with no SwiftUI host.

import Foundation
import Observation

/// Observable form-state container — the SwiftUI half of `useForm`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonForm {
    /// Per-field current values (string-keyed). Read `values["email"]`.
    public private(set) var values: [String: String]
    /// Per-field validation messages. A field is error-free when absent.
    public private(set) var errors: [String: String] = [:]
    /// Per-field "has been blurred/visited" flags.
    public private(set) var touched: [String: Bool] = [:]
    /// True while a submit is in flight.
    public private(set) var isSubmitting: Bool = false

    /// Snapshot of the initial values, used by `reset()`.
    @ObservationIgnored private let initialValues: [String: String]

    public init(initialValues: [String: String] = [:]) {
        self.values = initialValues
        self.initialValues = initialValues
    }

    /// Set a field's value.
    public func setValue(_ name: String, _ value: String) {
        values[name] = value
    }

    /// Set (non-nil) or clear (nil) a field's error message.
    public func setError(_ name: String, _ message: String?) {
        errors[name] = message
    }

    /// Mark a field touched (default true).
    public func setTouched(_ name: String, _ isTouched: Bool = true) {
        touched[name] = isTouched
    }

    /// True when no field carries an error.
    public var isValid: Bool { errors.isEmpty }

    /// Enter the submitting state.
    public func beginSubmit() { isSubmitting = true }

    /// Leave the submitting state.
    public func endSubmit() { isSubmitting = false }

    /// Restore initial values and clear errors / touched / submitting.
    public func reset() {
        values = initialValues
        errors = [:]
        touched = [:]
        isSubmitting = false
    }
}

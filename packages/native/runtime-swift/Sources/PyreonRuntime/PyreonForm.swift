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
import SwiftUI

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

    /// Per-field sync validators — return "" for valid, a message
    /// otherwise. Mirrors the web `useForm({ validators })` contract
    /// (the v2 form-binding arc; schema validation stays a later arc).
    @ObservationIgnored private let validators: [String: (String) -> String]

    /// Submit callback — receives the values snapshot after a
    /// successful `validateAll()`. Mirrors `useForm({ onSubmit })`.
    /// SETTABLE (not just an init param): SwiftUI @State property
    /// initializers run before `self` exists, so a callback capturing
    /// instance members (the dominant case — `navigate`, store writes)
    /// cannot be passed at init. PMTC emits those via
    /// `.onAppear { form.onSubmit = { … } }` instead.
    @ObservationIgnored public var onSubmit: (([String: String]) -> Void)?

    public init(
        initialValues: [String: String] = [:],
        validators: [String: (String) -> String] = [:],
        onSubmit: (([String: String]) -> Void)? = nil
    ) {
        self.values = initialValues
        self.initialValues = initialValues
        self.validators = validators
        self.onSubmit = onSubmit
    }

    /// Set a field's value. Re-validates the field when it already
    /// carries an error (immediate feedback once the user starts
    /// fixing it — the web's validateOn-change-after-error shape).
    public func setValue(_ name: String, _ value: String) {
        values[name] = value
        if errors[name] != nil { validateField(name) }
    }

    /// Web-parity alias — the `@pyreon/form` API name is
    /// `setFieldValue`; PMTC source flows through unchanged.
    public func setFieldValue(_ name: String, _ value: String) {
        setValue(name, value)
    }

    /// SwiftUI two-way binding for a field — `TextField(text:
    /// form.binding("email"))`. The PMTC `<Field
    /// value={form.values.email}>` emit produces this shape.
    public func binding(_ name: String) -> Binding<String> {
        Binding(
            get: { self.values[name] ?? "" },
            set: { self.setValue(name, $0) }
        )
    }

    /// Run one field's validator (no-op without one). Returns true
    /// when the field is valid.
    @discardableResult
    public func validateField(_ name: String) -> Bool {
        guard let v = validators[name] else { return true }
        let message = v(values[name] ?? "")
        errors[name] = message.isEmpty ? nil : message
        return message.isEmpty
    }

    /// Run every registered validator. Returns overall validity.
    @discardableResult
    public func validateAll() -> Bool {
        var ok = true
        for name in validators.keys {
            if !validateField(name) { ok = false }
            touched[name] = true
        }
        return ok
    }

    /// Validate, then invoke `onSubmit` with the values snapshot when
    /// valid. The submitting flag wraps the callback so a UI can
    /// disable its button.
    public func submit() {
        guard validateAll() else { return }
        beginSubmit()
        onSubmit?(values)
        endSubmit()
    }

    /// Web-parity alias for `submit()` (`form.handleSubmit()`).
    public func handleSubmit() { submit() }

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

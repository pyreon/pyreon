// PyreonForm — the Compose side of Pyreon's cross-platform form story
// (Phase 4.2). Mirrors the core `@pyreon/form` state surface and the Swift
// `PyreonForm` one-for-one so iOS + Android stay in lockstep.
//
// ## What this delivers
//
// A reactive container holding per-field `values` / `errors` / `touched`
// (each a Compose `MutableState`, following the PyreonRouter/PyreonFetch
// convention — read `.value`), plus an `isSubmitting` flag and derived
// `isValid`. A Composable binds a field via `form.values.value["email"]`
// + `form.setValue("email", …)` and recomposes as the maps change.
//
// ## Scope — string-keyed state container (foundation)
//
// v1 stores field values as `Map<String, String>`; typed coercion +
// validation are the compiler-emit and `@pyreon/validation` layers' job.
// This is the per-service runtime PORT (the PyreonFetch / PyreonStorage
// pattern); the `useForm` / `useField` / `<Form>` / `<Submit>` emit builds
// on this contract in a follow-up. Coroutine-free + dependency-light, so
// it unit-tests synchronously with no Compose host.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Reactive form-state container — the Compose half of `useForm`.
 * Exposes its fields as Compose `MutableState` (read `.value`).
 */
public class PyreonForm(initialValues: Map<String, String> = emptyMap()) {
    private val initial: Map<String, String> = initialValues

    /** Per-field current values (string-keyed). */
    public val values: MutableState<Map<String, String>> = mutableStateOf(initialValues)

    /** Per-field validation messages. A field is error-free when absent. */
    public val errors: MutableState<Map<String, String>> = mutableStateOf(emptyMap())

    /** Per-field "has been blurred/visited" flags. */
    public val touched: MutableState<Map<String, Boolean>> = mutableStateOf(emptyMap())

    /** True while a submit is in flight. */
    public val isSubmitting: MutableState<Boolean> = mutableStateOf(false)

    /** Set a field's value. */
    public fun setValue(name: String, value: String) {
        values.value = values.value + (name to value)
    }

    /** Set (non-null) or clear (null) a field's error message. */
    public fun setError(name: String, message: String?) {
        errors.value = if (message == null) errors.value - name else errors.value + (name to message)
    }

    /** Mark a field touched (default true). */
    public fun setTouched(name: String, isTouched: Boolean = true) {
        touched.value = touched.value + (name to isTouched)
    }

    /** True when no field carries an error. */
    public val isValid: Boolean
        get() = errors.value.isEmpty()

    /** Enter the submitting state. */
    public fun beginSubmit() {
        isSubmitting.value = true
    }

    /** Leave the submitting state. */
    public fun endSubmit() {
        isSubmitting.value = false
    }

    /** Restore initial values and clear errors / touched / submitting. */
    public fun reset() {
        values.value = initial
        errors.value = emptyMap()
        touched.value = emptyMap()
        isSubmitting.value = false
    }
}

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
public class PyreonForm(
    initialValues: Map<String, String> = emptyMap(),
    /**
     * Per-field sync validators — return "" for valid, a message
     * otherwise. Mirrors `useForm({ validators })` (the v2
     * form-binding arc; schema validation stays a later arc).
     */
    private val validators: Map<String, (String) -> String> = emptyMap(),
    /** Submit callback — receives the values snapshot when valid. */
    private val onSubmit: ((Map<String, String>) -> Unit)? = null,
) {
    private val initial: Map<String, String> = initialValues

    /** Per-field current values (string-keyed). */
    public val values: MutableState<Map<String, String>> = mutableStateOf(initialValues)

    /** Per-field validation messages. A field is error-free when absent. */
    public val errors: MutableState<Map<String, String>> = mutableStateOf(emptyMap())

    /** Per-field "has been blurred/visited" flags. */
    public val touched: MutableState<Map<String, Boolean>> = mutableStateOf(emptyMap())

    /** True while a submit is in flight. */
    public val isSubmitting: MutableState<Boolean> = mutableStateOf(false)

    /**
     * Set a field's value. Re-validates the field when it already
     * carries an error (immediate feedback once the user starts
     * fixing it — the web's validateOn-change-after-error shape).
     */
    public fun setValue(name: String, value: String) {
        values.value = values.value + (name to value)
        if (errors.value.containsKey(name)) validateField(name)
    }

    /** Web-parity alias — `@pyreon/form`'s API name is `setFieldValue`. */
    public fun setFieldValue(name: String, value: String) {
        setValue(name, value)
    }

    /** Run one field's validator (no-op without one). True = valid. */
    public fun validateField(name: String): Boolean {
        val v = validators[name] ?: return true
        val message = v(values.value[name] ?: "")
        errors.value =
            if (message.isEmpty()) errors.value - name else errors.value + (name to message)
        return message.isEmpty()
    }

    /** Run every registered validator. Returns overall validity. */
    public fun validateAll(): Boolean {
        var ok = true
        for (name in validators.keys) {
            if (!validateField(name)) ok = false
            touched.value = touched.value + (name to true)
        }
        return ok
    }

    /**
     * Validate, then invoke [onSubmit] with the values snapshot when
     * valid. The submitting flag wraps the callback.
     */
    public fun submit() {
        if (!validateAll()) return
        beginSubmit()
        onSubmit?.invoke(values.value)
        endSubmit()
    }

    /** Web-parity alias for [submit] (`form.handleSubmit()`). */
    public fun handleSubmit() {
        submit()
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

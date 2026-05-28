// Smoke tests for PyreonForm — the Compose `useForm` state container.
// Same dependency-free `check(...)`-style harness as PyreonStorageTest /
// PyreonFetchTest. Runs via `verify-kotlin.ts --service=PyreonForm`.

package com.pyreon.runtime

fun testFormInitialValues() {
    val f = PyreonForm(mapOf("email" to "a@b.com"))
    check(f.values.value["email"] == "a@b.com") { "initial value seeded" }
    check(f.errors.value.isEmpty()) { "fresh errors empty" }
    check(!f.isSubmitting.value) { "fresh not submitting" }
    check(f.isValid) { "fresh form is valid" }
}

fun testFormSetValue() {
    val f = PyreonForm()
    f.setValue("name", "Ada")
    check(f.values.value["name"] == "Ada") { "setValue updates" }
}

fun testFormSetAndClearError() {
    val f = PyreonForm()
    f.setError("email", "required")
    check(f.errors.value["email"] == "required") { "error set" }
    check(!f.isValid) { "invalid with an error" }
    f.setError("email", null)
    check(f.errors.value["email"] == null) { "error cleared" }
    check(f.isValid) { "valid after clear" }
}

fun testFormSetTouched() {
    val f = PyreonForm()
    check(f.touched.value["email"] == null) { "untouched initially" }
    f.setTouched("email")
    check(f.touched.value["email"] == true) { "touched after setTouched" }
}

fun testFormSubmitFlag() {
    val f = PyreonForm()
    f.beginSubmit()
    check(f.isSubmitting.value) { "submitting after begin" }
    f.endSubmit()
    check(!f.isSubmitting.value) { "not submitting after end" }
}

fun testFormReset() {
    val f = PyreonForm(mapOf("email" to "a@b.com"))
    f.setValue("email", "changed")
    f.setError("email", "bad")
    f.setTouched("email")
    f.beginSubmit()
    f.reset()
    check(f.values.value["email"] == "a@b.com") { "values restored to initial" }
    check(f.errors.value.isEmpty()) { "errors cleared on reset" }
    check(f.touched.value.isEmpty()) { "touched cleared on reset" }
    check(!f.isSubmitting.value) { "submitting cleared on reset" }
}

fun main() {
    testFormInitialValues()
    testFormSetValue()
    testFormSetAndClearError()
    testFormSetTouched()
    testFormSubmitFlag()
    testFormReset()
    println("[PyreonFormTest] all smoke tests passed")
}

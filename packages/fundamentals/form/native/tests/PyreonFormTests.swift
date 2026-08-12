// PyreonForm + PyreonFieldArray behavior — one standalone assertion program
// the co-source verify gate compiles with ../swift/{PyreonForm,PyreonFieldArray}.swift
// (-parse-as-library) and runs. A package's native/tests/ carries ONE @main, so
// both runtimes' assertions live here. Byte-aligned with the .kt tests + the web
// use-form / use-field-array tests.

import Foundation
import SwiftUI

@main
struct PyreonFormTests {
    static func eq<T: Equatable>(_ a: T, _ b: T, _ m: String = "") {
        if a != b { fatalError("PyreonFormTests: \(m) — \(a) != \(b)") }
    }
    static func check(_ c: Bool, _ m: String) { if !c { fatalError("PyreonFormTests: \(m)") } }

    static func main() {
        runFieldArray()
        if #available(iOS 17.0, macOS 14.0, *) { runForm() }
        print("[PyreonFormTests] all assertions passed")
    }

    // MARK: PyreonFieldArray (stable keys are the load-bearing clause)

    static func runFieldArray() {
        var arr = PyreonFieldArray(["a", "b"])
        eq(arr.length, 2)
        eq(arr.values(), ["a", "b"])
        eq(arr.items.map(\.key), [0, 1])
        arr.append("c")
        eq(arr.items[2].key, 2, "append continues the key sequence")

        arr = PyreonFieldArray(["a", "b", "c"])
        arr.remove(1)
        eq(arr.values(), ["a", "c"])
        eq(arr.items.map(\.key), [0, 2], "survivor keys UNCHANGED")
        arr.append("d")
        eq(arr.items[2].key, 3, "keys never reused after a removal")

        arr = PyreonFieldArray(["a"])
        arr.update(0, "edited")
        eq(arr.values(), ["edited"])
        eq(arr.items[0].key, 0, "update keeps the row's key")

        arr = PyreonFieldArray(["b"])
        arr.prepend("a")
        eq(arr.values(), ["a", "b"])
        arr.insert(99, "z")
        eq(arr.values(), ["a", "b", "z"], "insert clamps to end")
        arr.insert(-5, "0")
        eq(arr.values(), ["0", "a", "b", "z"], "insert clamps to start")

        arr = PyreonFieldArray(["a", "b", "c"])
        arr.move(from: 0, to: 2)
        eq(arr.values(), ["b", "c", "a"])
        arr.swap(0, 1)
        eq(arr.values(), ["c", "b", "a"])
        let keysBefore = Set(arr.items.map(\.key))
        arr.replace(["x", "y"])
        eq(arr.values(), ["x", "y"])
        check(Set(arr.items.map(\.key)).isDisjoint(with: keysBefore), "replace assigns FRESH keys")

        arr = PyreonFieldArray(["a"])
        arr.remove(5); arr.update(5, "x"); arr.move(from: 0, to: 9); arr.swap(0, 9)
        eq(arr.values(), ["a"], "OOB ops are no-ops")
    }

    // MARK: PyreonForm (useForm state container + validators/submit)

    @available(iOS 17.0, macOS 14.0, *)
    static func runForm() {
        // initial values seed `values`; fresh form is error-free + valid
        var form = PyreonForm(initialValues: ["email": "a@b.com"])
        eq(form.values["email"], "a@b.com")
        check(form.errors.isEmpty, "fresh form has no errors")
        check(!form.isSubmitting, "fresh form not submitting")
        check(form.isValid, "fresh form is valid")

        // setValue
        form = PyreonForm()
        form.setValue("name", "Ada")
        eq(form.values["name"], "Ada")

        // setError set/clear + isValid tracks
        form = PyreonForm()
        form.setError("email", "required")
        eq(form.errors["email"], "required")
        check(!form.isValid, "error → invalid")
        form.setError("email", nil)
        check(form.errors["email"] == nil, "cleared error")
        check(form.isValid, "cleared → valid")

        // setTouched
        form = PyreonForm()
        check(form.touched["email"] == nil, "untouched initially")
        form.setTouched("email")
        eq(form.touched["email"], true)

        // submit flag
        form = PyreonForm()
        form.beginSubmit()
        check(form.isSubmitting, "beginSubmit")
        form.endSubmit()
        check(!form.isSubmitting, "endSubmit")

        // reset restores initial + clears
        form = PyreonForm(initialValues: ["email": "a@b.com"])
        form.setValue("email", "changed"); form.setError("email", "bad")
        form.setTouched("email"); form.beginSubmit()
        form.reset()
        eq(form.values["email"], "a@b.com")
        check(form.errors.isEmpty && form.touched.isEmpty && !form.isSubmitting, "reset clears all")

        // validator flow: fail → error; setValue re-validates
        form = PyreonForm(
            initialValues: ["username": ""],
            validators: ["username": { $0.count < 3 ? "too short" : "" }]
        )
        check(!form.validateField("username"), "invalid field")
        eq(form.errors["username"], "too short")
        form.setValue("username", "alice")
        check(form.errors["username"] == nil, "re-validated on set")

        // submit gates on validateAll
        var submitted: [String: String]? = nil
        form = PyreonForm(
            initialValues: ["username": ""],
            validators: ["username": { $0.isEmpty ? "required" : "" }],
            onSubmit: { submitted = $0 }
        )
        form.submit()
        check(submitted == nil, "invalid form must not submit")
        eq(form.errors["username"], "required")
        form.setFieldValue("username", "alice")
        form.submit()
        eq(submitted?["username"], "alice")
        check(!form.isSubmitting, "submit clears submitting")

        // binding round-trip
        form = PyreonForm(initialValues: ["email": "a@b.c"])
        let binding = form.binding("email")
        eq(binding.wrappedValue, "a@b.c")
        binding.wrappedValue = "x@y.z"
        eq(form.values["email"], "x@y.z")
    }
}

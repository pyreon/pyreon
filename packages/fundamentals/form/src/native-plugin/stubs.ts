import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const FORM_SWIFT_STUBS = `// ---- PyreonForm (@pyreon/form -> runtime-swift's PyreonForm, a final class) ----
// The emit does @State private var form = PyreonForm(initialValues:validators:)
// then form.binding("x") / form.errors["x"] / form.submit() / form.isSubmitting,
// and sets form.onSubmit from .onAppear (a @State initializer can't capture a
// callback needing self). A reference type, so the onSubmit assignment mutates in
// place. validators is [String: (String) -> String] so the { v in ... } closure
// param infers String -- a loose Any would MASK the emit's real closure typing.
public final class PyreonForm {
  public init(
    initialValues: [String: String] = [:],
    validators: [String: (String) -> String] = [:],
    onSubmit: (([String: String]) -> Void)? = nil
  ) {}
  // Mirrors packages/fundamentals/form/native/swift/PyreonForm.swift.
  // values / touched / setFieldValue / setValue / validateField / validateAll
  // / isValid / reset were MISSING here, so a form shape the REAL runtime
  // accepts failed this gate — the subset-stub-manufactures-failures half of
  // the stub-fidelity rule (the superset half is the one that masks). Found
  // when the onSubmit values-param rewrite's regression test compiled against
  // the real toolchains but not against the stub.
  public private(set) var values: [String: String] = [:]
  public private(set) var errors: [String: String] = [:]
  public private(set) var touched: [String: Bool] = [:]
  public private(set) var isSubmitting: Bool = false
  public var onSubmit: (([String: String]) -> Void)?
  public func setValue(_ name: String, _ value: String) {}
  public func setFieldValue(_ name: String, _ value: String) {}
  public func binding(_ name: String) -> Binding<String> { Binding(get: { "" }, set: { _ in }) }
  public func validateField(_ name: String) -> Bool { true }
  public func validateAll() -> Bool { true }
  public func submit() {}
  public func handleSubmit() {}
  public func setError(_ name: String, _ message: String?) {}
  public func setTouched(_ name: String, _ isTouched: Bool = true) {}
  public var isValid: Bool { true }
  public func beginSubmit() {}
  public func endSubmit() {}
  public func reset() {}
}

// PyreonFieldArray — dynamic form lists. Mirrors runtime-swift exactly:
// items/length are PROPERTIES (an emit that keeps the web's call parens
// must fail here), move is the one labelled method.
public struct PyreonFieldArrayItem {
  public let key: Int
  public var value: String
}
public final class PyreonFieldArray {
  public init(_ initial: [String] = []) {}
  public var items: [PyreonFieldArrayItem] { [] }
  public var length: Int { 0 }
  public func append(_ value: String) {}
  public func prepend(_ value: String) {}
  public func insert(_ index: Int, _ value: String) {}
  public func remove(_ index: Int) {}
  public func update(_ index: Int, _ value: String) {}
  public func move(from: Int, to: Int) {}
  public func swap(_ indexA: Int, _ indexB: Int) {}
  public func replace(_ values: [String]) {}
  public func values() -> [String] { [] }
}

`
export const FORM_KOTLIN_STUBS = `// PyreonForm — mirror of @pyreon/native-runtime-kotlin's PyreonForm.kt
// v2 surface (form-binding arc): MutableState maps + validators +
// onSubmit + the web-parity setFieldValue / submit / handleSubmit.
// Added with the form fixture — before it, NO useForm shape was
// kotlinc-validated (same gap class the permissions stub closed).
class PyreonForm(
  initialValues: Map<String, String> = emptyMap(),
  private val validators: Map<String, (String) -> String> = emptyMap(),
  // \`var\`, mirroring the real PyreonForm: the emit assigns onSubmit AFTER
  // the decl so a handler referencing the form itself is not a
  // self-reference in its own initializer. A \`val\` here would reject the
  // emit the runtime accepts — a stub stricter than reality.
  var onSubmit: ((Map<String, String>) -> Unit)? = null,
) {
  val values: MutableState<Map<String, String>> = mutableStateOf(initialValues)
  val errors: MutableState<Map<String, String>> = mutableStateOf(emptyMap())
  val touched: MutableState<Map<String, Boolean>> = mutableStateOf(emptyMap())
  val isSubmitting: MutableState<Boolean> = mutableStateOf(false)
  val isValid: Boolean get() = errors.value.isEmpty()
  fun setValue(name: String, value: String) {
    values.value = values.value + (name to value)
    if (errors.value.containsKey(name)) validateField(name)
  }
  fun setFieldValue(name: String, value: String) = setValue(name, value)
  fun setError(name: String, message: String?) {
    errors.value = if (message == null) errors.value - name else errors.value + (name to message)
  }
  fun setTouched(name: String, isTouched: Boolean = true) {
    touched.value = touched.value + (name to isTouched)
  }
  fun validateField(name: String): Boolean {
    val v = validators[name] ?: return true
    val message = v(values.value[name] ?: "")
    errors.value = if (message.isEmpty()) errors.value - name else errors.value + (name to message)
    return message.isEmpty()
  }
  fun validateAll(): Boolean {
    var ok = true
    for (name in validators.keys) { if (!validateField(name)) ok = false }
    return ok
  }
  fun submit() {
    if (!validateAll()) return
    isSubmitting.value = true
    onSubmit?.invoke(values.value)
    isSubmitting.value = false
  }
  fun handleSubmit() = submit()
  fun beginSubmit() { isSubmitting.value = true }
  fun endSubmit() { isSubmitting.value = false }
}

// PyreonFieldArray — dynamic form lists, mirrored exactly (items/length are
// properties; a paren-keeping emit must fail).
data class PyreonFieldArrayItem(val key: Long, val value: String)
class PyreonFieldArray(initial: List<String> = emptyList()) {
  val items: List<PyreonFieldArrayItem> = emptyList()
  val length: Long get() = 0L
  fun append(value: String) {}
  fun prepend(value: String) {}
  fun insert(index: Long, value: String) {}
  fun remove(index: Long) {}
  fun update(index: Long, value: String) {}
  fun move(from: Long, to: Long) {}
  fun swap(indexA: Long, indexB: Long) {}
  fun replace(values: List<String>) {}
  fun values(): List<String> = emptyList()
}

`
export const formStubs: StubAugmentation = {
  swift: (source) =>
    /\bPyreon(?:Form|FieldArray(?:Item)?)\b/.test(source) ? FORM_SWIFT_STUBS : '',
  kotlin: (source) =>
    /\bPyreon(?:Form|FieldArray(?:Item)?)\b/.test(source) ? FORM_KOTLIN_STUBS : '',
}

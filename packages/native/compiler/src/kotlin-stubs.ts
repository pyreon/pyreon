// Minimal Compose API stubs for the Kotlin validation harness.
//
// `kotlinc` has no `-parse-only` flag — it performs semantic analysis
// (type resolution, override checks, etc.) by default. To validate
// emitted Compose code without depending on the real Jetpack Compose
// libraries (which would require Gradle + Android SDK + a non-trivial
// JVM bootstrap), we compile against this tiny stub file that mocks
// the Compose API surface the seven starter fixtures touch.
//
// The stubs are NOT a runtime replacement — they exist solely so
// kotlinc accepts the emitted source as well-typed. Real apps compile
// against the actual Compose dependencies.
//
// Symbols covered (from the fixtures' grep + TodoMVC emit): `@Composable`,
// `Text`, `Button`, `LazyColumn`, `Column`, `Row`, `Box`,
// `mutableStateOf`, `derivedStateOf`, `remember`, `rememberSaveable`,
// `items`, `Saver`, `TextField`, `Checkbox`, `KeyboardOptions`,
// `KeyboardActions`, `ImeAction`, `@Serializable`, `Json` (kotlinx-
// serialization), `forEach` (List).
//
// The `by`-delegate protocol on `MutableState` and `State` is included
// so `var x by remember { mutableStateOf(...) }` works at the
// typechecker level.
//
// K4 extension: added stubs needed to validate the TodoMVC emit
// end-to-end (was previously just the 7 starter fixtures' surface).
// New stubs cover the Compose-Material widget set TodoMVC uses
// (`TextField`, `Checkbox`), the saveable-state machinery
// (`rememberSaveable`, `Saver`), the keyboard-options DSL
// (`KeyboardOptions`/`KeyboardActions`/`ImeAction`), and the
// kotlinx-serialization surface (`@Serializable`, `Json` singleton).
//
// ## Stub-shape design notes
//
// Why `getValue` / `setValue` are TOP-LEVEL EXTENSION functions, not
// members: real Jetpack Compose ships them as `inline` extensions on
// `State<T>` / `MutableState<T>` (consumers `import androidx.compose.runtime.{getValue, setValue}`).
// The same shape is load-bearing here for type-inference reasons:
// when `remember<T>(...)` is generic and the call site is
// `var x by remember { mutableStateOf(0) }`, kotlinc's delegate
// resolution for `by` needs the delegate operators reachable WITHOUT
// first resolving T. Member-function operators on `MutableState<T>`
// cause a circular inference (T's resolution depends on the delegate
// site, which depends on T). Extension-function operators on
// `State<T>` sidestep that — they bind via the receiver SUBTYPE walk,
// which kotlinc can perform before T is concrete. Mirrors the
// structural shape of `androidx.compose.runtime`.
//
// Why `MutableState` extends `State`: also mirrors Compose. `getValue`
// is defined on `State<T>` so it covers BOTH read-only `val by`
// derivations AND mutable `var by` delegations (because
// `MutableState<T>` inherits from `State<T>`). `setValue` only makes
// sense on `MutableState<T>` and is defined only there.

export const KOTLIN_COMPOSE_STUBS = `// Auto-generated Compose stubs for Pyreon native-compiler validation.
// DO NOT EDIT — sourced from @pyreon/native-compiler/src/kotlin-stubs.ts.

@Target(
  AnnotationTarget.FUNCTION,
  AnnotationTarget.TYPE,
  AnnotationTarget.TYPE_PARAMETER,
  AnnotationTarget.PROPERTY_GETTER,
)
@Retention(AnnotationRetention.SOURCE)
annotation class Composable

abstract class State<out T> {
  abstract val value: T
}

class MutableState<T>(initial: T) : State<T>() {
  override var value: T = initial
}

inline operator fun <T> State<T>.getValue(
  thisRef: Any?,
  property: kotlin.reflect.KProperty<*>,
): T = value

inline operator fun <T> MutableState<T>.setValue(
  thisRef: Any?,
  property: kotlin.reflect.KProperty<*>,
  newValue: T,
) {
  value = newValue
}

fun <T> mutableStateOf(initial: T): MutableState<T> = MutableState(initial)

fun <T> derivedStateOf(block: () -> T): State<T> = MutableState(block())

@Composable
fun <T> remember(calculation: () -> T): T = calculation()

@Composable
fun Text(text: String) {}

@Composable
fun Button(onClick: () -> Unit, content: @Composable () -> Unit) {
  content()
}

class LazyListScope {
  fun <T> items(items: List<T>, key: (T) -> Any, itemContent: @Composable (T) -> Unit) {
    items.forEach { itemContent(it) }
  }
}

@Composable
fun LazyColumn(content: LazyListScope.() -> Unit) {
  LazyListScope().content()
}

@Composable
fun Column(content: @Composable () -> Unit) {
  content()
}

// --- K4: layout containers used by TodoMVC after the K3 SwiftUI→Compose mapping ---

@Composable
fun Row(content: @Composable () -> Unit) {
  content()
}

@Composable
fun Box(content: @Composable () -> Unit) {
  content()
}

// --- K4: Saveable state machinery (rememberSaveable + Saver) ---
//
// Real Compose ships rememberSaveable as a Composable that persists
// state through configuration changes (rotation, etc.) via the
// SavedStateRegistry. The stub here mimics the API surface — saver
// argument optional, init lambda required — without any real
// persistence behavior. Type-checker only.

class Saver<Original, Saveable : Any>(
  val save: (Original) -> Saveable?,
  val restore: (Saveable) -> Original?,
)

// rememberSaveable's type-parameter T is the SAVED (inner) type. The
// init lambda returns MutableState<T>, and rememberSaveable returns
// MutableState<T> — so the same getValue/setValue extensions on State<T>
// drive the "by" delegation as for the plain remember(mutableStateOf)
// pattern. Mirrors the real androidx.compose.runtime.saveable signature.

@Composable
fun <T : Any> rememberSaveable(
  saver: Saver<T, out Any>? = null,
  init: () -> MutableState<T>,
): MutableState<T> = init()

// --- K4: TextField + keyboard DSL (Compose Material variant) ---
//
// Compose Material's TextField has many overloads. The stub captures
// the four args TodoMVC's emit uses (value, onValueChange, placeholder
// slot, keyboardOptions, keyboardActions). All non-required args have
// defaults so missing-arg call sites are still well-typed.

class KeyboardOptions(val imeAction: ImeAction = ImeAction.Default)

class KeyboardActions(val onDone: (() -> Unit)? = null)

class ImeAction private constructor(val id: Int) {
  companion object {
    val Default = ImeAction(0)
    val Done = ImeAction(1)
    val Go = ImeAction(2)
    val Search = ImeAction(3)
    val Send = ImeAction(4)
    val Next = ImeAction(5)
    val Previous = ImeAction(6)
  }
}

@Composable
fun TextField(
  value: String,
  onValueChange: (String) -> Unit,
  placeholder: (@Composable () -> Unit)? = null,
  keyboardOptions: KeyboardOptions = KeyboardOptions(),
  keyboardActions: KeyboardActions = KeyboardActions(),
) {
  // Type-check-only stub. Real Compose Material renders an outlined
  // text input bound to the value/onValueChange pair.
}

// --- K4: Checkbox (Compose Material) ---

@Composable
fun Checkbox(
  checked: Boolean,
  onCheckedChange: ((Boolean) -> Unit)? = null,
) {
  // Type-check-only stub.
}

// --- K4: kotlinx-serialization stubs (@Serializable + Json singleton) ---
//
// Real kotlinx-serialization uses a compiler plugin to generate
// per-class serializers at build time. The stub here just declares
// the annotation + a Json singleton whose generic encode/decode
// functions are reachable to kotlinc. No real (de)serialization;
// stub callers receive a default-constructed value on decode.

@Target(AnnotationTarget.CLASS, AnnotationTarget.PROPERTY, AnnotationTarget.TYPE)
@Retention(AnnotationRetention.RUNTIME)
annotation class Serializable

object Json {
  inline fun <reified T> encodeToString(value: T): String = value.toString()
  // Stub returns a default-constructed value via unchecked cast; the
  // real implementation roundtrips through the @Serializable plugin.
  // For TYPE-CHECK validation only — never invoke at runtime.
  @Suppress("UNCHECKED_CAST")
  inline fun <reified T> decodeFromString(value: String): T = (null as Any?) as T
}
`

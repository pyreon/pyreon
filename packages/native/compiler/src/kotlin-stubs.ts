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
// Symbols covered (from the fixtures' grep): `@Composable`, `Text`,
// `Button`, `LazyColumn`, `Column`, `mutableStateOf`, `derivedStateOf`,
// `remember`, `items`. The `by`-delegate protocol on `MutableState` and
// `State` is included so `var x by remember { mutableStateOf(...) }`
// works at the typechecker level.
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
`

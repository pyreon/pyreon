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

class MutableState<T>(private var current: T) {
  operator fun getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>): T = current
  operator fun setValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>, newValue: T) {
    current = newValue
  }
}

fun <T> mutableStateOf(initial: T): MutableState<T> = MutableState(initial)

class State<T>(private val current: T) {
  operator fun getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>): T = current
}

fun <T> derivedStateOf(block: () -> T): State<T> = State(block())

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

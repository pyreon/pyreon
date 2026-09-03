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

// kotlinx-coroutines delay, emitted by the useInterval / useTimeout
// lowering. Declared here rather than under its real package because this
// stub file is a single default-package unit; the real build resolves it via
// a conditional import (see native/cli's conditionalKotlinImports).
//
// The suspend modifier is retained because the real delay suspends and the
// emitted call sites sit inside a LaunchedEffect body — a non-suspend stub
// would let a non-suspend call site through.
suspend fun delay(timeMillis: Long) {}

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

// LaunchedEffect — used by PyreonSuspenseWrapper (PR-3.2). Stub
// just invokes the block synchronously; runtime semantics are
// irrelevant for stub-compilation.
@Composable
@Suppress("UNUSED_PARAMETER")
fun LaunchedEffect(key1: Any?, block: suspend () -> Unit) {}

// isSystemInDarkTheme — Compose's dark-mode read (androidx.compose.foundation),
// emitted by useColorScheme(). The real device build imports it via the CLI's
// conditionalKotlinImports; this stub mirrors that surface so the validate-kotlin
// gate resolves it (previously missing → any useColorScheme emit failed kotlinc).
@Composable
fun isSystemInDarkTheme(): Boolean = false
// LocalConfiguration — Compose's screen configuration (androidx.compose.ui.platform),
// emitted by useSizeClass() as LocalConfiguration.current.screenWidthDp. The real
// device build imports it via the CLI's conditionalKotlinImports; this stub mirrors
// the surface so the validate-kotlin gate resolves it (previously missing → any
// useSizeClass emit failed kotlinc).
class Configuration {
  val screenWidthDp: Int = 0
}
object LocalConfiguration {
  val current: Configuration
    @Composable get() = Configuration()
}
// Context + LocalContext (android.content / androidx.compose.ui.platform).
// EVERY Context-injecting service emits "val xCtx = LocalContext.current" --
// clipboard, share, linking, notifications, the two pickers, and any
// user-defined useNativeModule -- yet neither symbol was stubbed, so the
// validate-kotlin gate could not compile ANY of those emits (the same
// coverage hole LocalConfiguration and isSystemInDarkTheme each had). The
// real device build resolves them via the CLI's conditionalKotlinImports.
//
// Context is ABSTRACT in the real android.content, so the stub is too -- a
// convenient open class would let an emit construct a bare Context() that
// the real SDK rejects (a superset stub is itself a masking source). The
// composition local hands out an internal concrete instance instead.
abstract class Context
private object StubContext : Context()
object LocalContext {
  val current: Context
    @Composable get() = StubContext
}

// Text — style/color args added for Heading emit (P2.2). Defaults keep
// the bare Text(text = "...") call sites (from Text emit) valid.
enum class TextOverflow { Clip, Ellipsis, Visible }
@Composable
@Suppress("UNUSED_PARAMETER")
fun Text(text: String, style: TextStyle = TextStyle(), color: Color? = null, fontSize: TextUnit = TextUnit(0f), fontWeight: FontWeight? = null, fontStyle: FontStyle? = null, textAlign: TextAlign? = null, fontFamily: FontFamily? = null, letterSpacing: TextUnit = TextUnit(0f), maxLines: Int = Int.MAX_VALUE, overflow: TextOverflow = TextOverflow.Clip, modifier: Modifier = Modifier) {}

@Composable
fun Button(
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  colors: ButtonColorsStub = ButtonColorsStub(),
  content: @Composable () -> Unit,
) {
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
fun Column(
  modifier: Modifier = Modifier,
  verticalArrangement: Arrangement.Vertical = Arrangement.Top,
  horizontalAlignment: Alignment.Horizontal = Alignment.Start,
  content: @Composable () -> Unit = {},
) {
  content()
}

// --- K4: layout containers used by TodoMVC after the K3 SwiftUI→Compose mapping ---
//
// Phase-B canonical primitives extend these stubs with the named-arg
// surface the Phase-B emit produces: modifier, verticalArrangement,
// horizontalArrangement, horizontalAlignment, verticalAlignment, contentAlignment.
//
// Re-declared here (not via @JvmOverloads or extension functions) because
// kotlinc-stub validation needs the exact signature kotlinc would see in
// real Compose. The existing single-param Composable stays at the top of
// the resolution chain for legacy single-arg call sites; the multi-arg
// overload covers Phase-B emit.

@Composable
fun Row(
  modifier: Modifier = Modifier,
  horizontalArrangement: Arrangement.Horizontal = Arrangement.Start,
  verticalAlignment: Alignment.Vertical = Alignment.Top,
  content: @Composable () -> Unit = {},
) {
  content()
}

@Composable
fun Box(
  modifier: Modifier = Modifier,
  contentAlignment: Alignment = Alignment.TopStart,
  content: @Composable () -> Unit = {},
) {
  content()
}

// BoxWithConstraints — the container-sized host the chart-host emit uses
// (chart-hosts.ts): maxWidth is the Dp the draw list is laid out for.
class BoxWithConstraintsScope {
  val maxWidth: Dp = Dp(0f)
  val maxHeight: Dp = Dp(0f)
}

@Composable
@Suppress("UNUSED_PARAMETER")
fun BoxWithConstraints(
  modifier: Modifier = Modifier,
  content: @Composable BoxWithConstraintsScope.() -> Unit,
) {
  BoxWithConstraintsScope().content()
}

// LocalDensity — the chart-host tap emit divides a px tap position by the
// display density (the draw list is laid out in dp).
class Density(val density: Float = 1f)
object LocalDensity { val current: Density = Density() }

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

// Both params default, mirroring the real signature — a stub that REQUIRED
// either would reject the emit's one-argument calls, which is the
// narrower-than-the-runtime failure that manufactures a phantom bug.
class KeyboardOptions(
  val keyboardType: KeyboardType = KeyboardType.Text,
  val imeAction: ImeAction = ImeAction.Default,
)
// The real KeyboardType members, not a convenient superset: a stub wider than
// the runtime is itself a masking source.
object KeyboardType {
  val Text = KeyboardType
  val Ascii = KeyboardType
  val Number = KeyboardType
  val Phone = KeyboardType
  val Uri = KeyboardType
  val Email = KeyboardType
  val Password = KeyboardType
  val NumberPassword = KeyboardType
  val Decimal = KeyboardType
}

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
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  placeholder: (@Composable () -> Unit)? = null,
  visualTransformation: VisualTransformation = VisualTransformation.None,
  keyboardOptions: KeyboardOptions = KeyboardOptions(),
  keyboardActions: KeyboardActions = KeyboardActions(),
) {
  // Type-check-only stub. Real Compose Material renders an outlined
  // text input bound to the value/onValueChange pair. Canonical-
  // primitive emit threads modifier/enabled/visualTransformation
  // through from <Field disabled? kind="password"?>.
}

// --- K4: Checkbox (Compose Material) ---

@Composable
fun Checkbox(
  checked: Boolean,
  onCheckedChange: ((Boolean) -> Unit)? = null,
) {
  // Type-check-only stub.
}

// --- Phase E2: Switch (Compose Material binary toggle) ---
//
// Canonical Toggle emits to Switch(checked, onCheckedChange) on
// Compose. Switch is the Material-spec name for the binary toggle
// widget (NOT Toggle — Compose has no Toggle composable; that name
// is SwiftUI-only). Same surface as Checkbox plus the enabled arg
// for the canonical disabled prop. Type-check-only stub.

@Composable
fun Switch(
  checked: Boolean,
  onCheckedChange: ((Boolean) -> Unit)? = null,
  enabled: Boolean = true,
  modifier: Modifier = Modifier,
) {
  // Type-check-only stub. The modifier param mirrors the real Material
  // Switch — its absence made the stub a SUBSET that manufactured a
  // failure on the (valid) data-testid -> Modifier.testTag emit.
}

// --- Phase 2.5: @pyreon/native-runtime-kotlin's rememberPyreonStorage ---
//
// The compiler emit now calls rememberPyreonStorage<T>(key, default)
// for non-native useStorage<T> types — collapses the previous 4-line
// Saver inline boilerplate to one line at the call site. The full
// implementation lives in @pyreon/native-runtime-kotlin;
// here we stub just enough surface for kotlinc to typecheck the emit.
//
// Real apps depend on @pyreon/native-runtime-kotlin to get the real
// implementation (with InMemoryBackend / DataStoreBackend pluggable
// storage backends + kotlinx-serialization JSON round-trip).

@Composable
fun <T : Any> rememberPyreonStorage(
  key: String,
  initial: T,
): MutableState<T> = mutableStateOf(initial)

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

// --- Phase B: stubs for the canonical-primitive emit surface ---
//
// The Phase B emit produces Compose code that references Modifier,
// Arrangement, Alignment, Color, RoundedCornerShape,
// PasswordVisualTransformation, and the Dp unit. Real apps import
// these from androidx.compose.{ui,foundation,material3}.x — the
// stubs below mock just enough of the public surface for kotlinc to
// accept the emit as well-typed.
//
// Mirrors the K4 pattern (kotlinx-serialization stubs in default
// package; emit uses bare names; real apps add their own imports).

// Dp value class + .dp extensions on numeric types. Compose uses
// these as the canonical layout-distance unit. @JvmInline required
// by Kotlin to compile value classes targeting the JVM.
@JvmInline
value class Dp(val value: Float)
val Int.dp: Dp get() = Dp(this.toFloat())
val Float.dp: Dp get() = Dp(this)
val Double.dp: Dp get() = Dp(this.toFloat())

// TextUnit + .sp — the font-size unit, emitted by Text typography
// (fontSize = 24.sp). Mirrors androidx.compose.ui.unit.TextUnit.
@JvmInline
value class TextUnit(val value: Float)
val Int.sp: TextUnit get() = TextUnit(this.toFloat())
val Double.sp: TextUnit get() = TextUnit(this.toFloat())

// FontWeight / FontStyle / TextAlign — Text typography args
// (androidx.compose.ui.text.font / androidx.compose.ui.text.style).
// Stubbed as the members the typography emit produces.
class FontWeight {
  companion object {
    val Normal = FontWeight()
    val Medium = FontWeight()
    val SemiBold = FontWeight()
    val Bold = FontWeight()
  }
}
class FontStyle {
  companion object {
    val Normal = FontStyle()
    val Italic = FontStyle()
  }
}
class TextAlign {
  companion object {
    val Start = TextAlign()
    val Center = TextAlign()
    val End = TextAlign()
  }
}

// Role — androidx.compose.ui.semantics.Role. Real Compose models it as a
// JvmInline value class with companion vals; the stub uses a class + companion
// of the SAME members so role = Role.Button type-checks. Mirrors the real
// Compose 1.7 surface (Button/Checkbox/Switch/RadioButton/Tab/Image/DropdownList)
// — NOT a superset (the stub-masking trap).
class Role {
  companion object {
    val Button = Role()
    val Checkbox = Role()
    val Switch = Role()
    val RadioButton = Role()
    val Tab = Role()
    val Image = Role()
    val DropdownList = Role()
  }
}

// SemanticsPropertyReceiver — the lambda receiver for Modifier.semantics {}.
// Real Compose exposes contentDescription as a var extension property on this
// receiver (androidx.compose.ui.semantics); the stub models it as a member
// var so semantics { contentDescription = ... } type-checks with the same
// call shape. Mirrors the real surface, not a superset. role (var extension
// property) + heading() (extension fn) back the accessibilityRole vocabulary.
class SemanticsPropertyReceiver {
  var contentDescription: String = ""
  var role: Role = Role.Button
  fun heading() {}
}

// PointerInputScope — receiver of Modifier.pointerInput's block. The
// detector's lambda arity/types mirror the REAL
// detectHorizontalDragGestures (onDragStart takes an Offset; the drag
// callback takes (PointerInputChange, Float)) so an emit passing the
// wrong shape fails the kotlinc gate instead of being masked.
class PointerInputChange
class Offset(val x: Float = 0f, val y: Float = 0f)
class PointerInputScope {
  // The chart-host tap emit (chart-hosts.ts): a tap position in px.
  @Suppress("UNUSED_PARAMETER", "RedundantSuspendModifier")
  suspend fun detectTapGestures(onTap: ((Offset) -> Unit)? = null) {}
  @Suppress("UNUSED_PARAMETER", "RedundantSuspendModifier")
  suspend fun detectHorizontalDragGestures(
    onDragStart: (Offset) -> Unit = {},
    onDragEnd: () -> Unit = {},
    onDragCancel: () -> Unit = {},
    onHorizontalDrag: (PointerInputChange, Float) -> Unit,
  ) {}
}

// Modifier — Compose's chainable layout/decorator API. Real Modifier
// is a marker interface with extension functions; the stub uses a
// concrete object so chains compose cleanly (e.g.
// Modifier.padding(8.dp).background(...)).
//
// The @Suppress("UNUSED_PARAMETER") sprinkled below keeps kotlinc
// from warning about unused stub params — they're load-bearing for
// the public type-check surface, not for the (no-op) runtime.

// Keyboard-shortcut surface for useHotkey. Narrow on purpose: only the members
// the emit produces. A Key constant the emit can ask for but Compose does not
// define must FAIL here rather than resolve against an invented stub.
class FocusRequester {
  fun requestFocus() {}
}

enum class KeyEventType { KeyDown, KeyUp, Unknown }

class Key private constructor(val id: Int) {
  companion object {
    val A = Key(1); val B = Key(2); val C = Key(3); val D = Key(4); val E = Key(5)
    val F = Key(6); val G = Key(7); val H = Key(8); val I = Key(9); val J = Key(10)
    val K = Key(11); val L = Key(12); val M = Key(13); val N = Key(14); val O = Key(15)
    val P = Key(16); val Q = Key(17); val R = Key(18); val S = Key(19); val T = Key(20)
    val U = Key(21); val V = Key(22); val W = Key(23); val X = Key(24); val Y = Key(25)
    val Z = Key(26)
    val Zero = Key(30); val One = Key(31); val Two = Key(32); val Three = Key(33)
    val Four = Key(34); val Five = Key(35); val Six = Key(36); val Seven = Key(37)
    val Eight = Key(38); val Nine = Key(39)
    val Escape = Key(40); val Enter = Key(41); val Delete = Key(42); val Tab = Key(43)
    val Spacebar = Key(44)
    val DirectionUp = Key(45); val DirectionDown = Key(46)
    val DirectionLeft = Key(47); val DirectionRight = Key(48)
    // Every constant here was verified to resolve against the REAL
    // androidx.compose 1.7.5 artifact; Key.Space and a bogus name were checked
    // in the same loop and both failed, so the stub is narrow enough to reject
    // a wrong mapping rather than absorb it.
    val MoveHome = Key(49); val MoveEnd = Key(50)
    val PageUp = Key(51); val PageDown = Key(52)
  }
}

class KeyEvent(
  val key: Key,
  val type: KeyEventType,
  val isCtrlPressed: Boolean = false,
  val isShiftPressed: Boolean = false,
  val isAltPressed: Boolean = false,
  val isMetaPressed: Boolean = false,
)

// PyreonSizedMap — mirrors packages/core/sized-map/native/kotlin/.../PyreonSizedMap.kt.
// The Swift stub gained this earlier; the Kotlin one never did, so a snippet
// using SizedMap compiled on one target and not the other. Signature copied
// from the shipped class: maxEntries required, lru defaulted.
class PyreonSizedMap<K, V>(maxEntries: Int, private val lru: Boolean = false) {
  val size: Int get() = 0
  fun get(key: K): V? = null
  fun set(key: K, value: V) {}
  fun delete(key: K): Boolean = false
  fun has(key: K): Boolean = false
  fun clear() {}
  fun keys(): List<K> = emptyList()
  fun values(): List<V> = emptyList()
  fun entries(): List<Pair<K, V>> = emptyList()
}

object Modifier {
  @Suppress("UNUSED_PARAMETER")
  fun padding(all: Dp): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun padding(horizontal: Dp = 0.dp, vertical: Dp = 0.dp): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun background(color: Color): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun clip(shape: Shape): Modifier = this
  // border — inline-style borderWidth/borderColor lowering. Real:
  // androidx.compose.foundation.border(BorderStroke, Shape).
  @Suppress("UNUSED_PARAMETER")
  fun border(border: BorderStroke, shape: Shape): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun clickable(onClick: () -> Unit): Modifier = this
  // useHotkey — Compose delivers key events only to a FOCUSED node, so the
  // lowering needs all three of these together. Real Compose spells them
  // Modifier.focusRequester(FocusRequester) / .focusable() /
  // .onPreviewKeyEvent((KeyEvent) -> Boolean).
  @Suppress("UNUSED_PARAMETER")
  fun focusRequester(focusRequester: FocusRequester): Modifier = this
  fun focusable(): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun onPreviewKeyEvent(onPreviewKeyEvent: (KeyEvent) -> Boolean): Modifier = this
  // E3.1 — testTag for data-testid passthrough. Real Compose ships
  // it from androidx.compose.ui.platform; same call shape.
  @Suppress("UNUSED_PARAMETER")
  fun testTag(tag: String): Modifier = this
  // P5 a11y — semantics { contentDescription = ... } for the
  // accessibilityLabel vocabulary. Real Compose ships semantics from
  // androidx.compose.ui.semantics with a leading mergeDescendants: Boolean =
  // false param + a SemanticsPropertyReceiver.() -> Unit block; the emit uses
  // the trailing-lambda form so the default applies. Mirrors the real
  // signature EXACTLY (not a superset) so the validate gate can't mask a
  // real-gradle failure (the stub-masking trap).
  @Suppress("UNUSED_PARAMETER")
  fun semantics(
    mergeDescendants: Boolean = false,
    properties: SemanticsPropertyReceiver.() -> Unit,
  ): Modifier = this
  // P5 a11y — clearAndSetSemantics { } for the accessibilityHidden vocabulary.
  // Real Compose ships it from androidx.compose.ui.semantics with a single
  // SemanticsPropertyReceiver.() -> Unit block (no mergeDescendants param).
  // Mirrors the real signature EXACTLY (not a superset).
  @Suppress("UNUSED_PARAMETER")
  fun clearAndSetSemantics(properties: SemanticsPropertyReceiver.() -> Unit): Modifier = this
  // PR-3.4 — alpha for KeepAlive visibility-preservation. Real
  // Compose ships it from androidx.compose.ui.draw; same call shape.
  @Suppress("UNUSED_PARAMETER")
  fun alpha(alpha: Float): Modifier = this
  // --- Phase P2.2: <Scroll> + <Spacer> modifiers. Real Compose ships
  // verticalScroll/horizontalScroll from androidx.compose.foundation and
  // weight as a Row/Column-scope extension; the stub exposes them as
  // Modifier members (scope not enforced — type-check surface only).
  @Suppress("UNUSED_PARAMETER")
  fun verticalScroll(state: ScrollState): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun horizontalScroll(state: ScrollState): Modifier = this
  // --- M2.8: <TransitionGroup> animated keyed list. Real Compose ships
  // animateContentSize() as a Modifier extension from
  // androidx.compose.animation (the CLI emits the matching conditional
  // import; this stub mirrors the real surface so the kotlinc validate gate
  // resolves it without the import, like verticalScroll above).
  fun animateContentSize(): Modifier = this
  // combinedClickable — what <Press onLongPress> lowers to. Device-proven
  // (M2.3) yet un-type-checked: same class as AnimatedVisibility, found the
  // same way, by validating a whole app rather than a single-hook fixture.
  fun combinedClickable(onClick: () -> Unit, onLongClick: (() -> Unit)? = null): Modifier = this
  // pointerInput — what <Press onSwipeLeft/onSwipeRight> lowers to. The
  // block is a suspend lambda with a PointerInputScope receiver so the
  // emitted detectHorizontalDragGestures call resolves inside it, exactly
  // like the real androidx.compose.ui.input.pointer surface.
  @Suppress("UNUSED_PARAMETER")
  fun pointerInput(key: Any?, block: suspend PointerInputScope.() -> Unit): Modifier = this
  // @pyreon/dnd sortable modifiers. Real Compose ships them as top-level
  // extensions on Modifier (PyreonSortableModifier.kt); the stub Modifier is
  // an object, so they are modelled as members with the IDENTICAL parameter
  // lists — same shape testTag / semantics / clickable already use here.
  @Suppress("UNUSED_PARAMETER")
  fun <T> pyreonSortableItem(state: PyreonSortableState<T>, key: String): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun <T> pyreonSortableContainer(state: PyreonSortableState<T>): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun weight(weight: Float): Modifier = this
  // coolgrid Col fractional span maps to fillMaxWidth(size/12f). Real Compose
  // ships it from androidx.compose.foundation.layout.
  @Suppress("UNUSED_PARAMETER")
  fun fillMaxWidth(fraction: Float = 1f): Modifier = this
  // --- Phase P2.2 content: <Icon>/<Image> sizing. Real Compose ships
  // size/width/height from androidx.compose.foundation.layout.
  @Suppress("UNUSED_PARAMETER")
  fun size(size: Dp): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun width(width: Dp): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun widthIn(min: Dp = 0.dp, max: Dp = 0.dp): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun heightIn(min: Dp = 0.dp, max: Dp = 0.dp): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun aspectRatio(ratio: Float): Modifier = this
  @Suppress("UNUSED_PARAMETER")
  fun height(height: Dp): Modifier = this
}

// ScrollState + rememberScrollState — <Scroll> emit's scroll position
// holder. Real Compose: androidx.compose.foundation.ScrollState /
// rememberScrollState(). Type-check-only stub.
class ScrollState
@Composable
fun rememberScrollState(): ScrollState = ScrollState()

// Spacer — <Spacer> emit's flexible-gap composable. Real Compose ships
// it from androidx.compose.foundation.layout.
@Composable
@Suppress("UNUSED_PARAMETER")
fun Spacer(modifier: Modifier = Modifier) {}

// --- Phase P2.2 content: <Heading> / <Icon> / <Image> ---

// TextStyle + MaterialTheme.typography — <Heading> emit's per-level
// typography role. Real Compose: androidx.compose.ui.text.TextStyle +
// androidx.compose.material.MaterialTheme.typography (Material 2 scale —
// the emit's base is androidx.compose.material.*, NOT material3). This
// stub lists EXACTLY the Material 2 Typography members so it can't mask a
// regression to a Material 3 name (headlineLarge, ...) that doesn't exist
// on M2 — that exact stub-masking bug shipped once, caught only by a real
// gradle assembleDebug of a Heading app.
// (No backticks in this comment — it lives inside a template literal.)
class TextStyle
@Composable
@Suppress("UNUSED_PARAMETER")
fun OutlinedButton(onClick: () -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier, colors: ButtonColorsStub = ButtonColorsStub(), content: @Composable () -> Unit) {}
@Composable
@Suppress("UNUSED_PARAMETER")
fun TextButton(onClick: () -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier, colors: ButtonColorsStub = ButtonColorsStub(), content: @Composable () -> Unit) {}
class ButtonColorsStub
object ButtonDefaults {
  fun buttonColors(backgroundColor: Color = Color(0), contentColor: Color = Color(0)): ButtonColorsStub = ButtonColorsStub()
}

object MaterialTheme {
  object colors {
    val primary: Color = Color(0)
    val secondary: Color = Color(0)
    val background: Color = Color(0)
    val surface: Color = Color(0)
    val error: Color = Color(0)
  }
  object typography {
    val h1: TextStyle = TextStyle()
    val h2: TextStyle = TextStyle()
    val h3: TextStyle = TextStyle()
    val h4: TextStyle = TextStyle()
    val h5: TextStyle = TextStyle()
    val h6: TextStyle = TextStyle()
    val subtitle1: TextStyle = TextStyle()
    val subtitle2: TextStyle = TextStyle()
    val body1: TextStyle = TextStyle()
    val body2: TextStyle = TextStyle()
    val button: TextStyle = TextStyle()
    val caption: TextStyle = TextStyle()
    val overline: TextStyle = TextStyle()
  }
}

// ImageVector + Icons.Filled — the <Icon> emit references material
// glyphs at COMPILE TIME (Icons.Filled.<Glyph>; PR-1.3 replaced the
// phantom pyreonIcon runtime lookup that existed only as a stub). The
// stub object lists the glyphs the FIXTURES use plus the Warning
// placeholder — extend it when a fixture adopts a new canonical name
// (kotlinc names the missing val precisely when you forget).
class ImageVector
object Icons {
  object Filled {
    val Star: ImageVector = ImageVector()
    val Warning: ImageVector = ImageVector()
    val Check: ImageVector = ImageVector()
    val Add: ImageVector = ImageVector()
  }
}

@Composable
@Suppress("UNUSED_PARAMETER")
fun Icon(
  imageVector: ImageVector,
  contentDescription: String?,
  tint: Color? = null,
  modifier: Modifier = Modifier,
) {}

// AsyncImage — <Image> emit's remote-image composable (Coil). Real:
// coil.compose.AsyncImage(model, contentDescription, modifier, …).
@Composable
@Suppress("UNUSED_PARAMETER")
// contentScale is what <Image fit> lowers to. It was absent, so every fit value
// failed this gate while the real device build was fine (the CLI adds the
// androidx.compose.ui.layout.ContentScale import conditionally) — a stub
// narrower than the runtime, leaving a shipped prop with no compile coverage
// rather than falsely reddening a correct one.
fun AsyncImage(
  model: Any?,
  contentDescription: String?,
  modifier: Modifier = Modifier,
  contentScale: ContentScaleStub = ContentScale.Fit,
) {}

// Dialog — <Modal> emit's overlay composable (conditionally composed
// behind an if (open) guard). Real Compose: androidx.compose.ui.window.Dialog.
@Composable
@Suppress("UNUSED_PARAMETER")
fun Dialog(onDismissRequest: () -> Unit, content: @Composable () -> Unit) {
  content()
}

// Arrangement — gap / placement on the main axis. The Phase B emit
// uses Arrangement.spacedBy for canonical gap={N} prop, plus
// Top/Start/End/Bottom as the canonical-axis defaults.
object Arrangement {
  interface Horizontal
  interface Vertical
  // HorizontalOrVertical is a sealed type in real Compose; stub
  // returns a value satisfying both interfaces. Made public (not
  // private) so spacedBy()'s return type doesn't leak a
  // private-in-class type.
  object Spaced : Horizontal, Vertical
  @Suppress("UNUSED_PARAMETER")
  fun spacedBy(space: Dp): Spaced = Spaced
  val Top: Vertical = Spaced
  val Bottom: Vertical = Spaced
  val Start: Horizontal = Spaced
  val End: Horizontal = Spaced
}

// Alignment — cross-axis alignment. The Phase B emit uses
// Alignment.{Start,CenterHorizontally,End} for Column horizontalAlignment
// and {Top,CenterVertically,Bottom} for Row verticalAlignment, plus the
// 2D corner instances (TopStart, etc.) for Box contentAlignment.
object Alignment {
  interface Horizontal
  interface Vertical
  private object H : Horizontal
  private object V : Vertical
  val Start: Horizontal = H
  val CenterHorizontally: Horizontal = H
  val End: Horizontal = H
  val Top: Vertical = V
  val CenterVertically: Vertical = V
  val Bottom: Vertical = V
  // 2D alignment instances — Box's contentAlignment.
  val TopStart: Alignment = this
  val Center: Alignment = this
  val BottomEnd: Alignment = this
}

// Color — Compose color value. Real Compose Color accepts a packed
// Long (0xFFRRGGBB shape); the stub matches that constructor signature.
class Color(val value: Long) {
  companion object {
    val Gray: Color = Color(0xFF808080)
  }
}

// Shape — marker interface for clip(). Real Compose has multiple
// shape types (RoundedCornerShape, CircleShape, CutCornerShape, etc.);
// the stub just exposes the interface + the one shape Phase B emits.
interface Shape
@Suppress("UNUSED_PARAMETER")
class RoundedCornerShape(corner: Dp) : Shape

// BorderStroke — width + color for Modifier.border. Real:
// androidx.compose.foundation.BorderStroke.
@Suppress("UNUSED_PARAMETER")
class BorderStroke(width: Dp, color: Color)

// VisualTransformation — the base type for a text visual mask. Mirrors the
// real Compose surface EXACTLY (an interface with a None companion) so the
// stub can't mask a wrong reference: the dynamic-kind Field emit produces
// visualTransformation = if (reveal) VisualTransformation.None else
// PasswordVisualTransformation(). PasswordVisualTransformation implements it;
// None is the no-mask default.
interface VisualTransformation {
  companion object {
    val None: VisualTransformation = object : VisualTransformation {}
  }
}
// PasswordVisualTransformation — Compose Material's visual-mask
// for password-field text. Phase B Field emit uses it for kind="password".
class PasswordVisualTransformation : VisualTransformation

// --- Phase C5.3: nav-compose stubs for NavHost emit ---
//
// Real Compose ships androidx.navigation.compose with NavHost,
// composable(), NavController, rememberNavController(), NavBackStackEntry,
// Bundle args. These stubs are the minimum surface PMTC emits when a
// route table is detected on createRouter({ routes: [...] }):
//
//   val navController = rememberNavController()
//   NavHost(navController, startDestination = "/") {
//     composable("/") { HomePage() }
//     composable("/users/{id}") { entry ->
//       val params = entry.arguments?.let { args ->
//         args.keySet().associateWith { key -> args.getString(key) ?: "" }
//       } ?: emptyMap()
//       UserPage(params = params)
//     }
//   }
//
// The stubs let kotlinc resolve the symbols + types; real apps depend
// on androidx.navigation:navigation-compose for runtime behaviour.

class Bundle {
  fun keySet(): Set<String> = emptySet()
  fun getString(key: String): String? = null
}

class NavBackStackEntry {
  val arguments: Bundle? = Bundle()
}

class NavController
class NavGraphBuilder {
  @Suppress("UNUSED_PARAMETER")
  fun composable(route: String, content: @Composable (NavBackStackEntry) -> Unit) { }
}

@Composable
@Suppress("UNUSED_PARAMETER")
fun NavHost(navController: NavController, startDestination: String, builder: NavGraphBuilder.() -> Unit) {
  // Stub: real NavHost wires the back stack + per-route content
  // composables. Phase C5.3 emit only needs the symbol resolvable.
}

@Composable
fun rememberNavController(): NavController = NavController()

// PMTC's C5.3 emit always passes the 1-arg trailing closure form
// (entry-> for :param routes, _-> for literal routes). Single overload —
// no extension needed; matches real androidx.navigation:navigation-compose.

// PyreonLink — declarative navigation, mirrors the real PyreonLink
// composable in @pyreon/native-router-kotlin (B5.5). The compiler
// emits \`<Link to="/x">child</Link>\` as:
//   PyreonLink("/x") { navigate ->
//     Box(modifier = Modifier.clickable { navigate() }) { ... }
//   }
// The stub mirrors that exact signature so kotlinc accepts the emit
// without requiring the consuming app to set up router-kotlin during
// the validate gate. Real apps depend on the actual PyreonLink from
// @pyreon/native-router-kotlin.
@Composable
@Suppress("UNUSED_PARAMETER")
fun <T> PyreonPieChart(data: List<T>, value: (T) -> Number, label: (T) -> String, color: ((T) -> String)? = null, width: Double = 300.0, height: Double = 240.0, innerRadius: Double = 0.0, showLabels: Boolean = true, modifier: Modifier = Modifier) {}
@Composable
@Suppress("UNUSED_PARAMETER")
fun PyreonGaugeChart(value: Double, min: Double = 0.0, max: Double = 100.0, width: Double = 240.0, height: Double = 140.0, thickness: Double = 22.0, trackColor: String = "rgba(132,150,165,0.22)", valueColor: String = "#0f766e", showValue: Boolean = true, modifier: Modifier = Modifier) {}
@Composable
@Suppress("UNUSED_PARAMETER")
fun PyreonLink(to: String, content: @Composable (navigate: () -> Unit) -> Unit) {
  // Stub body — real impl reads LocalPyreonRouter and pushes \`to\`
  // on navigate(). For typecheck-only purposes we just invoke the
  // content with a no-op navigate.
  content { }
}

// PyreonWebView — mirror of @pyreon/native-runtime-kotlin's PyreonWebView.kt
// (the Android WebView host for the <WebView> primitive). Stub so the
// kotlinc validate gate resolves the \`PyreonWebView(html = …)\` /
// \`PyreonWebView(src = …)\` / \`PyreonWebView(data = …)\` the WebView emit
// produces.
@Composable
@Suppress("UNUSED_PARAMETER")
fun PyreonWebView(html: String? = null, src: String? = null, data: String? = null, onMessage: ((String) -> Unit)? = null, modifier: Modifier = Modifier) {}

// PyreonJson — mirror of @pyreon/native-runtime-kotlin's PyreonJson.kt.
// Stub so the kotlinc validate gate resolves \`PyreonJson.encode(signal)\`
// the <WebView data={…}> live-data-bridge emit produces. (The real impl
// uses kotlinx-serialization; the stub just needs to typecheck.)
object PyreonJson {
    @Suppress("UNUSED_PARAMETER")
    inline fun <reified T> encode(value: T): String = ""
}

// useNavigate / useParams / useLoaderData — router hooks that PMTC
// emits when source code uses \`const navigate = useNavigate()\` /
// \`const params = useParams()\` / \`const data = useLoaderData<T>()\`.
//
// Real impls live in @pyreon/native-router-kotlin/Hooks.kt — they
// read LocalPyreonRouter.current (the CompositionLocal) and surface
// the active router's push/params/loaderData. For typecheck-only
// purposes the stubs return defensive defaults (matching the real
// impls' missing-provider fallback shape).
//
// Closes limitation #2 from the Gap 5 tasks-showcase scaffold:
// kotlinc previously rejected the showcase's \`useNavigate()\` call
// with \`unresolved reference\`. With these stubs, any PMTC-emitted
// source using router hooks typecheck-validates without requiring
// the full PyreonRouter Compose dep.
@Composable
fun useNavigate(): (String) -> Unit = { _ -> }

@Composable
fun useParams(): Map<String, String> = emptyMap()

// useUrlState lowers to a PyreonUrlState over the active router, so the
// emit needs a router accessor here too. Same defensive-default shape as
// the two above.
class PyreonCompositionLocal<T>(private val value: T) {
  // NULLABLE, like the real CompositionLocal: router-kotlin's own hooks read
  // LocalPyreonRouter.current and then safe-call it. The first version of this
  // stub typed it non-null, which let an emit assuming a non-null router
  // compile here and fail a real gradle build with an actual-type-is-nullable
  // mismatch. A stub is only worth having if it is at least as strict as the
  // runtime.
  val current: T? get() = value
}

// NO useRouter() here, deliberately: router-kotlin does not ship one, and a
// stub that declared it hid a real emit bug until a device build failed. The
// router is reached through the CompositionLocal, exactly as the runtime does.
val LocalPyreonRouter = PyreonCompositionLocal(PyreonRouter())

@Composable
inline fun <reified T : Any> useLoaderData(): T? = null

// Bundled-image surface (asset-pipeline arc): the Image composable +
// painterResource + ContentScale from androidx, and pyreonDrawable
// from @pyreon/native-runtime-kotlin's PyreonAssets.kt (name-keyed
// drawable lookup — keeps the emit free of host-namespace R refs).
class Painter
fun painterResource(id: Int): Painter = Painter()
class ContentScaleStub
object ContentScale {
  val Crop: ContentScaleStub = ContentScaleStub()
  val Fit: ContentScaleStub = ContentScaleStub()
  val FillBounds: ContentScaleStub = ContentScaleStub()
  val None: ContentScaleStub = ContentScaleStub()
}
fun Image(painter: Painter, contentDescription: String, contentScale: ContentScaleStub = ContentScale.Crop, modifier: Modifier = Modifier) {}
@Composable
fun pyreonDrawable(name: String): Int = 0

// Font surface (PR-1.4): FontFamily + Font + the pyreonFont runtime
// helper from PyreonAssets.kt (res/font lookup by name).
class FontFamily(font: Any? = null)
class Font(id: Int)
@Composable
fun pyreonFont(name: String): FontFamily = FontFamily()

// PyreonFetch — mirror of @pyreon/native-runtime-kotlin's PyreonFetch.kt
// (Phase 4.1 state container). Added with the quotes fixture — before
// it, NO useFetch shape was kotlinc-validated (the Swift loop is
// -parse-only, so it never resolves references; kotlinc fully
// typechecks and is the one that catches missing runtime surface).
// The parity-configured JSON reader the fetch emit decodes with. The real one
// in PyreonFetch.kt sets ignoreUnknownKeys = true, matching Swift's
// JSONDecoder — kotlinx's default THROWS on an unknown key.
val PyreonFetchJson: Json = Json

class PyreonFetch<T> {
  val data: MutableState<T?> = mutableStateOf(null)
  val error: MutableState<Throwable?> = mutableStateOf(null)
  val isPending: MutableState<Boolean> = mutableStateOf(false)
  fun begin() {}
  fun resolve(value: T) {}
  fun reject(e: Throwable) {}
  fun refetch() {}
}

// PyreonQuery — mirror of @pyreon/native-runtime-kotlin's PyreonQuery.kt.
// The cached data container a \`useQuery\` decl emits: MutableState fields
// (\`data\`/\`error\`/\`isPending\`/\`isFetching\` — the emit reads \`.value\`),
// an \`isStale\` getter the emit's LaunchedEffect guards on, and a ctor taking
// \`queryKey\` + defaulted \`staleMillis\`. Signatures track the runtime exactly.
class PyreonQuery<T>(queryKey: String, val staleMillis: Long = 0) {
  var queryKey: String = queryKey
    private set
  val data: MutableState<T?> = mutableStateOf(null)
  val error: MutableState<Throwable?> = mutableStateOf(null)
  val isPending: MutableState<Boolean> = mutableStateOf(false)
  val isFetching: MutableState<Boolean> = mutableStateOf(false)
  val isStale: Boolean get() = true
  fun setKey(key: String) {}
  fun begin() {}
  fun resolve(value: T) {}
  fun reject(e: Throwable) {}
  fun refetch() {}
}

// PyreonHttp — what a \`useFetch(url, { method, headers, body })\` decl emits.
// Mirrors the REAL PyreonHttp.kt surface exactly (a superset stub masks):
// \`isOk\` is lower-k here where Swift's is \`isOK\`, \`body\` is a non-null
// String on the response and a NULLABLE String on the request, and the errors
// are nested classes on a sealed class (so \`PyreonHttpError.BadStatus(n)\`
// resolves as a constructor call, not an enum case).
enum class PyreonHttpMethod(val verb: String) {
  GET("GET"), POST("POST"), PUT("PUT"), PATCH("PATCH"), DELETE("DELETE"),
}
data class PyreonHttpRequest(
  val method: PyreonHttpMethod = PyreonHttpMethod.GET,
  val url: String,
  val headers: Map<String, String> = emptyMap(),
  val body: String? = null,
)
data class PyreonHttpResponse(
  val status: Int,
  val headers: Map<String, String> = emptyMap(),
  val body: String = "",
) {
  val isOk: Boolean get() = status in 200..299
}
sealed class PyreonHttpError(message: String) : Exception(message) {
  class InvalidUrl(val url: String) : PyreonHttpError("invalid url: " + url)
  class BadStatus(val status: Int) : PyreonHttpError("HTTP " + status)
  class NoExecutor : PyreonHttpError("no executor")
}
object PyreonHttp {
  fun send(request: PyreonHttpRequest): PyreonHttpResponse = PyreonHttpResponse(200)
}
// PyreonURL — the runtime path-param encoder a templated endpoint URL calls.
// Mirrors the REAL PyreonURL surface: four overloads (String / Int / Long /
// Double), one per type a \`PathParams\` value can take once the compiler has
// inferred it. Listing FEWER would reject a correct emit; listing more would
// let a wrong one through.
object PyreonURL {
  @JvmStatic fun encodePathParam(value: String): String = value
  @JvmStatic fun encodePathParam(value: Int): String = ""
  @JvmStatic fun encodePathParam(value: Long): String = ""
  @JvmStatic fun encodePathParam(value: Double): String = ""
}

// kotlinx.coroutines surface the emitted fetch harness drives —
// withContext(Dispatchers.IO) { ... } around the blocking URL read.
object Dispatchers {
  val IO: Any = Any()
}
suspend fun <T> withContext(context: Any, block: () -> T): T = block()

// M4.5: the coroutine-scope surface an \`async () => { await … }\` event handler
// emits — a composable-top \`val scope = rememberCoroutineScope()\` then
// \`scope.launch { <suspend body> }\`. Real: rememberCoroutineScope() is
// @Composable returning a kotlinx CoroutineScope, and launch is a
// kotlinx.coroutines extension. Modeled here with launch as a method — the emit
// \`scope.launch { … }\` type-checks against either shape, and the suspend-lambda
// parameter is the load-bearing constraint (a suspend call inside it resolves).
class CoroutineScope {
  fun launch(block: suspend () -> Unit) {}
}
@Composable
fun rememberCoroutineScope(): CoroutineScope = CoroutineScope()

// PyreonClipboard — useClipboard() lowers to
// PyreonClipboard(LocalContext.current, rememberCoroutineScope()).
// Mirrors the real two-arg constructor and read-only 'copied'; a
// settable stub would let an emit that assigns to it typecheck here
// and fail against the real runtime.
// AnimatedVisibility — what <Transition show> lowers to
// (emit-kotlin.ts:4385). Device-proven on both platforms, yet a <Transition>
// app could not be Kotlin-type-checked because the type was absent: found by
// running the counter app's FULL emit through validateKotlin rather than a
// single-hook fixture.
//
// Note for the stub-coverage ratchet: it scans Pyreon* names, so a missing
// COMPOSE/SwiftUI API like this one is outside what it can see. Whole-app
// validation is what catches that class.
// enter/exit default to the real library's defaults; the configured
// <Transition duration/easing> emit passes explicit fade specs. The spec
// types mirror androidx.compose.animation.core's shapes minimally.
class Easing
val LinearEasing: Easing = Easing()
val FastOutSlowInEasing: Easing = Easing()
val FastOutLinearInEasing: Easing = Easing()
val LinearOutSlowInEasing: Easing = Easing()
class TweenSpec
fun tween(durationMillis: Int, easing: Easing): TweenSpec = TweenSpec()
class EnterTransition
class ExitTransition
fun fadeIn(animationSpec: TweenSpec): EnterTransition = EnterTransition()
fun fadeOut(animationSpec: TweenSpec): ExitTransition = ExitTransition()
// A <Transition name> maps to a real enter/exit pair rather than always
// fading, so the stub mirrors the Compose functions that emit can now
// produce. `+` composes transitions in Compose, hence the operator stubs.
fun scaleIn(animationSpec: TweenSpec): EnterTransition = EnterTransition()
fun scaleOut(animationSpec: TweenSpec): ExitTransition = ExitTransition()
fun slideInVertically(animationSpec: TweenSpec, initialOffsetY: (Int) -> Int = { it }): EnterTransition = EnterTransition()
fun slideOutVertically(animationSpec: TweenSpec, targetOffsetY: (Int) -> Int = { it }): ExitTransition = ExitTransition()
fun slideInHorizontally(animationSpec: TweenSpec, initialOffsetX: (Int) -> Int = { it }): EnterTransition = EnterTransition()
fun slideOutHorizontally(animationSpec: TweenSpec, targetOffsetX: (Int) -> Int = { it }): ExitTransition = ExitTransition()
operator fun EnterTransition.plus(other: EnterTransition): EnterTransition = this
operator fun ExitTransition.plus(other: ExitTransition): ExitTransition = this
@Composable
fun AnimatedVisibility(
  visible: Boolean,
  // \`modifier\` mirrors the real composable and was absent, so
  // <Transition> could not carry a test tag or an a11y prop past this gate
  // even though Compose has always accepted one.
  modifier: Modifier = Modifier,
  enter: EnterTransition? = null,
  exit: ExitTransition? = null,
  content: @Composable () -> Unit,
) {}

// PyreonHaptics — useHaptics() lowers to
// PyreonHaptics(LocalHapticFeedback.current). The CompositionLocal and its
// type both have to exist or the hoisted line cannot resolve.
class HapticFeedback
object LocalHapticFeedback {
  val current: HapticFeedback @Composable get() = HapticFeedback()
}
class PyreonHaptics(haptic: HapticFeedback) {
  fun impact(style: String = "medium") {}
  fun notification(type: String) {}
  fun selection() {}
}
// PyreonLinking / PyreonNotifications / PyreonShare — all Context-constructed,
// mirroring the real single-argument constructors.
class PyreonLinking(context: Context) {
  fun openUrl(url: String) {}
}
class PyreonNotifications(context: Context) {
  fun requestPermission() {}
  fun notify(title: String, body: String) {}
}
class PyreonShare(context: Context) {
  fun text(text: String) {}
  fun url(url: String) {}
  fun textUrl(text: String, url: String) {}
  fun canShare(): Boolean = true
}
class PyreonClipboard(context: Context, scope: CoroutineScope) {
  val copied: Boolean get() = false
  val text: String get() = ""
  fun copy(text: String) {}
  fun reset() {}
}

// M3.5: authenticate is a suspend fun — awaited inside pyreonAsyncScope.launch { }.
class PyreonBiometrics {
  suspend fun authenticate(reason: String): Boolean = false
  fun isAvailable(): Boolean = false
}

// M3.4 / M3.8: the picker containers + the androidx.activity ActivityResult
// surface the emit wires into them. STUB FIDELITY (a superset stub MASKS the bug
// it exists to catch): \`pick()\` returns String? (nil = cancelled) so an emit
// that drops the optionality fails here; \`ActivityResultLauncher<I>\` is
// generic in its input; \`ImageOnly\` is nested DIRECTLY in PickVisualMedia (not
// its companion), matching real androidx.
//
// M3.8 made this GENERIC (it was monomorphic when PickVisualMedia was the sole
// caller): the real \`rememberLauncherForActivityResult\` is \`<I, O>\` over an
// \`ActivityResultContract<I, O>\`, and now TWO contracts flow through it —
// PickVisualMedia (input PickVisualMediaRequest) and OpenDocument (input
// Array<String>). Modelling the true generic signature is MORE faithful than a
// second monomorphic overload, and lets the file-picker emit's
// \`OpenDocument()\` typecheck without loosening the image-picker's check.
class PyreonImagePicker {
  var launcher: ActivityResultLauncher<PickVisualMediaRequest>? = null
  fun onResult(uri: String?) {}
  suspend fun pick(): String? = null
  fun isAvailable(): Boolean = true
}

class PyreonFilePicker {
  var launcher: ActivityResultLauncher<Array<String>>? = null
  fun onResult(uri: String?) {}
  suspend fun pick(): String? = null
  fun isAvailable(): Boolean = true
}

class ActivityResultLauncher<I> {
  fun launch(input: I) {}
}

class PickVisualMediaRequest

// The real base contract both pickers' launchers are typed over. Empty (no
// abstract members) so the stub subclasses need no overrides.
abstract class ActivityResultContract<I, O>

class ActivityResultContracts {
  // PickVisualMedia : ActivityResultContract<PickVisualMediaRequest, Uri?>
  class PickVisualMedia : ActivityResultContract<PickVisualMediaRequest, Uri?>() {
    sealed interface VisualMediaType
    object ImageOnly : VisualMediaType
    object VideoOnly : VisualMediaType
    object ImageAndVideo : VisualMediaType
  }
  // OpenDocument : ActivityResultContract<Array<String>, Uri?> — the SAF
  // document picker. Input is the Array<String> of acceptable MIME types.
  class OpenDocument : ActivityResultContract<Array<String>, Uri?>()
}

// android.net.Uri — what the pickers actually hand the callback. Modeled
// (rather than shortcutting the callback param to String?) so the emit's
// \`uri?.toString()\` is checked against the REAL result type: a String? stub
// would happily accept an emit that assumed the callback already yields a
// String, which is exactly the divergence stub fidelity exists to prevent.
class Uri {
  override fun toString(): String = "content://stub"
}

// Real: @Composable fun <I, O> rememberLauncherForActivityResult(
//   contract: ActivityResultContract<I, O>, onResult: (O) -> Unit
// ): ManagedActivityResultLauncher<I, O>. The true generic signature, so BOTH
// PickVisualMedia (I = PickVisualMediaRequest) and OpenDocument (I =
// Array<String>) resolve, each returning a launcher over its own input type.
@Composable
@Suppress("UNUSED_PARAMETER")
fun <I, O> rememberLauncherForActivityResult(
  contract: ActivityResultContract<I, O>,
  onResult: (O) -> Unit,
): ActivityResultLauncher<I> = ActivityResultLauncher()

// PyreonForm — mirror of @pyreon/native-runtime-kotlin's PyreonForm.kt
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

// PyreonRouter + RouterProvider — the router INSTANCE surface PMTC
// emits when source code uses \`createRouter({ routes })\` +
// \`<RouterProvider router={router}>\`:
//
//   val router = remember { PyreonRouter() }
//   RouterProvider(router) { ...when-dispatch on router.currentPath... }
//
// Real impls live in @pyreon/native-router-kotlin (PyreonRouter.kt +
// RouterProvider.kt) — the stub mirrors the exact members the emit
// touches: \`currentPath\` (read by the when-dispatch),
// \`companion.matchPath\` (param-bearing branches; returns
// Map<String, String>? so the dispatcher's \`?: emptyMap()\` + typed-
// param construction typecheck), and the (router, content) Composable
// provider shape. Added when the REWRITTEN showcase-tasks fixture
// joined this loop — the prior coverage (router-hooks.tsx) only
// exercised the HOOK surface, so the instance-level symbols were
// never stubbed.
class PyreonRouter {
  var currentPath: String = "/"
  fun push(path: String) { currentPath = path }
  // Search parameters, mirroring the real PyreonRouter. useUrlState lowers to
  // a class over these two; a stub missing them would reject a correct emit.
  val query: MutableState<Map<String, String>> = mutableStateOf(emptyMap())
  fun setQueryParam(key: String, value: String?) {}
  companion object {
    fun matchPath(path: String, pattern: String): Map<String, String>? {
      if (path == pattern) return emptyMap()
      return null
    }
  }
}

@Composable
fun RouterProvider(router: PyreonRouter, content: @Composable () -> Unit) {
  content()
}

// PyreonRouteLoader — Phase 3 per-route loader host. Real impl in
// @pyreon/native-router-kotlin/RouteLoader.kt fires the loader once via
// LaunchedEffect → router.setLoaderData; the stub mirrors only the
// SIGNATURE the loader-bearing dispatch emits:
//   PyreonRouteLoader(path = currentPath, load = { … }) { Component() }
@Composable
fun PyreonRouteLoader(path: String, load: () -> Any?, content: @Composable () -> Unit) {
  content()
}

// PyreonI18n — Gap 4 PR-3 (Strategy-B port for @pyreon/i18n/core, v1).
// Real impl in @pyreon/native-runtime-kotlin's PyreonI18n.kt.
class PyreonI18n(
  initialLocale: String,
  val messages: Map<String, Map<String, String>>,
  val fallbackLocale: String? = null,
) {
  var locale: String = initialLocale
    private set
  fun t(key: String): String {
    messages[locale]?.get(key)?.let { return it }
    if (fallbackLocale != null) {
      messages[fallbackLocale]?.get(key)?.let { return it }
    }
    return key
  }
  // Two-arg overload — interpolation + one/other plurals. Mirrors the
  // REAL runtime-kotlin signature t(key, values: Map<String, Any?>)
  // (see PyreonI18n.kt) so the emitted dict-arg call shape
  // i18n.t("items", mapOf("count" to n)) typechecks here.
  fun t(key: String, values: Map<String, Any?>): String {
    var out = t(key)
    for ((name, value) in values) {
      out = out.replace("{{" + name + "}}", value?.toString() ?: "")
    }
    return out
  }
}

// PyreonMachine — Gap 4 PR-2 (Strategy-B port for @pyreon/machine).
// Real impl in @pyreon/native-runtime-kotlin's PyreonMachine.kt.
class PyreonMachine(initial: String, val transitions: Map<String, Map<String, String>>) {
  var state: String = initial
    private set
  fun send(event: String) { transitions[state]?.get(event)?.let { state = it } }
  fun matches(s: String): Boolean = state == s
  fun can(event: String): Boolean = transitions[state]?.containsKey(event) == true
  fun nextEvents(): List<String> = transitions[state]?.keys?.toList() ?: emptyList()
  operator fun invoke(): String = state
}

// @pyreon/sync — CRDT doc + synced-signal facade. Mirrors the real
// PyreonCrdt.kt / PyreonSyncedSignal.kt SURFACE.
// A stub NARROWER than the runtime rejects CORRECT emit; one that is WIDER
// hides a missing symbol. Mirrored from PyreonCrdt.kt, not approximated to
// what the emitter happens to produce today — \`Null\` and the whole map facade
// were both absent while this comment already claimed to mirror the surface.
sealed class PyreonScalar {
  data class Str(val v: String) : PyreonScalar()
  data class Num(val v: Double) : PyreonScalar()
  data class Bool(val v: Boolean) : PyreonScalar()
  object Null : PyreonScalar()
}
data class PyreonCrdtOp(
  val map: String,
  val key: String,
  val value: PyreonScalar,
  val clock: Int,
  val actor: String,
)
class PyreonCrdtMap {
  fun get(key: String): PyreonScalar? = null
  fun has(key: String): Boolean = false
  fun keys(): List<String> = emptyList()
  fun set(key: String, value: PyreonScalar) {}
  fun set(key: String, value: String) {}
  fun set(key: String, value: Int) {}
  fun set(key: String, value: Double) {}
  fun set(key: String, value: Boolean) {}
  fun observe(cb: (Set<String>) -> Unit): () -> Unit = {}
}
class PyreonCrdtDoc(val actor: String) {
  var onLocalOps: ((List<PyreonCrdtOp>) -> Unit)? = null
  fun getMap(name: String): PyreonCrdtMap = PyreonCrdtMap()
  fun get(map: String, key: String): PyreonScalar? = null
  fun has(map: String, key: String): Boolean = false
  fun keys(map: String): List<String> = emptyList()
  fun set(map: String, key: String, value: PyreonScalar) {}
  fun observe(map: String, cb: (Set<String>) -> Unit): () -> Unit = {}
  fun applyOps(ops: List<PyreonCrdtOp>) {}
  fun encodeState(): List<PyreonCrdtOp> = emptyList()
  fun encodeMessage(ops: List<PyreonCrdtOp>): String = ""
  fun applyMessage(json: String) {}
}
const val PYREON_SYNCED_DEFAULT_MAP = "pyreon"
class PyreonSyncedSignal<T>(
  doc: PyreonCrdtDoc,
  key: String,
  initial: T,
  map: String = PYREON_SYNCED_DEFAULT_MAP,
) {
  private var _value: T = initial
  val value: T get() = _value
  operator fun invoke(): T = _value
  fun set(v: T) { _value = v }
  // Mirror of the runtime's dispose(); its absence rejected correct code.
  fun dispose() {}
}
// @pyreon/table — the PyreonTableState engine. Mirrors PyreonTableState.kt.
sealed class PyreonCell {
  data class Str(val v: String) : PyreonCell()
  data class Num(val v: Double) : PyreonCell()
  object None : PyreonCell()
}
class PyreonTableColumn<T>(val id: String, val accessor: (T) -> PyreonCell)
class PyreonTableState<T>(
  dataProvider: () -> List<T>,
  columns: List<PyreonTableColumn<T>> = emptyList(),
  pageSize: Int = 0,
  rowId: ((T, Int) -> String)? = null,
  filterFn: ((T, String, List<PyreonTableColumn<T>>) -> Boolean)? = null,
) {
  fun rows(): List<T> = emptyList()
  fun pageCount(): Int = 1
  fun filteredCount(): Int = 0
  fun selectedIds(): List<String> = emptyList()
  fun toggleSort(c: String) {}
  fun setFilter(q: String) {}
  fun setPage(i: Int) {}
  fun nextPage() {}
  fun prevPage() {}
  fun isSelected(id: String): Boolean = false
  fun toggleSelected(id: String) {}
  fun clearSelection() {}
  fun rowId(row: T, index: Int): String = ""
  val page: Int get() = 0
  val sortColumn: String? get() = null
  val sortDirection: String get() = "asc"
  val filterValue: String get() = ""
  val selected: List<String> get() = emptyList()
}

// @pyreon/dnd — the PyreonSortableState engine. Mirrors PyreonSortable.kt.
// The Modifier extensions it pairs with (PyreonSortableModifier.kt) are
// mirrored as Modifier MEMBERS below, the same shape testTag/semantics use —
// the stub Modifier is an object, so a real top-level extension is modelled
// as a member with the identical parameter list.
enum class PyreonSortAxis { VERTICAL, HORIZONTAL }
enum class PyreonDropEdge { TOP, BOTTOM, LEFT, RIGHT }
class PyreonSortableState<T>(
  val axis: PyreonSortAxis = PyreonSortAxis.VERTICAL,
) {
  fun bind(items: () -> List<T>, by: (T) -> String, onReorder: (List<T>) -> Unit) {}
  fun isActive(key: String): Boolean = false
  fun isOverKey(key: String): Boolean = false
  fun activeId(): String? = null
  fun overId(): String? = null
  fun overEdge(): String? = null
  fun pickUp(key: String) {}
  fun dragBy(delta: Float, extent: Float) {}
  fun drop(): Boolean = false
  fun cancel() {}
  fun reordered(dragKey: String, dropKey: String, edge: PyreonDropEdge): List<T>? = null
  val activeKey: String? get() = null
  val overKey: String? get() = null
  val currentEdge: PyreonDropEdge? get() = null
  companion object {
    fun <T> moveIndex(list: List<T>, from: Int, to: Int): List<T> = list
  }
}

// PyreonPermissions — mirror of @pyreon/native-runtime-kotlin's
// PyreonPermissions.kt surface the emit touches: callable shape
// (operator invoke), not / cannot / all / any. Added with the
// permissions contract fixture — before it, NO usePermissions shape
// was kotlinc-validated at all.
// MIRRORS the real signature exactly:
// \`PyreonPermissions(granted: Set<String> = emptySet())\`, with \`granted\`
// exposed as Compose MutableState (read \`.value\`). The stub previously took a
// REQUIRED \`initial\` and a plain Set - stricter than reality on the ctor, and
// a different TYPE on the property. It therefore rejected the emit's correct
// \`PyreonPermissions()\`. A stub stricter than reality fails correct code,
// the inverse of the usual superset-masks problem.
data class PyreonBluetoothDevice(val id: String, val name: String)
interface BluetoothScanner {
  val isAvailable: Boolean
  fun startScan(onDevice: (PyreonBluetoothDevice) -> Unit, onError: (String) -> Unit)
  fun stopScan()
}
class AndroidBluetoothScanner(ctx: Any?) : BluetoothScanner {
  override val isAvailable: Boolean = false
  override fun startScan(onDevice: (PyreonBluetoothDevice) -> Unit, onError: (String) -> Unit) {}
  override fun stopScan() {}
}
class PyreonBluetooth(scanner: BluetoothScanner) {
  val scanning: MutableState<Boolean> = mutableStateOf(false)
  val devices: MutableState<List<PyreonBluetoothDevice>> = mutableStateOf(listOf())
  val error: MutableState<String> = mutableStateOf("")
  val available: Boolean = false
  fun scan() {}
  fun stopScan() {}
}
// PyreonWakeLock + the app-supplied screen keeper the emit names.
interface ScreenKeeper {
  val isSupported: Boolean
  fun setKeepScreenOn(on: Boolean)
}
class AndroidScreenKeeper(ctx: Any?) : ScreenKeeper {
  override val isSupported: Boolean = false
  override fun setKeepScreenOn(on: Boolean) {}
}
// PyreonDeviceInfo + the app-supplied probe the emit names.
data class PyreonDeviceScreen(val width: Double, val height: Double, val scale: Double)
interface DeviceProbe {
  val model: String
  val osVersion: String
  val isTouch: Boolean
  val screen: PyreonDeviceScreen
}
class AndroidDeviceProbe(ctx: Any?) : DeviceProbe {
  override val model: String = ""
  override val osVersion: String = ""
  override val isTouch: Boolean = false
  override val screen: PyreonDeviceScreen = PyreonDeviceScreen(0.0, 0.0, 1.0)
}
class PyreonDeviceInfo(probe: DeviceProbe) {
  val platform: String get() = "android"
  val model: String get() = ""
  val osVersion: String get() = ""
  val isTouch: Boolean get() = false
  val screen: PyreonDeviceScreen get() = PyreonDeviceScreen(0.0, 0.0, 1.0)
}

// PyreonSafeArea / PyreonScreenOrientation + the app-supplied probes.
data class PyreonSafeAreaInsets(val top: Double, val right: Double, val bottom: Double, val left: Double) {
  companion object { val zero = PyreonSafeAreaInsets(0.0, 0.0, 0.0, 0.0) }
}
interface SafeAreaProbe { val insets: PyreonSafeAreaInsets }
class AndroidSafeAreaProbe(ctx: Any?) : SafeAreaProbe {
  override val insets: PyreonSafeAreaInsets = PyreonSafeAreaInsets.zero
}
class PyreonSafeArea(probe: SafeAreaProbe) {
  val insets: PyreonSafeAreaInsets get() = PyreonSafeAreaInsets.zero
}
interface OrientationProbe {
  val type: String
  val angle: Int
}
class AndroidOrientationProbe(ctx: Any?) : OrientationProbe {
  override val type: String = "portrait"
  override val angle: Int = 0
}
class PyreonScreenOrientation(probe: OrientationProbe) {
  val type: String get() = "portrait"
  val angle: Int get() = 0
}
// PyreonAudioPlayer + the app-supplied Media3 engine the emit names.
interface AudioEngine {
  fun load(url: String, loop: Boolean, muted: Boolean, volume: Double)
  fun play()
  fun pause()
  fun stop()
}
class Media3AudioEngine(ctx: Any?) : AudioEngine {
  override fun load(url: String, loop: Boolean, muted: Boolean, volume: Double) {}
  override fun play() {}
  override fun pause() {}
  override fun stop() {}
}
enum class PyreonAudioStatus(val value: String) {
  WAITING("waiting"), PLAYING("playing"), PAUSED("paused")
}
class PyreonAudioState(engine: AudioEngine) {
  val status: PyreonAudioStatus = PyreonAudioStatus.WAITING
  companion object { fun clampVolume(v: Double): Double = 0.0 }
  fun start(url: String, autoPlay: Boolean, loop: Boolean, muted: Boolean, volume: Double) {}
  fun play() {}
  fun pause() {}
  fun stop() {}
}
@Composable
fun PyreonAudioPlayer(
  url: String,
  autoPlay: Boolean = false,
  loop: Boolean = false,
  muted: Boolean = false,
  volume: Double = 1.0,
  engine: AudioEngine,
  onStatusChange: ((String) -> Unit)? = null,
  modifier: Modifier = Modifier,
) {}

// PyreonAudioRecorder + the app-supplied engine the emit names.
interface RecordingEngine {
  val isAvailable: Boolean
  fun begin(): Boolean
  fun end(): String?
  fun release()
}
class AndroidRecordingEngine(ctx: Any?) : RecordingEngine {
  override val isAvailable: Boolean = false
  override fun begin(): Boolean = false
  override fun end(): String? = null
  override fun release() {}
}
class PyreonAudioRecorder(engine: RecordingEngine) {
  val recording: MutableState<Boolean> = mutableStateOf(false)
  val error: MutableState<String> = mutableStateOf("")
  val supported: Boolean = false
  fun start(): Boolean = false
  fun stop(): String? = null
}

// PyreonCamera + the composition-side launcher helper the emit names.
class PyreonCamera {
  var launch: (() -> Unit)? = null
  var available: Boolean = true
  fun isAvailable(): Boolean = false
  suspend fun capture(): String? = null
  fun onResult(uri: String?) {}
}
@Composable
fun rememberCameraLauncher(onResult: (String?) -> Unit): () -> Unit = {}

// PyreonSpeech + the app-supplied synthesiser the emit names.
interface SpeechSynth {
  val isAvailable: Boolean
  fun speak(text: String)
  fun cancel()
}
class AndroidSpeechSynth(ctx: Any?) : SpeechSynth {
  override val isAvailable: Boolean = false
  override fun speak(text: String) {}
  override fun cancel() {}
}
class PyreonSpeech(synth: SpeechSynth) {
  val speaking: MutableState<Boolean> = mutableStateOf(false)
  val supported: Boolean = false
  fun speak(text: String): Boolean = false
  fun stop() {}
}

// PyreonDeviceMotion + the app-supplied sensor source the emit names.
data class PyreonVec3(val x: Double, val y: Double, val z: Double) {
  companion object { val zero = PyreonVec3(0.0, 0.0, 0.0) }
}
interface MotionSource {
  val isAvailable: Boolean
  fun begin(onSample: (PyreonVec3, PyreonVec3) -> Unit): Boolean
  fun end()
}
class AndroidMotionSource(ctx: Any?) : MotionSource {
  override val isAvailable: Boolean = false
  override fun begin(onSample: (PyreonVec3, PyreonVec3) -> Unit): Boolean = false
  override fun end() {}
}
class PyreonDeviceMotion(source: MotionSource) {
  val active: MutableState<Boolean> = mutableStateOf(false)
  val acceleration: MutableState<PyreonVec3> = mutableStateOf(PyreonVec3.zero)
  val rotation: MutableState<PyreonVec3> = mutableStateOf(PyreonVec3.zero)
  val supported: Boolean = false
  fun start(): Boolean = false
  fun stop() {}
}

class PyreonWakeLock(keeper: ScreenKeeper) {
  val active: MutableState<Boolean> = mutableStateOf(false)
  val supported: Boolean = false
  fun request(): Boolean = false
  fun release() {}
}
// Mirrors PyreonPermissions.kt's CompositionLocal. A bare \`usePermissions()\`
// reads the provider through this; a stub without it rejects a correct emit.
class ProvidableCompositionLocal<T>(val default: T) { val current: T get() = default }
fun <T> compositionLocalOf(f: () -> T): ProvidableCompositionLocal<T> = ProvidableCompositionLocal(f())
infix fun <T> ProvidableCompositionLocal<T>.provides(v: T): Pair<ProvidableCompositionLocal<T>, T> = Pair(this, v)
fun CompositionLocalProvider(vararg pairs: Pair<*, *>, content: @Composable () -> Unit) { content() }
interface PyreonScheduler {
  fun schedule(milliseconds: Int, work: () -> Unit): Int
  fun cancel(token: Int)
}
class PyreonTaskScheduler : PyreonScheduler {
  override fun schedule(milliseconds: Int, work: () -> Unit): Int = 0
  override fun cancel(token: Int) {}
}
class PyreonDebounced<A>(delayMs: Int, scheduler: PyreonScheduler, action: (A) -> Unit) {
  operator fun invoke(arg: A) {}
  fun cancel() {}
  fun flush() {}
}
class PyreonThrottled<A>(waitMs: Int, scheduler: PyreonScheduler, action: (A) -> Unit) {
  operator fun invoke(arg: A) {}
  fun cancel() {}
}
class PyreonPermissions(granted: Set<String> = emptySet()) {
  val granted: MutableState<Set<String>> = mutableStateOf(granted)
  fun can(key: String): Boolean {
    if (granted.value.contains(key)) return true
    return granted.value.any { it.endsWith(".*") && key.startsWith(it.dropLast(1)) }
  }
  fun cannot(key: String): Boolean = !can(key)
  fun not(key: String): Boolean = !can(key)
  fun all(vararg keys: String): Boolean = keys.all { can(it) }
  fun any(vararg keys: String): Boolean = keys.any { can(it) }
  operator fun invoke(key: String): Boolean = can(key)
  // The mutators the real runtime ships. Their absence rejected a correct
  // \`perms.grant("x")\` - a stub NARROWER than the runtime fails working code,
  // the inverse of the usual superset-stub masking failure.
  fun set(keys: Set<String>) {}
  fun grant(key: String) {}
  fun revoke(key: String) {}
}

// PyreonNetworkStatus — mirror of @pyreon/native-runtime-kotlin's
// PyreonNetworkStatus.kt surface the emit touches: the no-arg constructor
// plus the isOnline MutableState<Boolean> field, read as net.isOnline.value.
// useOnline() returns a web ACCESSOR read as net() — the emit lowers that
// call to this net.isOnline.value reactive-Bool read.
// Self-installing variant the useOnline emit references (mirrors
// PyreonNetworkStatusAndroid.kt's @Composable — no-arg, returns the
// container; the real one wires a ConnectivityManager callback).
@Composable
fun rememberPyreonNetworkStatus(): PyreonNetworkStatus = PyreonNetworkStatus()

class PyreonNetworkStatus(isOnline: Boolean = true) {
  val isOnline: MutableState<Boolean> = mutableStateOf(isOnline)
}

// PyreonAppState — mirror of @pyreon/native-runtime-kotlin's PyreonAppState.kt
// surface the emit touches: the no-arg constructor + the phase
// MutableState<String> field, read as state.phase.value. useAppState() returns
// a web ACCESSOR read as state() — the emit lowers that call to
// state.phase.value.
class PyreonAppState(phase: String = "active") {
  val phase: MutableState<String> = mutableStateOf(phase)
  val wasBackgrounded: MutableState<Boolean> = mutableStateOf(false)
}

// Self-installing variant the useAppState emit references (mirrors
// PyreonAppStateAndroid.kt's @Composable — the real one observes the
// hosting Activity's lifecycle).
@Composable
fun rememberPyreonAppState(): PyreonAppState = PyreonAppState()

// PyreonToast — mirror of runtime-kotlin's PyreonToast.kt surface the emit
// touches: the object singleton, \`toasts\` (a MutableState<List<Item>> the
// \`<Toaster/>\` forEach iterates, each item carrying \`message\`), and \`add\`.
data class PyreonToastItem(val id: String, val message: String, val type: String)
object PyreonToast {
  val toasts: MutableState<List<PyreonToastItem>> = mutableStateOf(emptyList())
  fun add(message: String, type: String = "info", durationMillis: Long? = null): String = ""
  fun dismiss(id: String) {}
  fun clear() {}
}
// PyreonA11y — mirror of runtime-kotlin's PyreonA11y.kt: the object with an
// \`announce(message, assertive)\` the imperative \`announce(...)\` call lowers to.
object PyreonA11y {
  fun announce(message: String, assertive: Boolean = false) {}
}

// PyreonCrashReporter — mirror of the runtime-kotlin surface the emit touches:
// lastCrash/hadCrash MutableState (read dot-value), recordError/breadcrumb/
// clear methods. The self-installing @Composable factory the emit references.
class PyreonCrashReporter {
  val lastCrash: MutableState<String> = mutableStateOf("")
  val hadCrash: MutableState<Boolean> = mutableStateOf(false)
  fun start() {}
  fun recordError(message: String) {}
  fun breadcrumb(message: String) {}
  fun clear() {}
}
@Composable
fun rememberPyreonCrashReporter(): PyreonCrashReporter = PyreonCrashReporter()

// PyreonStore — Gap 4 Strategy-B v1 marker interface for emitted
// per-store singleton classes. Real impl in @pyreon/native-runtime-
// kotlin's PyreonStore.kt. Empty by design — purely a documentation
// + future-polymorphic-helper anchor.
interface PyreonStore

// PyreonModelProtocol — Gap 4 state-tree v2 marker interface for
// emitted per-model singleton classes. Real impl in @pyreon/native-
// runtime-kotlin's PyreonModel.kt. Empty by design.
interface PyreonModelProtocol

// Phase 5 — native data/services hook containers. Mirror the surface the
// emit touches (no-arg / generic constructor + MutableState reactive fields
// + Bool getters + methods). Real impls in @pyreon/native-runtime-kotlin.
// GeolocationHandlers + BOTH start overloads mirror the real surface exactly.
// The stub previously omitted start() entirely, because Kotlin's only took a
// host closure the emit never called - so geo.start() failed to build on
// Android while compiling on iOS and web. Mirroring only the 0-arg overload
// would be a SUBSET stub, which manufactures failures for the closure form the
// same way an over-strict PyreonPermissions stub rejected correct code.
// NOTE: no backticks in this file's comments - it is a TS template literal.
class GeolocationHandlers(
  val onFix: (Double, Double, Double?) -> Unit,
  val onAuthorization: (Boolean) -> Unit,
  val onError: (Throwable) -> Unit,
)
class PyreonGeolocation {
  val latitude = mutableStateOf<Double?>(null)
  val longitude = mutableStateOf<Double?>(null)
  val accuracy = mutableStateOf<Double?>(null)
  val isAuthorized = mutableStateOf(false)
  val error = mutableStateOf<Throwable?>(null)
  val isTracking: Boolean get() = false
  fun update(latitude: Double, longitude: Double, accuracy: Double? = null) {}
  fun authorize(granted: Boolean) {}
  fun fail(failure: Throwable) {}
  fun start() {}
  fun start(register: (GeolocationHandlers) -> (() -> Unit)) {}
  fun stop() {}
}

// The Compose entry the emit lowers useGeolocation() to — self-installs the
// platform source on the real runtime; the stub just returns the container.
@Composable
fun rememberPyreonGeolocation(): PyreonGeolocation = PyreonGeolocation()

class PyreonWebSocket {
  val lastMessage = mutableStateOf<String?>(null)
  val messages = mutableStateOf<List<String>>(emptyList())
  val isConnected = mutableStateOf(false)
  val error = mutableStateOf<Throwable?>(null)
  val isOpen: Boolean get() = false
  fun send(text: String) {}
  fun close() {}
}

// Mirror of the REAL runtime surface: PyreonWebSocketOkHttp.kt declares
// connect(url) as a top-level EXTENSION (the core container stays
// dependency-free; the extension is the OkHttp default transport). The stub
// mirrors that exact shape — not a member — per the exact-surface rule.
fun PyreonWebSocket.connect(url: String) {}

class PyreonRecord(val id: String, val fields: Map<String, String> = emptyMap())
// Mirrors the REAL surface EXACTLY: the primary constructor REQUIRES a
// backend, and the Context factory is what the emit calls. There is
// deliberately no no-arg form — that was the shape whose in-memory backend
// silently lost every record on relaunch, and a stub carrying it would let the
// emit regress to it and still typecheck. (An 'internal' constructor does NOT
// achieve this: the stub and the emit compile as ONE unit, where 'internal' is
// freely accessible. Mirroring the real REQUIRED parameter is what actually
// rejects the regression — the general rule this file states four times over:
// a stub that is a superset of the real surface is itself a masking source.)
interface PyreonDatabaseBackend
@Suppress("FunctionName")
fun PyreonDatabase(context: Context): PyreonDatabase =
  PyreonDatabase(object : PyreonDatabaseBackend {})
class PyreonDatabase(backend: PyreonDatabaseBackend) {
  fun insert(collection: String, record: PyreonRecord) {}
  fun get(collection: String, id: String): PyreonRecord? = null
  fun all(collection: String): List<PyreonRecord> = emptyList()
  fun delete(collection: String, id: String): Boolean = true
  fun find(collection: String, field: String, value: String): List<PyreonRecord> = emptyList()
  fun count(collection: String): Int = 0
}

// PyreonSecureStorage — the secret store, mirrored key-first (the runtime's
// write(key, value); value-first was removed as a crossed-positional hazard).
interface PyreonSecureBackend
@Suppress("FunctionName")
fun PyreonSecureStorage(context: Context): PyreonSecureStorage =
  PyreonSecureStorage(object : PyreonSecureBackend {})
class PyreonSecureStorage(backend: PyreonSecureBackend) {
  fun write(key: String, value: String): Boolean = true
  fun read(key: String): String? = null
  fun remove(key: String): Boolean = true
  fun contains(key: String): Boolean = false
}

// PyreonFieldArray — dynamic form lists, mirrored exactly (items/length are
// properties; a paren-keeping emit must fail).
data class PyreonFieldArrayItem(val key: Int, val value: String)
class PyreonFieldArray(initial: List<String> = emptyList()) {
  val items: List<PyreonFieldArrayItem> = emptyList()
  val length: Int get() = 0
  fun append(value: String) {}
  fun prepend(value: String) {}
  fun insert(index: Int, value: String) {}
  fun remove(index: Int) {}
  fun update(index: Int, value: String) {}
  fun move(from: Int, to: Int) {}
  fun swap(indexA: Int, indexB: Int) {}
  fun replace(values: List<String>) {}
  fun values(): List<String> = emptyList()
}

class PyreonPushNotification(
  val title: String? = null,
  val body: String? = null,
  val data: Map<String, String> = emptyMap(),
)
class PyreonPushNotifications {
  val token = mutableStateOf<String?>(null)
  val lastNotification = mutableStateOf<PyreonPushNotification?>(null)
  val notifications = mutableStateOf<List<PyreonPushNotification>>(emptyList())
  val isAuthorized = mutableStateOf(false)
  val error = mutableStateOf<Throwable?>(null)
  val isRegistered: Boolean get() = false
  fun tokenReceived(token: String) {}
  fun authorize(granted: Boolean) {}
  fun fail(failure: Throwable) {}
  fun stop() {}
}

// Self-installing variant the usePush emit references (mirrors
// PyreonPushNotificationsAndroid.kt's @Composable — no-arg, returns the
// container; the real one registers the PYREON_PUSH_ACTION BroadcastReceiver
// delivery seam for the composable's lifetime).
@Composable
fun rememberPyreonPushNotifications(): PyreonPushNotifications = PyreonPushNotifications()

@Composable
fun PyreonVideoPlayer(
  url: String,
  autoPlay: Boolean = false,
  loop: Boolean = false,
  muted: Boolean = false,
  controls: Boolean = true,
  onStatusChange: ((String) -> Unit)? = null,
  modifier: Modifier = Modifier,
) {}

class PyreonProduct(val id: String, val displayName: String, val price: String)
class PyreonPayments {
  val products = mutableStateOf<List<PyreonProduct>>(emptyList())
  val ownedProductIds = mutableStateOf<Set<String>>(emptySet())
  val purchasing = mutableStateOf<String?>(null)
  val error = mutableStateOf<Throwable?>(null)
  fun owns(productId: String): Boolean = false
  fun purchase(productId: String) {}
  fun restore() {}
}

class PyreonMapMarker(
  val id: String,
  val latitude: Double,
  val longitude: Double,
  val title: String? = null,
)
class PyreonMapCamera(val latitude: Double, val longitude: Double, val zoom: Double)
class PyreonMapState {
  val camera = mutableStateOf(PyreonMapCamera(0.0, 0.0, 1.0))
  val markers = mutableStateOf<List<PyreonMapMarker>>(emptyList())
  val selectedMarkerId = mutableStateOf<String?>(null)
  val selectedMarker: PyreonMapMarker? get() = null
  fun setCamera(camera: PyreonMapCamera) {}
  fun moveTo(latitude: Double, longitude: Double, zoom: Double? = null) {}
  fun setMarkers(markers: List<PyreonMapMarker>) {}
  fun addMarker(marker: PyreonMapMarker) {}
  fun removeMarker(id: String) {}
  fun selectMarker(id: String?) {}
}

enum class PyreonAuthStatus { SIGNED_OUT, SIGNING_IN, SIGNED_IN, ERROR }
class PyreonAuth<User> {
  val status = mutableStateOf(PyreonAuthStatus.SIGNED_OUT)
  val user = mutableStateOf<User?>(null)
  val error = mutableStateOf<Throwable?>(null)
  val isAuthenticated: Boolean get() = false
  val isSigningIn: Boolean get() = false
  fun beginSignIn() {}
  fun signInSucceeded(user: User) {}
  fun signInFailed(failure: Throwable) {}
  fun signOut() {}
}
`

/**
 * The Compose canvas (+ the two runtime helpers the chart hosts call) for a
 * `@pyreon/charts/plot` host emit; validate.ts appends the REAL engine and
 * draw-list data classes next to this. Lives here so the stub-coverage
 * ratchet counts `PyreonChartCanvas` as covered. The signature mirrors
 * runtime-kotlin `PyreonChartCanvas.kt` exactly.
 */
export const KOTLIN_CHART_VIEW_STUBS = `
// ---- @pyreon/charts/plot hosts (chart-hosts.ts emit) ----
@Composable
@Suppress("UNUSED_PARAMETER")
fun PyreonChartCanvas(cmds: List<PyreonDrawCmd>, modifier: Modifier = Modifier) {}
fun pyreonChartMeasure(text: String, size: Double): Double = text.length * size * 0.6
`

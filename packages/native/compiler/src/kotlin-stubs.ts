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

// Text — style/color args added for Heading emit (P2.2). Defaults keep
// the bare Text(text = "...") call sites (from Text emit) valid.
@Composable
@Suppress("UNUSED_PARAMETER")
fun Text(text: String, style: TextStyle = TextStyle(), color: Color? = null, fontSize: TextUnit = TextUnit(0f), fontWeight: FontWeight? = null, fontStyle: FontStyle? = null, textAlign: TextAlign? = null, fontFamily: FontFamily? = null, modifier: Modifier = Modifier) {}

@Composable
fun Button(
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
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
) {
  // Type-check-only stub.
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

// Modifier — Compose's chainable layout/decorator API. Real Modifier
// is a marker interface with extension functions; the stub uses a
// concrete object so chains compose cleanly (e.g.
// Modifier.padding(8.dp).background(...)).
//
// The @Suppress("UNUSED_PARAMETER") sprinkled below keeps kotlinc
// from warning about unused stub params — they're load-bearing for
// the public type-check surface, not for the (no-op) runtime.

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
  @Suppress("UNUSED_PARAMETER")
  fun weight(weight: Float): Modifier = this
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
object MaterialTheme {
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
fun AsyncImage(model: Any?, contentDescription: String?, modifier: Modifier = Modifier) {}

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
class PyreonFetch<T> {
  val data: MutableState<T?> = mutableStateOf(null)
  val error: MutableState<Throwable?> = mutableStateOf(null)
  val isPending: MutableState<Boolean> = mutableStateOf(false)
  fun begin() {}
  fun resolve(value: T) {}
  fun reject(e: Throwable) {}
  fun refetch() {}
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

// M3.5: authenticate is a suspend fun — awaited inside pyreonAsyncScope.launch { }.
class PyreonBiometrics {
  suspend fun authenticate(reason: String): Boolean = false
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
}

class PyreonFilePicker {
  var launcher: ActivityResultLauncher<Array<String>>? = null
  fun onResult(uri: String?) {}
  suspend fun pick(): String? = null
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
  private val onSubmit: ((Map<String, String>) -> Unit)? = null,
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

// PyreonPermissions — mirror of @pyreon/native-runtime-kotlin's
// PyreonPermissions.kt surface the emit touches: callable shape
// (operator invoke), not / cannot / all / any. Added with the
// permissions contract fixture — before it, NO usePermissions shape
// was kotlinc-validated at all.
class PyreonPermissions(initial: Set<String>) {
  var granted: Set<String> = initial
    private set
  fun can(key: String): Boolean {
    if (granted.contains(key)) return true
    return granted.any { it.endsWith(".*") && key.startsWith(it.dropLast(1)) }
  }
  fun cannot(key: String): Boolean = !can(key)
  fun not(key: String): Boolean = !can(key)
  fun all(vararg keys: String): Boolean = keys.all { can(it) }
  fun any(vararg keys: String): Boolean = keys.any { can(it) }
  operator fun invoke(key: String): Boolean = can(key)
}

// PyreonNetworkStatus — mirror of @pyreon/native-runtime-kotlin's
// PyreonNetworkStatus.kt surface the emit touches: the no-arg constructor
// plus the isOnline MutableState<Boolean> field, read as net.isOnline.value.
// useOnline() returns a web ACCESSOR read as net() — the emit lowers that
// call to this net.isOnline.value reactive-Bool read.
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
}

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
  fun stop() {}
}

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
class PyreonDatabase {
  fun insert(collection: String, record: PyreonRecord) {}
  fun get(collection: String, id: String): PyreonRecord? = null
  fun all(collection: String): List<PyreonRecord> = emptyList()
  fun delete(collection: String, id: String): Boolean = true
  fun find(collection: String, field: String, value: String): List<PyreonRecord> = emptyList()
  fun count(collection: String): Int = 0
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

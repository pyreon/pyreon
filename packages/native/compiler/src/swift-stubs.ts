// Swift VALIDATION STUBS — the Swift-side sibling of `kotlin-stubs.ts`.
//
// WHY THIS EXISTS. The per-PR Swift gate runs `swiftc -parse` (syntax only),
// which structurally CANNOT catch a type error — a `[Any]` where `[Int]` was
// meant, or the exact class that shipped three CI incidents: a SwiftUI modifier
// whose generic constraint the emit violates (`.animation(_:value:)` requires
// the value be `Equatable`; a PMTC-emitted struct isn't). `validateSwiftTypecheck`
// closes that gap against the REAL SwiftUI SDK — but SwiftUI is an Apple framework,
// ABSENT on the Linux PR runner, so that gate SKIPS per-PR and only runs on macOS.
//
// These stubs let `swiftc -typecheck` run on a plain Linux runner with NO Apple
// SDK: the validate harness strips the emit's `import SwiftUI` / `import PyreonRuntime`
// / `import PyreonRouter` lines and compiles the emit together with this file as a
// single module (exactly how `validateKotlin` concatenates `KOTLIN_COMPOSE_STUBS`).
// `import Foundation` is kept / added — Foundation IS available on the open-source
// Linux toolchain, so `String.trimmingCharacters`, `CharacterSet`, `Codable`, etc.
// resolve for real.
//
// THE GENERIC CONSTRAINTS ARE LOAD-BEARING. `animation<V: Equatable>(_:value:)`
// mirrors SwiftUI's EXACT constraint — a loose `value: Any` would MASK the very
// bug class this gate exists to catch (see `.claude/rules/anti-patterns.md`
// "validation stub must mirror the real library's EXACT public surface, never a
// convenient superset — a superset stub is itself a masking source"). Any new
// modifier added here must carry the same constraint the real SwiftUI declares.
//
// SCOPE. This stub covers the 2 shipped example apps + ALL 37 compiler fixtures
// (canonical primitives, common SwiftUI modifiers, i18n/machine/permissions/link/
// webview, plus the router-hook surface — PyreonRouter / EnvironmentValues.pyreonRouter
// / useNavigate / useParams — and PyreonForm, added in M-gate.1d; the two SMALL
// @Observable fixtures tier2-store / tier2-state-tree, added in M-gate.1e via the
// PyreonStoreProtocol / PyreonModelProtocol marker protocols below + the
// `import Observation` guarantee `validateSwiftWithStubs` adds when the emit uses
// `@Observable`). M-gate.1f closed the last two — the LARGE @Observable showcase
// apps (showcase-finance / showcase-tasks) — by adding the service tier
// (PyreonAuth / PyreonDatabase / PyreonFetch / RouterProvider / matchPath /
// LazyVStack / Color / Font.custom / .foregroundColor / .task /
// navigationDestination). Finishing them DID surface a real emit bug, as
// suspected: useDatabase's get / delete / find emitted Swift without the
// argument labels the runtime declares.
//
// When adding a symbol: keep ARGUMENT types faithful (a wrong-typed arg must still
// be caught), and mirror any LOAD-BEARING generic constraint exactly (like
// `animation<V: Equatable>`) — a pure pass-through modifier that carries no
// constraint may return `some View` freely.

export const SWIFT_UI_STUBS = `// AUTO-CONCATENATED Swift validation stubs (see swift-stubs.ts). Not shipped.
import Foundation // real on the Linux toolchain — provides URL / Codable / etc. for the stub's own references

// ---- UIKit (the sliver app-provided sources touch) ----
// NOT available on Linux OR on macOS swiftc — UIKit is an iOS-SDK framework, so
// neither host that runs this gate can resolve it. An example app's
// \`useNativeModule\` class (the FFI escape hatch) is compiled alongside the emit
// here, and such classes reach for real platform APIs, so the minimal surface
// they touch is mirrored. Faithful, not convenient: \`current\` is a static on the
// class and \`systemName\` a String property, exactly as UIKit declares them — a
// looser \`Any\`-typed stand-in would mask a wrong member name.
final class UIDevice {
  static let current = UIDevice()
  var systemName: String { "iOS" }
}

// ---- View protocol + result builder ----
// @ViewBuilder on the requirement lets a component body be a bare \`if\` /
// \`if/else\` (transformed via buildOptional/buildEither), not just a single root
// container. Never-bodied primitives get \`body\` from the extension below (the real
// SwiftUI shape: \`typealias Body = Never\`, no explicit body — so the builder never
// tries to transform a \`fatalError()\` into AnyStubView).
public protocol View { associatedtype Body: View; @ViewBuilder var body: Self.Body { get } }
extension View where Body == Never { public var body: Never { fatalError() } }
extension Never: View { public typealias Body = Never }
public struct EmptyView: View { public init() {}; public typealias Body = Never }
public struct AnyStubView: View { public init() {}; public typealias Body = Never }

@resultBuilder public enum ViewBuilder {
  // buildExpression erases every leaf to AnyStubView while ENFORCING each child
  // is a View (the \`C: View\` constraint is the load-bearing check). All
  // combinators then operate on the erased type — no generic-inference ambiguity
  // for if/else (buildEither) or bare-if (buildOptional).
  public static func buildExpression<C: View>(_ e: C) -> AnyStubView { AnyStubView() }
  public static func buildBlock(_ parts: AnyStubView...) -> AnyStubView { AnyStubView() }
  public static func buildOptional(_ part: AnyStubView?) -> AnyStubView { AnyStubView() }
  public static func buildEither(first: AnyStubView) -> AnyStubView { AnyStubView() }
  public static func buildEither(second: AnyStubView) -> AnyStubView { AnyStubView() }
}

// ---- Environment / enums ----
public enum ColorScheme { case light, dark }
public enum UserInterfaceSizeClass { case compact, regular }
public struct EnvironmentValues {
  public var colorScheme: ColorScheme = .light
  public var horizontalSizeClass: UserInterfaceSizeClass? = nil
}
@propertyWrapper public struct Environment<Value> {
  public init(_ keyPath: KeyPath<EnvironmentValues, Value>) {}
  public var wrappedValue: Value { fatalError() }
}

// ---- State / Binding ----
@propertyWrapper public struct State<Value> {
  public init(wrappedValue: Value) {}
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
  public var projectedValue: Binding<Value> { fatalError() }
}
@propertyWrapper public struct Binding<Value> {
  public init(get: @escaping () -> Value, set: @escaping (Value) -> Void) {}
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
  public var projectedValue: Binding<Value> { self }
}

// ---- Layout containers ----
public enum HorizontalAlignment { case leading, center, trailing }
public enum VerticalAlignment { case top, center, bottom }
public enum Alignment { case center, leading, trailing, top, bottom }
// Axis.Set is an OptionSet in real SwiftUI; the stub only needs the horizontal
// / vertical cases the coolgrid Col fractional-span emit references.
public struct Axis { public struct Set { public init() {}; public static let horizontal = Set(); public static let vertical = Set() } }
public struct VStack<Content: View>: View {
  public init(alignment: HorizontalAlignment = .center, spacing: Double? = nil, @ViewBuilder content: () -> Content) {}
  public typealias Body = Never
}
public struct HStack<Content: View>: View {
  public init(alignment: VerticalAlignment = .center, spacing: Double? = nil, @ViewBuilder content: () -> Content) {}
  public typealias Body = Never
}
public struct ZStack<Content: View>: View {
  public init(alignment: Alignment = .center, @ViewBuilder content: () -> Content) {}
  public typealias Body = Never
}
public struct Group<Content: View>: View {
  public init(@ViewBuilder content: () -> Content) {}
  public typealias Body = Never
}

// ---- Controls ----
// Both initialisers, because the emit picks between them deliberately:
// \`init(_:)\` for a pure literal (SwiftUI's LocalizedStringKey overload, which
// keeps .strings-table lookup) and \`init(verbatim:)\` for interpolated content
// (a plain String — no locale number formatting). A stub with only one of them
// would fail the emit that uses the other.
public struct Text: View {
  public init(_ s: String) {}
  public init(verbatim: String) {}
  public typealias Body = Never
}
public struct Button<Label: View>: View {
  public init(action: @escaping () -> Void, @ViewBuilder label: () -> Label) {}
  public typealias Body = Never
}
extension Button where Label == Text {
  public init(_ title: String, action: @escaping () -> Void) {}
}
public struct Toggle<Label: View>: View {
  public init(_ title: String, isOn: Binding<Bool>) where Label == Text {}
  public typealias Body = Never
}
public struct TextField: View {
  public init(_ title: String, text: Binding<String>) {}
  public typealias Body = Never
}
public struct ForEach<Data, ID, Content: View>: View {
  public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder content: @escaping (Data.Element) -> Content) where Data: RandomAccessCollection {}
  public typealias Body = Never
}

// ---- Animation / transition / gestures ----
public struct Animation {
  public static let \`default\` = Animation()
  // The four timing-function factories <Transition duration/easing> lowers
  // to — mirrored from real SwiftUI (each takes a labelled duration:).
  public static func linear(duration: Double) -> Animation { Animation() }
  public static func easeIn(duration: Double) -> Animation { Animation() }
  public static func easeOut(duration: Double) -> Animation { Animation() }
  public static func easeInOut(duration: Double) -> Animation { Animation() }
}
public struct AnyTransition { public static let opacity = AnyTransition() }
public protocol Gesture {}
public struct LongPressGesture: Gesture {
  public init(minimumDuration: Double = 0.5) {}
  public func onEnded(_ action: @escaping (Bool) -> Void) -> LongPressGesture { self }
}
public struct PrimitiveButtonStyleStub { public static let plain = PrimitiveButtonStyleStub() }
public enum AccessibilityChildBehavior { case contain, combine, ignore }

// ---- View modifiers ----
extension View {
  // CRUX — the EXACT SwiftUI generic constraint. \`value: Any\` would MASK the
  // \`.animation(_:value:)\`-needs-Equatable class (the M2.8 incident). Do not loosen.
  public func animation<V: Equatable>(_ animation: Animation?, value: V) -> some View { self }
  public func transition(_ t: AnyTransition) -> some View { self }
  public func buttonStyle(_ style: PrimitiveButtonStyleStub) -> some View { self }
  public func accessibilityIdentifier(_ id: String) -> some View { self }
  public func accessibilityLabel(_ label: String) -> some View { self }
  public func accessibilityElement(children: AccessibilityChildBehavior) -> some View { self }
  public func simultaneousGesture<G: Gesture>(_ gesture: G) -> some View { self }
  public func onSubmit(_ action: @escaping () -> Void) -> some View { self }
  public func font(_ font: Font?) -> some View { self }
  public func opacity(_ opacity: Double) -> some View { self }
  public func padding() -> some View { self }
  public func padding(_ length: Double) -> some View { self }
  public func sheet<C: View>(isPresented: Binding<Bool>, @ViewBuilder content: () -> C) -> some View { self }
  public func disabled(_ disabled: Bool) -> some View { self }
  // navigationDestination(for:destination:) — the multi-screen router emit's
  // push target. \`D: Hashable\` mirrors SwiftUI's real constraint (route values
  // must be Hashable to key the navigation path); a loose \`D\` would let an
  // emit push a non-Hashable route value and still typecheck.
  public func navigationDestination<D: Hashable, C: View>(
    for data: D.Type,
    @ViewBuilder destination: @escaping (D) -> C
  ) -> some View { self }
  // Pure pass-through modifiers (no load-bearing constraint — they carry faithful
  // ARGUMENT types so a wrong-typed arg is still caught, but always return some View).
  public func bold() -> some View { self }
  public func frame(width: Double? = nil, height: Double? = nil) -> some View { self }
  public func frame(
    minWidth: Double? = nil,
    idealWidth: Double? = nil,
    maxWidth: Double? = nil,
    minHeight: Double? = nil,
    idealHeight: Double? = nil,
    maxHeight: Double? = nil
  ) -> some View { self }
  // iOS 17 grid-column primitive: the coolgrid Col fractional span.
  public func containerRelativeFrame(_ axes: Axis.Set, count: Int, span: Int, spacing: Double, alignment: Alignment = .center) -> some View { self }
  public func resizable() -> some View { self }
  public func imageScale(_ scale: ImageScale) -> some View { self }
  // foregroundColor + .task — the showcase-app tier. \`.task\` is the mount-time
  // async hook a useFetch-bearing component's emit attaches (to a stable ZStack
  // host, per the device-found SwiftUI identity rule); its closure is async, so
  // an emit that forgets \`await\` inside it fails here rather than on-device.
  public func foregroundColor(_ color: Color?) -> some View { self }
  public func task(priority: TaskPriority = .userInitiated, _ action: @escaping () async -> Void) -> some View { self }
  public func allowsHitTesting(_ enabled: Bool) -> some View { self }
  public func scaledToFit() -> some View { self }
  // scaledToFill was MISSING while its sibling scaledToFit was present, so the
  // gate rejected the DEFAULT <Image> emit. ImageProps.fit defaults to "cover",
  // which lowers to .scaledToFill(), meaning every plain <Image src alt /> --
  // the most common usage of a canonical primitive -- failed the required Swift
  // gate on valid SwiftUI. Only fit="contain" (scaledToFit) and fit="none" (no
  // modifier) got through. Same SUBSET-stub defect as PyreonI18n above, found
  // the same way: Kotlin accepted the identical source.
  public func scaledToFill() -> some View { self }
  public func onAppear(_ action: (() -> Void)? = nil) -> some View { self }
}
public enum ImageScale { case small, medium, large }

// ---- PyreonRuntime ----
public struct PyreonHaptics { public init() {}; public func impact(_ style: String) {} }
// PyreonWebSocket + PyreonGeolocation — both were emit-referenced with NO
// Swift stub, so a useWebSocket / useGeolocation app could not be type-checked
// at all. Mirrored from the real runtime surfaces: every reactive field is
// private(set) there, and the URL-taking connect uses the 'to:' label.
// Only the members the EMIT can produce are declared — a stub is a mirror of
// what is used, never a convenience superset.
public struct PyreonMapCamera: Sendable, Equatable {
  public let latitude: Double
  public let longitude: Double
  public let zoom: Double
  public init(latitude: Double, longitude: Double, zoom: Double) {
    self.latitude = latitude; self.longitude = longitude; self.zoom = zoom
  }
}
public struct PyreonMapMarker: Sendable, Equatable {
  public let id: String
  public let latitude: Double
  public let longitude: Double
  public let title: String?
  public init(id: String, latitude: Double, longitude: Double, title: String? = nil) {
    self.id = id; self.latitude = latitude; self.longitude = longitude; self.title = title
  }
}
public final class PyreonMapState {
  public private(set) var camera: PyreonMapCamera
  public private(set) var markers: [PyreonMapMarker]
  public private(set) var selectedMarkerId: String?
  public init(
    camera: PyreonMapCamera = PyreonMapCamera(latitude: 0, longitude: 0, zoom: 1),
    markers: [PyreonMapMarker] = []
  ) {
    self.camera = camera; self.markers = markers
  }
  public var selectedMarker: PyreonMapMarker? { nil }
  public func setCamera(_ camera: PyreonMapCamera) {}
  public func moveTo(latitude: Double, longitude: Double, zoom: Double? = nil) {}
  public func setMarkers(_ markers: [PyreonMapMarker]) {}
  public func addMarker(_ marker: PyreonMapMarker) {}
  public func removeMarker(id: String) {}
  public func selectMarker(_ id: String?) {}
}
public struct PyreonProduct: Sendable, Equatable {
  public let id: String
  public let displayName: String
  public let price: String
  public init(id: String, displayName: String, price: String) {
    self.id = id; self.displayName = displayName; self.price = price
  }
}
public final class PyreonPayments {
  public private(set) var products: [PyreonProduct] = []
  public private(set) var ownedProductIds: Set<String> = []
  public private(set) var purchasing: String?
  public private(set) var error: Error?
  public init() {}
  public func owns(_ productId: String) -> Bool { false }
  public func purchase(_ productId: String) {}
  public func restore() {}
}
public struct PyreonPushNotification: Sendable, Equatable {
  public let title: String?
  public let body: String?
  public let data: [String: String]
  public init(title: String? = nil, body: String? = nil, data: [String: String] = [:]) {
    self.title = title; self.body = body; self.data = data
  }
}
public final class PyreonPushNotifications {
  public private(set) var token: String?
  public private(set) var lastNotification: PyreonPushNotification?
  public private(set) var notifications: [PyreonPushNotification] = []
  public private(set) var isAuthorized: Bool = false
  public private(set) var error: Error?
  public init() {}
  public var isRegistered: Bool { false }
  public func stop() {}
}
public final class PyreonWebSocket {
  public private(set) var lastMessage: String?
  public private(set) var messages: [String] = []
  public private(set) var isConnected: Bool = false
  public private(set) var error: Error?
  public var isOpen: Bool { false }
  public init() {}
  public func connect(to url: URL) {}
  public func send(_ text: String) {}
  public func close() {}
}
public final class PyreonGeolocation {
  public private(set) var latitude: Double?
  public private(set) var longitude: Double?
  public private(set) var accuracy: Double?
  public private(set) var isAuthorized: Bool = false
  public private(set) var error: Error?
  public var isTracking: Bool { false }
  public init() {}
  public func start() {}
  public func stop() {}
}
public final class PyreonClipboard {
  public private(set) var copied: Bool = false
  public init() {}
  public func copy(_ text: String) {}
  public func reset() {}
}
public struct PyreonShare { public init() {}; public func url(_ u: String) {} }
public struct PyreonLinking { public init() {}; public func openUrl(_ u: String) {} }
public struct PyreonNotifications { public init() {}; public func notify(_ title: String, _ body: String) {} }
// M3.5: authenticate is ASYNC — awaited inside a Task { … } (the M4.5 lowering).
public struct PyreonBiometrics { public init() {}; public func authenticate(_ reason: String) async -> Bool { false } }
// M3.4 photo picker. Mirrors PyreonImagePicker.swift's surface EXACTLY: pick()
// is async and returns an OPTIONAL String (nil = cancelled), so an emit that
// forgot the optionality (e.g. comparing the result to a bare String) fails
// here rather than on the device gate.
public struct PyreonImagePicker { public init() {}; public func pick() async -> String? { nil }; public func isAvailable() -> Bool { true } }
// M3.8 document picker. Same async optional-String surface as the image picker
// (nil = cancelled) — an emit that drops the optionality fails here.
public struct PyreonFilePicker { public init() {}; public func pick() async -> String? { nil }; public func isAvailable() -> Bool { true } }
// Marker protocols the @Observable store/model emit conforms to — mirror
// runtime-swift's PyreonStore.swift / PyreonModel.swift EXACTLY (empty,
// AnyObject-bound so a final class can conform). The @Observable macro (from the
// Observation module, guaranteed imported by validateSwiftWithStubs when the
// emit uses it) drives runtime reactivity; these only satisfy conformance.
public protocol PyreonStoreProtocol: AnyObject {}
public protocol PyreonModelProtocol: AnyObject {}
public struct PyreonMachine {
  public init(initial: String, transitions: [String: [String: String]]) {}
  public func callAsFunction() -> String { "" }
  public func send(_ event: String) {}
  public func matches(_ state: String) -> Bool { false }
}
public struct PyreonI18n {
  // fallbackLocale is OPTIONAL and DEFAULTED in the real PyreonI18n. The stub
  // made it required, so \`createI18n({ locale, messages })\` — the two-argument
  // form the docs show and the common case — was REJECTED by the gate with
  // "missing argument for parameter 'fallbackLocale'". Valid source, failing
  // build. Same class as the coolgrid frame stub: a SUBSET stub manufactures
  // failures exactly as a SUPERSET stub masks them, and the fix is the same —
  // mirror the real signature, do not guess at it.
  public init(
    locale: String,
    messages: [String: [String: String]],
    fallbackLocale: String? = nil
  ) {}
  // t(key) OR t(key, interpolation values) — the emit passes [String: Any]-shaped
  // dictionary literals ([String: String] and [String: Int] both coerce).
  public func t(_ key: String, _ values: [String: Any] = [:]) -> String { "" }
}
// AppStorage - SwiftUI's own wrapper, which \`useStorage\` emits for SCALAR
// values (a struct value routes to PyreonAppStorage below instead). Stripped
// along with \`import SwiftUI\`, so without this the whole scalar path was
// UNGATED. Mirrors SwiftUI's REAL constrained overloads rather than a loose
// generic: a permissive \`<Value>\` would MASK an emit that ever sent an
// unsupported type to @AppStorage, which is exactly what the gate is for.
@propertyWrapper public struct AppStorage<Value> {
  private let _key: String
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
}
extension AppStorage where Value == String {
  public init(wrappedValue: Value, _ key: String) { self._key = key }
}
extension AppStorage where Value == Int {
  public init(wrappedValue: Value, _ key: String) { self._key = key }
}
extension AppStorage where Value == Double {
  public init(wrappedValue: Value, _ key: String) { self._key = key }
}
extension AppStorage where Value == Bool {
  public init(wrappedValue: Value, _ key: String) { self._key = key }
}
@propertyWrapper public struct PyreonAppStorage<Value> {
  public init(wrappedValue: Value, _ key: String) {}
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
}
// PyreonPermissions - MIRRORS the real init exactly:
// \`public init(_ granted: Set<String> = [])\`. The stub previously declared
// \`init(_ grants: [String])\` - no default, and an Array where the real type
// takes a Set - so it REJECTED the emit's correct \`PyreonPermissions()\`.
// That is the inverse of the usual masking failure: a stub STRICTER than
// reality fails correct code. Latent only because no fixture used the hook.
public struct PyreonPermissions {
  public init(_ granted: Set<String> = []) {}
  public func callAsFunction(_ perm: String) -> Bool { false } // used as \`can("x")\`
  public func all(_ perms: String...) -> Bool { false }
  public func any(_ perms: String...) -> Bool { false }
  public func not(_ perm: String) -> Bool { false }
}
// PyreonNetworkStatus — mirror of @pyreon/native-runtime-swift's
// PyreonNetworkStatus.swift surface the emit touches: the no-arg constructor
// plus the isOnline Bool read (bare, since the real type is @Observable).
// The @Observable macro drives runtime reactivity, NOT the type-level compile,
// so a plain class type-checks an @State PyreonNetworkStatus + net.isOnline
// identically. useOnline() returns a web ACCESSOR read as net() — the emit
// lowers that call to this net.isOnline Bool read.
public final class PyreonNetworkStatus {
  public private(set) var isOnline: Bool
  public init(isOnline: Bool = true) { self.isOnline = isOnline }
}
// PyreonAppState — mirror of @pyreon/native-runtime-swift's PyreonAppState.swift
// surface the emit touches: the no-arg constructor + the phase String read
// (bare, since the real type is @Observable — the macro drives runtime
// reactivity, not the type-level compile). useAppState() returns a web
// ACCESSOR read as state(); the emit lowers that call to state.phase.
public final class PyreonAppState {
  public private(set) var phase: String
  public init(phase: String = "active") { self.phase = phase }
}
public struct PyreonLink<Label: View>: View {
  public init(_ to: String, @ViewBuilder label: () -> Label) {}
  public typealias Body = Never
}
public enum PyreonJSON { public static func encode<T>(_ value: T) -> String { "" } }
public struct PyreonWebView: View {
  // Emit shapes: (src:data:onMessage:), (html:), (html:data:onMessage:) — all
  // params optional so every shape resolves; arg TYPES stay faithful.
  public init(src: String? = nil, html: String? = nil, data: String? = nil, onMessage: ((String) -> Void)? = nil) {}
  public typealias Body = Never
}

// ---- PyreonForm (@pyreon/form -> runtime-swift's PyreonForm, a final class) ----
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
  public private(set) var errors: [String: String] = [:]
  public private(set) var isSubmitting: Bool = false
  public var onSubmit: (([String: String]) -> Void)?
  public func binding(_ name: String) -> Binding<String> { Binding(get: { "" }, set: { _ in }) }
  public func submit() {}
}

// ---- PyreonRouter (the router-swift module surface the emit imports) ----
// router-hooks emit: @Environment(\\.pyreonRouter) var pyreonRouter: PyreonRouter?
// + useNavigate(router:) -> (String) -> Void + useParams(router:) ->
// [String: String]. Signatures mirror packages/native/router-swift exactly.
public final class PyreonRouter {
  public init() {}
  // Static pattern matcher the multi-screen emit calls to resolve a pushed
  // path. Returns the captured params, or nil when the pattern does not match —
  // keeping the OPTIONAL return is load-bearing: an emit that forgets to unwrap
  // it must fail here, not silently on-device.
  public static func matchPath(_ path: String, _ pattern: String) -> [String: String]? { nil }
}
extension EnvironmentValues {
  public var pyreonRouter: PyreonRouter? { get { nil } set {} }
}
public func useNavigate(router: PyreonRouter?) -> (String) -> Void { { _ in } }
public func useParams(router: PyreonRouter?) -> [String: String] { [:] }
// THIRD subset-stub instance. router-swift's Hooks.swift declares three public
// hooks; the stub had two, so \`const d = useLoaderData<U>()\` — a shipped
// Phase-B6 feature — failed the required gate with "cannot find 'useLoaderData'
// in scope" on a perfectly valid emit. Kotlin passed, the same diagnostic that
// found the other two. The parity test below now enforces the whole SET rather
// than waiting for a fourth to be discovered by hand.
public func useLoaderData<T>(router: PyreonRouter?) -> T? { nil }
// RouterProvider — the multi-screen root the showcase apps emit. Mirrors
// router-swift: generic over its content, @ViewBuilder, escaping closure.
public struct RouterProvider<Content: View>: View {
  public init(router: PyreonRouter, @ViewBuilder content: @escaping () -> Content) {}
  public typealias Body = Never
}

// ---- Auth + database service surface (the showcase-app tier) ----
// Mirrors runtime-swift EXACTLY. \`status\` / \`user\` / \`error\` are
// private(set) there, so the stub keeps them read-only from the emit's side —
// a settable stub would let a bad emit assign them and typecheck anyway.
public enum PyreonAuthStatus: Sendable {
  case signedOut, signingIn, signedIn, error
}
// NOT annotated \`@Observable\`, deliberately. The real runtime class is, but the
// attribute is a REACTIVITY concern, not part of the type surface an emit is
// checked against — nothing about it can mask a bad emit. Putting it here would
// force the harness to add \`import Observation\` UNCONDITIONALLY: the guarantee
// is currently driven by whether the EMIT uses @Observable, so a stub-only
// occurrence goes unimported and fails on Linux ("unknown attribute
// 'Observable'") for every emit that does not itself use it. macOS hides that —
// Observation is implicit there — so this only ever reds the Linux PR gate.
public final class PyreonAuth<User> {
  public private(set) var status: PyreonAuthStatus = .signedOut
  public private(set) var user: User?
  public private(set) var error: Error?
  public init(status: PyreonAuthStatus = .signedOut, user: User? = nil) {}
  public var isAuthenticated: Bool { status == .signedIn }
  public var isSigningIn: Bool { status == .signingIn }
  public func beginSignIn() {}
  public func signInSucceeded(_ user: User) {}
  public func signInFailed(_ failure: Error) {}
  public func signOut() {}
}
// PyreonRecord's field bag is [String: String] in runtime-swift — keeping that
// exact type is what makes a record-construction emit bug visible here.
public struct PyreonRecord {
  public let id: String
  public let fields: [String: String]
  public init(id: String, fields: [String: String] = [:]) { self.id = id; self.fields = fields }
}
// PyreonFetch — the data container a \`useFetch\` decl emits.
// \`data\` / \`error\` / \`isPending\` are private(set) in runtime-swift; keeping
// that here means an emit that tries to ASSIGN one fails, as it should (the
// container is driven through begin/resolve/reject/load/refetch).
// No \`@Observable\` here either — same reason as PyreonAuth above.
public final class PyreonFetch<T> {
  public private(set) var data: T?
  public private(set) var error: Error?
  public private(set) var isPending: Bool = false
  public init() {}
  public func begin() {}
  public func resolve(_ value: T) {}
  public func reject(_ failure: Error) {}
  public func load(_ fetcher: @escaping () throws -> T) {}
  public func refetch() {}
}
public final class PyreonDatabase {
  public init() {}
  public func insert(_ collection: String, _ record: PyreonRecord) {}
  public func get(_ collection: String, id: String) -> PyreonRecord? { nil }
  public func all(_ collection: String) -> [PyreonRecord] { [] }
  @discardableResult public func delete(_ collection: String, id: String) -> Bool { false }
  public func find(_ collection: String, field: String, equals value: String) -> [PyreonRecord] { [] }
  public func count(_ collection: String) -> Int { 0 }
}
// PyreonSecureStorage — the secret store. Mirrors runtime-swift EXACTLY:
// key-first labelled write (write(key:value:)); a value-first or positional
// emit must FAIL here, because with two String parameters a crossed call
// would otherwise compile and silently store the secret under the wrong key.
public final class PyreonSecureStorage {
  public init() {}
  @discardableResult public func write(key: String, value: String) -> Bool { false }
  public func read(key: String) -> String? { nil }
  @discardableResult public func remove(key: String) -> Bool { false }
  public func contains(key: String) -> Bool { false }
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

// ---- Additional SwiftUI surface (fonts / images / scroll / spacing) ----
public struct Font {
  public static let largeTitle = Font(), title = Font(), title2 = Font(), title3 = Font()
  public static let headline = Font(), subheadline = Font(), body = Font(), callout = Font()
  public static let footnote = Font(), caption = Font(), caption2 = Font()
  // Custom (bundled) font — what a \`<Text font="Brand">\` lowers to. Keeping the
  // size: label (rather than an argument-less overload) is what catches an emit
  // that drops or misnames it. Double mirrors the sibling VStack stub; the real
  // signature says CGFloat, which is the same type on 64-bit and is not
  // reliably resolvable on the Linux toolchain this gate runs on.
  public static func custom(_ name: String, size: Double) -> Font { Font() }
}
// Color — theme-token colors lower to the component initialiser, so the
// Double-channel init is the load-bearing one (a token emitted with the wrong
// argument labels must fail here). \`opacity\` defaults, as in SwiftUI.
// \`Color: View\` in real SwiftUI, and the conformance is load-bearing here, not
// cosmetic: it is what gives \`Color\` the whole \`View\` modifier surface. The
// stub declared a bare struct, so \`Color.clear.frame(width: 0, height: 0)\` — the
// Modal sheet ANCHOR — failed with "value of type 'Color' has no member 'frame'"
// even though the real toolchain compiles it (the device build proved it). That
// is the subset-stub failure mode: a stub NARROWER than the real API
// manufactures failures on valid source, the mirror image of a superset stub
// masking real breakage.
public struct Color: View {
  // RGBColorSpace + the colour-space-first initialiser: the style/token lowering
  // emits \`Color(.sRGB, red:green:blue:opacity:)\`, which is a DIFFERENT
  // initialiser from the bare \`Color(red:…)\` below. Both are real SwiftUI, and
  // the stub needs both or the emit fails with "extra argument in call".
  public enum RGBColorSpace { case sRGB, sRGBLinear, displayP3 }
  public init(
    _ colorSpace: RGBColorSpace = .sRGB,
    red: Double,
    green: Double,
    blue: Double,
    opacity: Double = 1
  ) {}
  public init(red: Double, green: Double, blue: Double, opacity: Double = 1) {}
  public static let black = Color(red: 0, green: 0, blue: 0)
  public static let white = Color(red: 1, green: 1, blue: 1)
  public static let clear = Color(red: 0, green: 0, blue: 0, opacity: 0)
  public static let primary = Color(red: 0, green: 0, blue: 0)
  public static let secondary = Color(red: 0.5, green: 0.5, blue: 0.5)
}
// TaskPriority — only the cases \`.task(priority:)\` call sites can name.
public struct TaskPriority {
  public static let userInitiated = TaskPriority(), high = TaskPriority()
  public static let medium = TaskPriority(), low = TaskPriority(), background = TaskPriority()
}
// LazyVStack — the lazily-materialising column a <Scroll>-wrapped <For>
// lowers to. Mirrors SwiftUI: optional alignment + spacing, @ViewBuilder body.
public struct LazyVStack<Content: View>: View {
  public init(
    alignment: HorizontalAlignment = .center,
    spacing: Double? = nil,
    @ViewBuilder content: () -> Content
  ) {}
  public typealias Body = Never
}
public struct Spacer: View { public init(minLength: Double? = nil) {}; public typealias Body = Never }
public struct ScrollView<Content: View>: View {
  public init(@ViewBuilder content: () -> Content) {}
  public typealias Body = Never
}
public struct Image: View {
  public init(_ name: String) {}
  public init(systemName: String) {}
  public typealias Body = Never
}
public struct AsyncImage: View {
  public init(url: URL?) {}
  public typealias Body = Never
}
`

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
// SCOPE. This stub covers the 2 shipped example apps + 27 of 37 compiler fixtures
// (canonical primitives, common SwiftUI modifiers, i18n/machine/permissions/link/
// webview). NOT yet covered (tracked follow-ups): the service-runtime + @Observable
// surface (PyreonRouter / RouterProvider / useNavigate / useParams /
// PyreonStoreProtocol / PyreonModelProtocol / PyreonForm / PyreonAuth /
// PyreonDatabase / PyreonFetch — and the `@Observable` macro, which a struct stub
// can't fake), and the fixtures the gate SURFACED as real emit bugs (rx-full
// optional-unwrap, rx-lowering/tier2-machine `body { nil }`, tier2-rx unsynthesized
// interface) — those are excluded in validate-swift-typecheck.test.ts with rationale.
//
// When adding a symbol: keep ARGUMENT types faithful (a wrong-typed arg must still
// be caught), and mirror any LOAD-BEARING generic constraint exactly (like
// `animation<V: Equatable>`) — a pure pass-through modifier that carries no
// constraint may return `some View` freely.

export const SWIFT_UI_STUBS = `// AUTO-CONCATENATED Swift validation stubs (see swift-stubs.ts). Not shipped.
import Foundation // real on the Linux toolchain — provides URL / Codable / etc. for the stub's own references

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
public struct Text: View { public init(_ s: String) {}; public typealias Body = Never }
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
public struct Animation { public static let \`default\` = Animation() }
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
  // Pure pass-through modifiers (no load-bearing constraint — they carry faithful
  // ARGUMENT types so a wrong-typed arg is still caught, but always return some View).
  public func bold() -> some View { self }
  public func frame(width: Double? = nil, height: Double? = nil) -> some View { self }
  public func resizable() -> some View { self }
  public func imageScale(_ scale: ImageScale) -> some View { self }
  public func allowsHitTesting(_ enabled: Bool) -> some View { self }
  public func scaledToFit() -> some View { self }
  public func onAppear(_ action: (() -> Void)? = nil) -> some View { self }
}
public enum ImageScale { case small, medium, large }

// ---- PyreonRuntime ----
public struct PyreonHaptics { public init() {}; public func impact(_ style: String) {} }
public struct PyreonShare { public init() {}; public func url(_ u: String) {} }
public struct PyreonLinking { public init() {}; public func openUrl(_ u: String) {} }
public struct PyreonNotifications { public init() {}; public func notify(_ title: String, _ body: String) {} }
public struct PyreonMachine {
  public init(initial: String, transitions: [String: [String: String]]) {}
  public func callAsFunction() -> String { "" }
  public func send(_ event: String) {}
  public func matches(_ state: String) -> Bool { false }
}
public struct PyreonI18n {
  public init(locale: String, messages: [String: [String: String]], fallbackLocale: String) {}
  // t(key) OR t(key, interpolation values) — the emit passes [String: Any]-shaped
  // dictionary literals ([String: String] and [String: Int] both coerce).
  public func t(_ key: String, _ values: [String: Any] = [:]) -> String { "" }
}
@propertyWrapper public struct PyreonAppStorage<Value> {
  public init(wrappedValue: Value, _ key: String) {}
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
}
public struct PyreonPermissions {
  public init(_ grants: [String]) {}
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

// ---- Additional SwiftUI surface (fonts / images / scroll / spacing) ----
public struct Font {
  public static let largeTitle = Font(), title = Font(), title2 = Font(), title3 = Font()
  public static let headline = Font(), subheadline = Font(), body = Font(), callout = Font()
  public static let footnote = Font(), caption = Font(), caption2 = Font()
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

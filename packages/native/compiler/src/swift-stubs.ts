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
// SCOPE. This stub covers the surface the two shipped example apps emit
// (native-counter-ios + native-todomvc-ios). Expanding it to the full fixture
// corpus (Spacer / ScrollView / Image / Color / @Observable / PyreonRouter /
// PyreonForm / fetch / … — a much larger surface, and the place real emit type
// bugs will surface) is a tracked follow-up.

export const SWIFT_UI_STUBS = `// AUTO-CONCATENATED Swift validation stubs (see swift-stubs.ts). Not shipped.

// ---- View protocol + result builder ----
public protocol View { associatedtype Body: View; var body: Self.Body { get } }
extension Never: View { public var body: Never { fatalError() } }
public struct EmptyView: View { public init() {}; public var body: Never { fatalError() } }
public struct AnyStubView: View { public init() {}; public var body: Never { fatalError() } }

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
  public var body: Never { fatalError() }
}
public struct HStack<Content: View>: View {
  public init(alignment: VerticalAlignment = .center, spacing: Double? = nil, @ViewBuilder content: () -> Content) {}
  public var body: Never { fatalError() }
}
public struct ZStack<Content: View>: View {
  public init(alignment: Alignment = .center, @ViewBuilder content: () -> Content) {}
  public var body: Never { fatalError() }
}
public struct Group<Content: View>: View {
  public init(@ViewBuilder content: () -> Content) {}
  public var body: Never { fatalError() }
}

// ---- Controls ----
public struct Text: View { public init(_ s: String) {}; public var body: Never { fatalError() } }
public struct Button<Label: View>: View {
  public init(action: @escaping () -> Void, @ViewBuilder label: () -> Label) {}
  public var body: Never { fatalError() }
}
extension Button where Label == Text {
  public init(_ title: String, action: @escaping () -> Void) {}
}
public struct Toggle<Label: View>: View {
  public init(_ title: String, isOn: Binding<Bool>) where Label == Text {}
  public var body: Never { fatalError() }
}
public struct TextField: View {
  public init(_ title: String, text: Binding<String>) {}
  public var body: Never { fatalError() }
}
public struct ForEach<Data, ID, Content: View>: View {
  public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder content: @escaping (Data.Element) -> Content) where Data: RandomAccessCollection {}
  public var body: Never { fatalError() }
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
}

// ---- PyreonRuntime ----
public struct PyreonHaptics { public init() {}; public func impact(_ style: String) {} }
public struct PyreonShare { public init() {}; public func url(_ u: String) {} }
public struct PyreonLinking { public init() {}; public func openUrl(_ u: String) {} }
public struct PyreonNotifications { public init() {}; public func notify(_ title: String, _ body: String) {} }
public struct PyreonMachine {
  public init(initial: String, transitions: [String: [String: String]]) {}
  public func callAsFunction() -> String { "" }
  public func send(_ event: String) {}
}
public struct PyreonI18n {
  public init(locale: String, messages: [String: [String: String]], fallbackLocale: String) {}
  public func t(_ key: String) -> String { "" }
}
@propertyWrapper public struct PyreonAppStorage<Value> {
  public init(wrappedValue: Value, _ key: String) {}
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
}
`

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
// PyreonBluetooth + the app-supplied CoreBluetooth scanner the emit names.
public struct PyreonBluetoothDevice { public let id: String; public let name: String }
public protocol BluetoothScanner: AnyObject {
  var isAvailable: Bool { get }
  func startScan(onDevice: @escaping (PyreonBluetoothDevice) -> Void, onError: @escaping (String) -> Void)
  func stopScan()
}
public final class CoreBluetoothScanner: BluetoothScanner {
  public init() {}
  public var isAvailable: Bool { false }
  public func startScan(onDevice: @escaping (PyreonBluetoothDevice) -> Void, onError: @escaping (String) -> Void) {}
  public func stopScan() {}
}
public final class PyreonBluetooth {
  public init(scanner: BluetoothScanner) {}
  public var scanning: Bool { false }
  public var devices: [PyreonBluetoothDevice] { [] }
  public var error: String { "" }
  public var available: Bool { false }
  public func scan() {}
  public func stopScan() {}
}

// PyreonWakeLock + the app-supplied UIKit idle-timer controller the emit names.
public protocol IdleTimerController: AnyObject {
  var isSupported: Bool { get }
  func setIdleTimerDisabled(_ disabled: Bool)
}
public final class UIKitIdleTimer: IdleTimerController {
  public init() {}
  public var isSupported: Bool { true }
  public func setIdleTimerDisabled(_ disabled: Bool) {}
}
// PyreonDeviceInfo + the app-supplied UIKit probe the emit names.
public struct PyreonDeviceScreen {
  public let width: Double
  public let height: Double
  public let scale: Double
  public init(width: Double, height: Double, scale: Double) {
    self.width = width; self.height = height; self.scale = scale
  }
}
public protocol DeviceProbe: AnyObject {
  var model: String { get }
  var osVersion: String { get }
  var isTouch: Bool { get }
  var screen: PyreonDeviceScreen { get }
}
public final class UIKitDeviceProbe: DeviceProbe {
  public init() {}
  public var model: String { "" }
  public var osVersion: String { "" }
  public var isTouch: Bool { false }
  public var screen: PyreonDeviceScreen { PyreonDeviceScreen(width: 0, height: 0, scale: 1) }
}
public final class PyreonDeviceInfo {
  public init(probe: DeviceProbe) {}
  public var platform: String { "ios" }
  public var model: String { "" }
  public var osVersion: String { "" }
  public var isTouch: Bool { false }
  public var screen: PyreonDeviceScreen { PyreonDeviceScreen(width: 0, height: 0, scale: 1) }
}

// PyreonSafeArea / PyreonScreenOrientation + the app-supplied probes the
// emit names. Mirrors the runtimes exactly - a superset stub masks breakage,
// a subset rejects correct code.
public struct PyreonSafeAreaInsets {
  public let top: Double
  public let right: Double
  public let bottom: Double
  public let left: Double
  public init(top: Double, right: Double, bottom: Double, left: Double) {
    self.top = top; self.right = right; self.bottom = bottom; self.left = left
  }
  public static let zero = PyreonSafeAreaInsets(top: 0, right: 0, bottom: 0, left: 0)
}
public protocol SafeAreaProbe: AnyObject { var insets: PyreonSafeAreaInsets { get } }
public final class UIKitSafeAreaProbe: SafeAreaProbe {
  public init() {}
  public var insets: PyreonSafeAreaInsets { .zero }
}
public final class PyreonSafeArea {
  public init(probe: SafeAreaProbe) {}
  public var insets: PyreonSafeAreaInsets { .zero }
}
public protocol OrientationProbe: AnyObject {
  var type: String { get }
  var angle: Int { get }
}
public final class UIKitOrientationProbe: OrientationProbe {
  public init() {}
  public var type: String { "portrait" }
  public var angle: Int { 0 }
}
public final class PyreonScreenOrientation {
  public init(probe: OrientationProbe) {}
  public var type: String { "portrait" }
  public var angle: Int { 0 }
}
// PyreonAudioPlayer + the app-supplied AVFoundation engine the emit names.
public protocol AudioEngine: AnyObject {
  func load(url: URL, loop: Bool, muted: Bool, volume: Double)
  func play()
  func pause()
  func stop()
}
public final class AVFoundationAudioEngine: AudioEngine {
  public init() {}
  public func load(url: URL, loop: Bool, muted: Bool, volume: Double) {}
  public func play() {}
  public func pause() {}
  public func stop() {}
}
public enum PyreonAudioStatus: String {
  case waiting
  case playing
  case paused
}
public final class PyreonAudioState {
  public init(engine: AudioEngine) {}
  public private(set) var status: PyreonAudioStatus = .waiting
  public static func clampVolume(_ v: Double) -> Double { 0 }
  public func start(url: URL, autoPlay: Bool, loop: Bool, muted: Bool, volume: Double) {}
  public func play() {}
  public func pause() {}
  public func stop() {}
}
public struct PyreonAudioPlayer: View {
  public init(
    url: URL?,
    autoPlay: Bool = false,
    loop: Bool = false,
    muted: Bool = false,
    volume: Double = 1,
    engine: AudioEngine,
    onStatusChange: ((String) -> Void)? = nil
  ) {}
  public var body: some View { EmptyView() }
}

// PyreonAudioRecorder + the app-supplied engine the emit names.
public protocol RecordingEngine: AnyObject {
  var isAvailable: Bool { get }
  func begin() -> Bool
  func end() -> String?
  func release()
}
public final class AVFoundationRecordingEngine: RecordingEngine {
  public init() {}
  public var isAvailable: Bool { false }
  public func begin() -> Bool { false }
  public func end() -> String? { nil }
  public func release() {}
}
public final class PyreonAudioRecorder {
  public init(engine: RecordingEngine) {}
  public private(set) var recording: Bool = false
  public private(set) var error: String = ""
  public var supported: Bool { false }
  @discardableResult public func start() -> Bool { false }
  public func stop() -> String? { nil }
}

// PyreonCamera + the app-supplied presenter the emit names.
public protocol CameraPresenter: AnyObject {
  var isAvailable: Bool { get }
  func present(_ completion: @escaping (String?) -> Void)
}
public final class UIKitCameraPresenter: CameraPresenter {
  public init() {}
  public var isAvailable: Bool { false }
  public func present(_ completion: @escaping (String?) -> Void) {}
}
public final class PyreonCamera {
  public init(presenter: CameraPresenter) {}
  public func isAvailable() -> Bool { false }
  public func capture() async -> String? { nil }
}

// PyreonSpeech + the app-supplied synthesiser the emit names.
public protocol SpeechSynth: AnyObject {
  var isAvailable: Bool { get }
  func speak(_ text: String)
  func cancel()
}
public final class AVSpeechSynth: SpeechSynth {
  public init() {}
  public var isAvailable: Bool { false }
  public func speak(_ text: String) {}
  public func cancel() {}
}
public final class PyreonSpeech {
  public init(synth: SpeechSynth) {}
  public private(set) var speaking: Bool = false
  public var supported: Bool { false }
  @discardableResult public func speak(_ text: String) -> Bool { false }
  public func stop() {}
}

// PyreonDeviceMotion + the app-supplied sensor source the emit names.
public struct PyreonVec3 {
  public let x: Double
  public let y: Double
  public let z: Double
  public init(x: Double, y: Double, z: Double) { self.x = x; self.y = y; self.z = z }
  public static let zero = PyreonVec3(x: 0, y: 0, z: 0)
}
public protocol MotionSource: AnyObject {
  var isAvailable: Bool { get }
  func begin(_ onSample: @escaping (PyreonVec3, PyreonVec3) -> Void) -> Bool
  func end()
}
public final class CoreMotionSource: MotionSource {
  public init() {}
  public var isAvailable: Bool { false }
  public func begin(_ onSample: @escaping (PyreonVec3, PyreonVec3) -> Void) -> Bool { false }
  public func end() {}
}
public final class PyreonDeviceMotion {
  public init(source: MotionSource) {}
  public private(set) var active: Bool = false
  public private(set) var acceleration: PyreonVec3 = .zero
  public private(set) var rotation: PyreonVec3 = .zero
  public var supported: Bool { false }
  @discardableResult public func start() -> Bool { false }
  public func stop() {}
}

public final class PyreonWakeLock {
  public init(controller: IdleTimerController) {}
  public var active: Bool { false }
  public var supported: Bool { false }
  @discardableResult public func request() -> Bool { false }
  public func release() {}
}
// EnvironmentKey — the emitted <PermissionsProvider> plumbing declares its
// own key + EnvironmentValues extension inline (a co-located runtime should
// not need SwiftUI's environment machinery), so the stub set has to model the
// protocol the emit conforms to.
public protocol EnvironmentKey {
  associatedtype Value
  static var defaultValue: Value { get }
}
public protocol PyreonScheduler: AnyObject {
  func schedule(after milliseconds: Int, _ work: @escaping () -> Void) -> Int
  func cancel(_ token: Int)
}
public final class TaskScheduler: PyreonScheduler {
  public init() {}
  public func schedule(after milliseconds: Int, _ work: @escaping () -> Void) -> Int { 0 }
  public func cancel(_ token: Int) {}
}
public final class PyreonDebounced<A> {
  public var action: (A) -> Void = { _ in }
  public init(delayMs: Int, scheduler: PyreonScheduler = TaskScheduler(), action: @escaping (A) -> Void = { _ in }) {}
  public func callAsFunction(_ arg: A) {}
  public func cancel() {}
  public func flush() {}
}
public final class PyreonThrottled<A> {
  public var action: (A) -> Void = { _ in }
  public init(waitMs: Int, scheduler: PyreonScheduler = TaskScheduler(), action: @escaping (A) -> Void = { _ in }) {}
  public func callAsFunction(_ arg: A) {}
  public func cancel() {}
}
public struct EnvironmentValues {
  public subscript<K: EnvironmentKey>(key: K.Type) -> K.Value {
    get { K.defaultValue }
    set {}
  }
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
  // Real SwiftUI's State also has this label; the sync lowering seeds @State in
  // a generated init() via _x = State(initialValue: v). A stub missing it
  // MANUFACTURES a failure exactly as a superset stub masks one.
  public init(initialValue value: Value) {}
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
// Mirrors SwiftUI's AnyTransition surface the emit uses. \`asymmetric\` and the
// per-side \`animation(_:)\` were MISSING, so the asymmetric enter/leave emit
// failed this gate while compiling fine against the real SDK — the
// subset-stub-manufactures-failures half of the stub-fidelity rule.
public struct AnyTransition {
  public static let opacity = AnyTransition()
  public static func asymmetric(insertion: AnyTransition, removal: AnyTransition) -> AnyTransition { AnyTransition() }
  public func animation(_ animation: Animation?) -> AnyTransition { self }
  // A <Transition name> now maps to a real transition instead of always
  // fading, so the stub grows the members that emit can produce. Same lesson
  // as the note above: a stub NARROWER than the real SDK rejects correct code.
  public static let scale = AnyTransition()
  public static func move(edge: Edge) -> AnyTransition { AnyTransition() }
  public func combined(with other: AnyTransition) -> AnyTransition { self }
}
public enum Edge {
  case top, bottom, leading, trailing
  // Edge.Set — the first argument of SwiftUI's edge-scoped padding overload,
  // which is what \`paddingX\`/\`paddingY\`/\`marginX\`/\`marginY\` lower to. It was
  // absent, and so was that overload, so the stub accepted strictly LESS than
  // the runtime: every \`.padding(.horizontal, n)\` the emitter has ever produced
  // would have failed this gate, had any fixture exercised one. A stub narrower
  // than the runtime manufactures a bug in correct codegen, which is the mirror
  // of the superset stub that masks a real one.
  public struct Set: OptionSet {
    public let rawValue: Int8
    public init(rawValue: Int8) { self.rawValue = rawValue }
    public static let top = Edge.Set(rawValue: 1)
    public static let leading = Edge.Set(rawValue: 2)
    public static let bottom = Edge.Set(rawValue: 4)
    public static let trailing = Edge.Set(rawValue: 8)
    public static let horizontal = Edge.Set(rawValue: 10)
    public static let vertical = Edge.Set(rawValue: 5)
    public static let all = Edge.Set(rawValue: 15)
  }
}
public protocol Shape {}
public struct Rectangle: Shape { public init() {} }
public protocol Gesture {}
public struct LongPressGesture: Gesture {
  public init(minimumDuration: Double = 0.5) {}
  public func onEnded(_ action: @escaping (Bool) -> Void) -> LongPressGesture { self }
}
// DragGesture — what <Press onSwipeLeft/onSwipeRight> lowers to. The Value
// mirrors the real gesture's \`translation: CGSize\` (width/height Doubles) so
// an emit reading a member DragGesture.Value doesn't have fails typecheck.
public struct DragGesture: Gesture {
  public struct Value { public var translation: CGSize = CGSize(); public var location: CGPoint = CGPoint() }
  public init(minimumDistance: Double = 10) {}
  public func onEnded(_ action: @escaping (Value) -> Void) -> DragGesture { self }
}
public struct CGSize { public var width: Double = 0; public var height: Double = 0 }
// Mirrors the real SwiftUI button styles the variant emit can produce.
// Listing exactly these (not an open struct) keeps a wrong style name a
// compile error here rather than a device surprise.
public struct PrimitiveButtonStyleStub {
  public static let plain = PrimitiveButtonStyleStub()
  public static let bordered = PrimitiveButtonStyleStub()
  public static let borderedProminent = PrimitiveButtonStyleStub()
  public static let automatic = PrimitiveButtonStyleStub()
}
public enum AccessibilityChildBehavior { case contain, combine, ignore }
// UIKit's keyboard types, as SwiftUI's .keyboardType takes them. Listed to
// mirror the real enum rather than widened — the members the emit can produce
// plus the ones a reader would expect beside them.
public enum UIKeyboardType {
  case \`default\`, asciiCapable, numbersAndPunctuation, URL, numberPad, phonePad
  case namePhonePad, emailAddress, decimalPad, twitter, webSearch, asciiCapableNumberPad
}
// Mirrors real SwiftUI's AccessibilityTraits as an OptionSet, not an enum:
// .isHeader is a static member on the type, and the real signature takes the
// set. Listed rather than widened — a stub that is a SUPERSET of the real
// surface masks, and one that is NARROWER manufactures a phantom bug (this one
// was simply absent, so the Heading emit failed the type gate while building
// fine on a device).
// NOTE no backticks anywhere in this file's comments: it is one big TS template
// literal, so a backtick ends the string and the error points at the next word.
public struct AccessibilityTraits: OptionSet {
  public let rawValue: Int
  public init(rawValue: Int) { self.rawValue = rawValue }
  public static let isHeader = AccessibilityTraits(rawValue: 1 << 0)
  public static let isButton = AccessibilityTraits(rawValue: 1 << 1)
  public static let isImage = AccessibilityTraits(rawValue: 1 << 2)
  public static let isSelected = AccessibilityTraits(rawValue: 1 << 3)
  public static let isLink = AccessibilityTraits(rawValue: 1 << 4)
  public static let isSearchField = AccessibilityTraits(rawValue: 1 << 5)
  public static let isModal = AccessibilityTraits(rawValue: 1 << 6)
  public static let isSummaryElement = AccessibilityTraits(rawValue: 1 << 7)
  public static let updatesFrequently = AccessibilityTraits(rawValue: 1 << 8)
  public static let startsMediaSession = AccessibilityTraits(rawValue: 1 << 9)
  public static let allowsDirectInteraction = AccessibilityTraits(rawValue: 1 << 10)
  public static let causesPageTurn = AccessibilityTraits(rawValue: 1 << 11)
  public static let isToggle = AccessibilityTraits(rawValue: 1 << 12)
}

// ---- View modifiers ----
public enum TextTruncationMode { case head, tail, middle }
extension View {
  // CRUX — the EXACT SwiftUI generic constraint. \`value: Any\` would MASK the
  // \`.animation(_:value:)\`-needs-Equatable class (the M2.8 incident). Do not loosen.
  public func animation<V: Equatable>(_ animation: Animation?, value: V) -> some View { self }
  public func transition(_ t: AnyTransition) -> some View { self }
  public func buttonStyle(_ style: PrimitiveButtonStyleStub) -> some View { self }
  public func tint(_ color: Color?) -> some View { self }
  public func accessibilityIdentifier(_ id: String) -> some View { self }
  public func accessibilityLabel(_ label: String) -> some View { self }
  public func accessibilityElement(children: AccessibilityChildBehavior) -> some View { self }
  public func accessibilityAddTraits(_ traits: AccessibilityTraits) -> some View { self }
  public func keyboardType(_ type: UIKeyboardType) -> some View { self }
  public func accessibilityHidden(_ hidden: Bool) -> some View { self }
  public func simultaneousGesture<G: Gesture>(_ gesture: G) -> some View { self }
  public func highPriorityGesture<G: Gesture>(_ gesture: G) -> some View { self }
  // .gesture / .contentShape(Rectangle()) — the chart-host tap emit (chart-hosts.ts).
  public func gesture<G: Gesture>(_ gesture: G) -> some View { self }
  public func contentShape<S: Shape>(_ shape: S) -> some View { self }
  public func onSubmit(_ action: @escaping () -> Void) -> some View { self }
  public func font(_ font: Font?) -> some View { self }
  public func opacity(_ opacity: Double) -> some View { self }
  // A <Text truncate> emits .lineLimit(1).truncationMode(.tail). Both are
  // View extensions in real SwiftUI; the stub simply lacked them, which
  // made a CORRECT emit fail the gate -- a stub NARROWER than the runtime
  // manufactures a bug, exactly as a wider one hides one.
  public func lineLimit(_ number: Int?) -> some View { self }
  public func truncationMode(_ mode: TextTruncationMode) -> some View { self }
  // .background(Color(...)) — emitted for any themed backgroundColor
  // (rocketstyle/attrs/styler all reach it). Mirrors SwiftUI's VIEW overload,
  // \`background<V: View>(_:alignment:)\`, which is what a \`Color\` argument
  // binds to since Color is itself a View. Deliberately WITHOUT the alignment
  // parameter: no emit passes one, and a stub that accepts more than the
  // runtime does is how a broken emit slips through — the same trap the
  // lineLimit note above records, in the opposite direction.
  public func background<V: View>(_ background: V) -> some View { self }
  // useHotkey -> .keyboardShortcut on a hidden Button. Mirrors SwiftUI's real
  // signature including the modifiers-defaults-to-command DEFAULT: the emit always
  // passes modifiers explicitly (even an empty set), so the default is never
  // exercised, but a stub that omits it would accept less than the runtime.
  public func keyboardShortcut(_ key: KeyEquivalent, modifiers: EventModifiers = .command) -> some View { self }
  public func padding() -> some View { self }
  public func padding(_ length: Double) -> some View { self }
  // The edge-scoped overload, mirroring SwiftUI including its DEFAULTED edges.
  // \`padding(8)\` still resolves to the Double overload above — a number is not
  // convertible to Edge.Set — so adding the default costs no ambiguity and
  // keeps the stub from being narrower than the real API.
  public func padding(_ edges: Edge.Set = .all, _ length: Double? = nil) -> some View { self }
  // cornerRadius — what \`radius\` lowers to. Also absent, so \`radius\` was another
  // prop whose emit no fixture had ever put through this gate. Mirrors the real
  // signature including \`antialiased\`, which the emit does not pass.
  public func cornerRadius(_ radius: Double, antialiased: Bool = true) -> some View { self }
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
  public func tracking(_ tracking: Double) -> some View { self }
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
  // The id-keyed overload — SwiftUI cancels and RESTARTS the task when the
  // id changes, which is what useDebouncedValue's lowering rides on. Without
  // it the stub matched the un-keyed overload and reported "extra trailing
  // closure", rejecting a correct emit.
  public func task<T: Equatable>(id: T, priority: TaskPriority = .userInitiated, _ action: @escaping () async -> Void) -> some View { self }
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
  public func onDisappear(_ action: (() -> Void)? = nil) -> some View { self }
}
public enum ImageScale { case small, medium, large }

// ---- PyreonRuntime ----
// Mirrors PyreonHaptics.swift EXACTLY. The stub carried only impact, so
// correct emits calling notification / selection were rejected by the type
// gate — a stub NARROWER than reality fails working code, the mirror of the
// superset-stub trap and just as costly.
public struct PyreonHaptics {
  public init() {}
  public func impact(_ style: String) {}
  public func notification(_ type: String) {}
  public func selection() {}
}
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
  public func start() {}
  public func stop() {}
}
public struct PyreonVideoPlayer: View {
  public init(url: URL?, autoPlay: Bool = false, loop: Bool = false, muted: Bool = false, controls: Bool = true, onStatusChange: ((String) -> Void)? = nil) {}
  public var body: some View { EmptyView() }
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
  public private(set) var text: String = ""
  public init() {}
  public func copy(_ text: String) {}
  public func reset() {}
}
// Mirrors PyreonShare.swift EXACTLY — the stub carried only url, so
// share.text(...), share.textUrl(...) and share.canShare() were all rejected
// despite existing on the real runtime.
public struct PyreonShare {
  public init() {}
  public func text(_ t: String) {}
  public func url(_ u: String) {}
  public func textUrl(_ t: String, _ u: String) {}
  public func canShare() -> Bool { true }
}
public struct PyreonLinking { public init() {}; public func openUrl(_ u: String) {} }
// Mirrors PyreonNotifications.swift EXACTLY — the stub carried only notify,
// so requestPermission (which the real runtime has, and which the web hook
// exposes for prompting ahead of time) was rejected by the type gate.
public struct PyreonNotifications {
  public init() {}
  public func requestPermission() {}
  public func notify(_ title: String, _ body: String) {}
}
// M3.5: authenticate is ASYNC — awaited inside a Task { … } (the M4.5 lowering).
public struct PyreonBiometrics {
  public init() {}
  public func authenticate(_ reason: String) async -> Bool { false }
  public func isAvailable() -> Bool { false }
}
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
// Mirrors the real @Observable final class. The struct stub was missing
// \`can\` / \`nextEvents\` / the \`state\` property / \`transitions\`, so a correct
// \`m.can("GO")\` - a documented member of the web Machine interface, which
// \`createMachine\` lowers to this type - failed the type gate on iOS while
// compiling fine on Android, whose stub was already complete.
public final class PyreonMachine {
  public init(initial: String, transitions: [String: [String: String]]) {
    self.state = initial
    self.transitions = transitions
  }
  public private(set) var state: String
  public let transitions: [String: [String: String]]
  public func callAsFunction() -> String { state }
  public func send(_ event: String) {}
  public func matches(_ s: String) -> Bool { false }
  public func can(_ event: String) -> Bool { false }
  public func nextEvents() -> [String] { [] }
}
// @pyreon/sync — CRDT doc + synced-signal facade. Mirrors the real
// PyreonCrdt.swift / PyreonSyncedSignal.swift SURFACE (not a superset); the
// stub omits @available so the emitted View compiles on any deployment target.
public enum PyreonScalar: Equatable {
  case string(String)
  case int(Int)
  case double(Double)
  case bool(Bool)
  case null
}
public final class PyreonCrdtDoc {
  public init(actor: String) {}
  public func get(_ map: String, _ key: String) -> PyreonScalar? { nil }
  public func set(_ map: String, _ key: String, _ value: PyreonScalar) {}
  public func observe(_ map: String, _ cb: @escaping (Set<String>) -> Void) -> () -> Void { {} }
}
public protocol PyreonScalarConvertible: Equatable {
  init?(pyreonScalar: PyreonScalar)
  var pyreonScalar: PyreonScalar { get }
}
extension String: PyreonScalarConvertible {
  public init?(pyreonScalar: PyreonScalar) { nil }
  public var pyreonScalar: PyreonScalar { .string(self) }
}
extension Double: PyreonScalarConvertible {
  public init?(pyreonScalar: PyreonScalar) { nil }
  public var pyreonScalar: PyreonScalar { .double(self) }
}
extension Bool: PyreonScalarConvertible {
  public init?(pyreonScalar: PyreonScalar) { nil }
  public var pyreonScalar: PyreonScalar { .bool(self) }
}
public let PYREON_SYNCED_DEFAULT_MAP = "pyreon"
public final class PyreonSyncedSignal<T: PyreonScalarConvertible> {
  public private(set) var value: T
  public init(doc: PyreonCrdtDoc, map: String = PYREON_SYNCED_DEFAULT_MAP, key: String, initial: T) {
    self.value = initial
  }
  public func callAsFunction() -> T { value }
  public func set(_ v: T) {}
  // The runtime ships this and the stub did not, so a correct
  // \`s.dispose()\` was rejected by the type gate.
  public func dispose() {}
}
// @pyreon/table — the PyreonTableState engine. Mirrors PyreonTableState.swift.
public enum PyreonCell { case string(String); case number(Double); case none }
public enum PyreonSortDirection { case asc, desc }
public struct PyreonTableColumn<T> {
  public init(id: String, accessor: @escaping (T) -> PyreonCell) {}
}
public final class PyreonTableState<T> {
  public init(data: (() -> [T])? = nil, columns: [PyreonTableColumn<T>] = [], pageSize: Int = 0, rowId: ((T, Int) -> String)? = nil, filterFn: ((T, String, [PyreonTableColumn<T>]) -> Bool)? = nil) {}
  public func setData(_ data: @escaping () -> [T]) {}
  public func rows() -> [T] { [] }
  public func pageCount() -> Int { 1 }
  public func filteredCount() -> Int { 0 }
  public func selectedIds() -> [String] { [] }
  public func toggleSort(_ c: String) {}
  public func setFilter(_ q: String) {}
  public func setPage(_ i: Int) {}
  public func nextPage() {}
  public func prevPage() {}
  public func isSelected(_ id: String) -> Bool { false }
  public func toggleSelected(_ id: String) {}
  public func clearSelection() {}
  public func rowId(_ row: T, _ index: Int) -> String { "" }
  public private(set) var page: Int = 0
  public private(set) var sortColumn: String?
  public private(set) var sortDirection: PyreonSortDirection = .asc
  public private(set) var filterValue: String = ""
  public private(set) var selected: [String] = []
}
// @pyreon/dnd — the PyreonSortableState engine + its two View modifiers.
// Mirrors PyreonSortable.swift EXACTLY (minus @Observable/@available, which are
// runtime-reactivity/availability macros rather than type-level contract — the
// same omission PyreonTableState/PyreonNetworkStatus document).
public enum PyreonSortAxis: String, Equatable { case vertical, horizontal }
public enum PyreonDropEdge: String, Equatable { case top, bottom, left, right }
public struct CGPoint { public var x: Double = 0; public var y: Double = 0 }
public final class PyreonSortableState<T> {
  public init(axis: PyreonSortAxis = .vertical) {}
  public func bind(
    items: @escaping () -> [T],
    by: @escaping (T) -> String,
    onReorder: @escaping ([T]) -> Void
  ) {}
  public func isActive(_ key: String) -> Bool { false }
  public func isOverKey(_ key: String) -> Bool { false }
  public func activeId() -> String? { nil }
  public func overId() -> String? { nil }
  public func overEdge() -> String? { nil }
  public func pickUp(_ key: String) {}
  public func dragOver(_ key: String, edge: PyreonDropEdge) {}
  public func dragLeave(_ key: String) {}
  public func cancel() {}
  @discardableResult
  public func drop(source: String, on target: String, edge: PyreonDropEdge) -> Bool { false }
  public static func moveIndex(_ list: [T], from: Int, to: Int) -> [T] { list }
  public func reordered(dragKey: String, dropKey: String, edge: PyreonDropEdge) -> [T]? { nil }
  public func edgeAt(_ point: CGPoint, in size: CGSize) -> PyreonDropEdge { .top }
  public private(set) var activeKey: String?
  public private(set) var overKey: String?
  public private(set) var currentEdge: PyreonDropEdge?
  public let axis: PyreonSortAxis = .vertical
}
extension View {
  public func pyreonSortableItem<T>(
    _ state: PyreonSortableState<T>,
    key: String
  ) -> some View { self }
  public func pyreonSortableContainer<T>(
    _ state: PyreonSortableState<T>
  ) -> some View { self }
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
// The real type is an @Observable FINAL CLASS, not a struct. That is not a
// cosmetic difference: the emit binds it through @Environment (read-only), so
// a struct cannot typecheck the mutators at all - \`p.grant("x")\` on a struct
// needs \`mutating\`, which an @Environment binding cannot satisfy. The struct
// stub therefore rejected correct code twice over: wrong kind AND five missing
// members (can/cannot/set/grant/revoke, plus the granted property).
public final class PyreonPermissions {
  public init(_ granted: Set<String> = []) {}
  public private(set) var granted: Set<String> = []
  public func can(_ key: String) -> Bool { false }
  public func cannot(_ key: String) -> Bool { false }
  public func not(_ key: String) -> Bool { false }
  public func all(_ keys: String...) -> Bool { false }
  public func any(_ keys: String...) -> Bool { false }
  public func callAsFunction(_ key: String) -> Bool { false } // used as \`can("x")\`
  public func set(_ keys: Set<String>) {}
  public func grant(_ key: String) {}
  public func revoke(_ key: String) {}
}
// PyreonNetworkStatus — mirror of @pyreon/native-runtime-swift's
// PyreonNetworkStatus.swift surface the emit touches: the no-arg constructor
// plus the isOnline Bool read (bare, since the real type is @Observable).
// The @Observable macro drives runtime reactivity, NOT the type-level compile,
// so a plain class type-checks an @State PyreonNetworkStatus + net.isOnline
// identically. useOnline() returns a web ACCESSOR read as net() — the emit
// lowers that call to this net.isOnline Bool read.
// start()/stop() joined the mirrored surface when the emit gained the
// .onAppear/.onDisappear start/stop harness — the NWPathMonitor behind them
// existed from inception with nothing calling it, so useOnline() on iOS was
// frozen at true forever (2026-08-04).
public final class PyreonNetworkStatus {
  public private(set) var isOnline: Bool
  public init(isOnline: Bool = true) { self.isOnline = isOnline }
  public func start() {}
  public func stop() {}
}
// PyreonAppState — mirror of @pyreon/native-runtime-swift's PyreonAppState.swift
// surface the emit touches: the no-arg constructor + the phase String read
// (bare, since the real type is @Observable — the macro drives runtime
// reactivity, not the type-level compile). useAppState() returns a web
// ACCESSOR read as state(); the emit lowers that call to state.phase.
public final class PyreonAppState {
  public private(set) var phase: String
  public private(set) var wasBackgrounded: Bool = false
  public func start() {}
  public func stop() {}
  public init(phase: String = "active") { self.phase = phase }
}
// PyreonToast — mirror of runtime-swift's PyreonToast.swift surface the emit
// touches: the shared singleton, \`toasts\` (a collection of Identifiable items
// with a \`message\`, iterated by the \`<Toaster/>\` ForEach), and the
// \`add(_:type:)\` the imperative \`toast(...)\` call lowers to.
public struct PyreonToastItem: Identifiable {
  public let id: String
  public let message: String
  public let type: String
}
public final class PyreonToast {
  public static let shared = PyreonToast()
  public private(set) var toasts: [PyreonToastItem] = []
  @discardableResult
  public func add(_ message: String, type: String = "info", duration: TimeInterval? = nil) -> String { "" }
  public func dismiss(_ id: String) {}
  public func clear() {}
}
// PyreonA11y — mirror of runtime-swift's PyreonA11y.swift: a static
// \`announce(_:assertive:)\` the imperative \`announce(...)\` call lowers to.
public enum PyreonA11y {
  public static func announce(_ message: String, assertive: Bool = false) {}
}
// PyreonCrashReporter — mirror of the runtime-swift surface the emit touches:
// no-arg init, start(), the lastCrash/hadCrash reads (bare — the real type is
// @Observable), and recordError/breadcrumb/clear methods.
public final class PyreonCrashReporter {
  public private(set) var lastCrash: String = ""
  public private(set) var hadCrash: Bool = false
  public init() {}
  public func start() {}
  public func recordError(_ message: String) {}
  public func breadcrumb(_ message: String) {}
  public func clear() {}
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
  // Search parameters, mirroring the real PyreonRouter. useUrlState lowers to
  // a value type over these two, so a stub missing them would reject a correct
  // emit — the subset-stub failure, which manufactures bugs exactly as a
  // superset stub masks them.
  public var query: [String: String] { [:] }
  public func setQueryParam(_ key: String, _ value: String?) {}
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
// PyreonQuery — the cached data container a \`useQuery\` decl emits. Mirrors
// runtime-swift's PyreonQuery.swift: \`data\`/\`error\`/\`isPending\`/\`isFetching\`
// are private(set) (driven via begin/resolve/reject), \`isStale\` is a computed
// getter the emit's \`.task\` reads, and the init takes \`queryKey\` +
// defaulted \`staleSeconds\`. A superset stub would MASK a real mismatch, so
// the signatures track the runtime exactly.
public final class PyreonQueryCache {
  public static let shared = PyreonQueryCache()
  public init() {}
  public func invalidate(_ key: String) {}
  public func clearAll() {}
}
public final class PyreonQuery<T> {
  public private(set) var data: T?
  public private(set) var error: Error?
  public private(set) var isPending: Bool = false
  public private(set) var isFetching: Bool = false
  public private(set) var queryKey: String = ""
  public var isStale: Bool { true }
  public init(queryKey: String, staleSeconds: TimeInterval = 0, cache: PyreonQueryCache = .shared) {}
  public func setKey(_ key: String) {}
  public func begin() {}
  public func resolve(_ value: T) {}
  public func reject(_ failure: Error) {}
  public func load(_ fetcher: @escaping () throws -> T) {}
  public func refetch() {}
}
// PyreonHttp — what a \`useFetch(url, { method, headers, body })\` decl emits.
// Mirrors the REAL PyreonHttp.swift surface exactly (a superset stub masks):
// \`send\` is \`async throws\`, \`isOK\` is capitalised where Kotlin's is \`isOk\`,
// \`decode\` is generic + throwing, and the request init's arguments are all
// defaulted except \`url\`.
public enum PyreonHttpMethod: String, Sendable {
  case get = "GET"
  case post = "POST"
  case put = "PUT"
  case patch = "PATCH"
  case delete = "DELETE"
}
public struct PyreonHttpRequest: Sendable {
  public init(
    method: PyreonHttpMethod = .get,
    url: String,
    headers: [String: String] = [:],
    body: Data? = nil
  ) {}
}
public struct PyreonHttpResponse: Sendable {
  public let status: Int = 0
  public var isOK: Bool { true }
  public var text: String { "" }
  public func decode<T: Decodable>(_ type: T.Type) throws -> T {
    throw PyreonHttpError.invalidURL("stub")
  }
}
public enum PyreonHttpError: Error, Equatable {
  case invalidURL(String)
  case badStatus(Int)
}
public enum PyreonHttp {
  public static func send(_ request: PyreonHttpRequest) async throws -> PyreonHttpResponse {
    PyreonHttpResponse()
  }
}
// PyreonURL — the runtime path-param encoder a templated endpoint URL calls.
// Mirrors the REAL PyreonURL surface: three overloads (String / Int / Double),
// one per type a \`PathParams\` value can take once the compiler has inferred
// it. Listing FEWER would reject a correct emit; listing more would let a
// wrong one through.
public enum PyreonURL {
  public static func encodePathParam(_ value: String) -> String { value }
  public static func encodePathParam(_ value: Int) -> String { "" }
  public static func encodePathParam(_ value: Double) -> String { "" }
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
  // .system(size:weight:design:) — the emit uses it for a numeric font size.
  // Real SwiftUI defaults weight and design, so both are optional here too; a
  // stub that REQUIRED them would reject the emit's one-argument call, which is
  // the narrower-than-the-runtime failure that manufactures a phantom bug.
  public static func system(
    size: Double,
    weight: Font.Weight = .regular,
    design: Font.Design = .default
  ) -> Font { Font() }
  public enum Weight { case ultraLight, thin, light, regular, medium, semibold, bold, heavy, black }
  public enum Design { case \`default\`, serif, rounded, monospaced }
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
// PyreonSizedMap — mirrors packages/core/sized-map/native/swift/PyreonSizedMap.swift.
// Signature copied from the shipped class, not approximated: maxEntries is
// required and lru defaults, which is what makes a snippet passing only
// maxEntries compile while a maxSize typo still fails.
public final class PyreonSizedMap<Key: Hashable, Value> {
  public init(maxEntries: Int, lru: Bool = false) {}
  public var size: Int { 0 }
  public func get(_ key: Key) -> Value? { nil }
  public func set(_ key: Key, _ value: Value) {}
  public func has(_ key: Key) -> Bool { false }
  @discardableResult public func delete(_ key: Key) -> Bool { false }
  public func clear() {}
  public func keys() -> [Key] { [] }
  public func values() -> [Value] { [] }
  public func entries() -> [(Key, Value)] { [] }
}

// KeyEquivalent / EventModifiers — the two types a keyboard shortcut needs.
// The named members are exactly those SwiftUI declares; an emit asking for one
// it does not have (e.g. 'insert') must FAIL the gate rather than compile
// against a stub that invented it.
public struct KeyEquivalent {
  public init(_ character: Character) {}
  // Placeholder characters: the stub exists to TYPE-check a shortcut binding,
  // and nothing ever compares these values. Real control-character escapes
  // would have to survive a TS template literal into Swift source, which is a
  // needless way to break the file.
  public static let escape = KeyEquivalent("a")
  public static let \`return\` = KeyEquivalent("b")
  public static let delete = KeyEquivalent("c")
  public static let tab = KeyEquivalent("d")
  public static let space = KeyEquivalent("e")
  public static let upArrow = KeyEquivalent("f")
  public static let downArrow = KeyEquivalent("g")
  public static let leftArrow = KeyEquivalent("h")
  public static let rightArrow = KeyEquivalent("i")
  public static let home = KeyEquivalent("j")
  public static let end = KeyEquivalent("k")
  public static let pageUp = KeyEquivalent("l")
  public static let pageDown = KeyEquivalent("m")
}

public struct EventModifiers: OptionSet {
  public let rawValue: Int
  public init(rawValue: Int) { self.rawValue = rawValue }
  public static let command = EventModifiers(rawValue: 1)
  public static let control = EventModifiers(rawValue: 2)
  public static let shift = EventModifiers(rawValue: 4)
  public static let option = EventModifiers(rawValue: 8)
}

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
  // The standard SwiftUI colour set the danger variant reaches for.
  public static let red = Color(red: 1, green: 0, blue: 0)
  public static let green = Color(red: 0, green: 1, blue: 0)
  public static let blue = Color(red: 0, green: 0, blue: 1)
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
  // Mirrors the real init including both defaults, so the emit's
  // \`ScrollView { }\` and \`ScrollView(.horizontal) { }\` both resolve. Only the
  // content-only form was declared, so \`<Scroll axis="horizontal">\` — a
  // shipped, documented lowering — had never been through this gate.
  //
  // Reuses the \`Axis\` declared above rather than restating it. That one is a
  // deliberate simplification of SwiftUI's OptionSet, which is safe here
  // because \`axis\` is single-valued (\`'vertical' | 'horizontal'\`) and no emit
  // can ever combine the two — a stub narrower than the runtime only
  // manufactures a bug where the emit can reach the missing part.
  public init(
    _ axes: Axis.Set = .vertical,
    showsIndicators: Bool = true,
    @ViewBuilder content: () -> Content
  ) {}
  public typealias Body = Never
}
public struct Image: View {
  public init(_ name: String) {}
  public init(systemName: String) {}
  public typealias Body = Never
}
public struct AsyncImage: View {
  public init(url: URL?) {}
  // The content-closure form, which is the only place \`.resizable()\` can
  // reach the loaded Image — so it is what \`fit\` on a REMOTE src lowers to.
  // Absent until now, which is part of why that lowering was deferred: there
  // was nothing to compile it against.
  public init<C: View, P: View>(
    url: URL?,
    scale: Double = 1,
    @ViewBuilder content: (Image) -> C,
    @ViewBuilder placeholder: () -> P
  ) {}
  public typealias Body = Never
}
`

/**
 * The two views a `@pyreon/charts/plot` host emit needs that the generated
 * engine never declares. validate.ts appends the REAL engine + canvas types
 * next to this when a chart host is present; the view stubs live here so the
 * stub-coverage ratchet counts `PyreonChartCanvas` as covered. The init
 * mirrors runtime-swift `PyreonChartCanvas.swift` exactly.
 */
export const SWIFT_CHART_VIEW_STUBS = `
// ---- @pyreon/charts/plot hosts (chart-hosts.ts emit) ----
public struct GeometryProxy { public var size: CGSize = CGSize() }
public struct GeometryReader<Content: View>: View {
  public init(@ViewBuilder content: @escaping (GeometryProxy) -> Content) {}
  public typealias Body = Never
}
public struct PyreonChartCanvas: View {
  public var cmds: [PyreonDrawCmd]
  public var fontFamily: String?
  public init(cmds: [PyreonDrawCmd], fontFamily: String? = nil) { self.cmds = cmds; self.fontFamily = fontFamily }
  public var body: some View { EmptyView() }
}
`

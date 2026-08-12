// PyreonStorage — Codable-aware @AppStorage property wrappers for
// the SwiftUI side of Pyreon's cross-platform persistence story.
//
// ## What this delivers
//
// SwiftUI's stock `@AppStorage` only natively persists the primitive
// types `String`, `Int`, `Double`, `Bool`, `URL`, `Data`, and
// `RawRepresentable`. For Codable collections + struct types (the
// shape almost every real app uses — arrays of records, nested
// structs, etc.) consumers have to hand-write a `Data`-backed
// `@AppStorage` slot plus a Codable bridge:
//
// ```swift
// @AppStorage("pyreon-todomvc:todos") private var todosData: Data = Data()
// private var todos: [Todo] {
//     get {
//         guard !todosData.isEmpty,
//               let decoded = try? JSONDecoder().decode([Todo].self, from: todosData)
//         else { return [] }
//         return decoded
//     }
//     nonmutating set {
//         if let encoded = try? JSONEncoder().encode(newValue) {
//             todosData = encoded
//         }
//     }
// }
// ```
//
// That's 14 lines of boilerplate per Codable storage slot. `PyreonStorage`
// collapses it to one:
//
// ```swift
// @PyreonAppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []
// ```
//
// Same persistence semantics, same UserDefaults backing store, same
// `Binding<T>` projection via `$todos`. Zero runtime cost vs the
// inline bridge — JSONEncoder/JSONDecoder are the same calls either
// way.
//
// ## Relationship to the PMTC compiler emit
//
// The Pyreon compiler currently emits the verbose 14-line bridge inline
// (per G5 + the Phase 2 Codable-Data PR). The next emit-pass
// simplification can detect `useStorage<T>('key', default)` calls and
// emit the one-liner `@PyreonAppStorage` form instead — same persistence,
// dramatically simpler emit. Tracked as a Phase 2.5 follow-up.
//
// Until that emit change lands, this property wrapper is also usable
// by hand-written SwiftUI code that wants the convenience. The two
// shapes (inline bridge + property wrapper) coexist; both back onto
// the same UserDefaults key, so they're interchangeable per-callsite.
//
// ## Why property wrapper vs free function
//
// `useStorage<T>(key:default:)` would be the obvious mirror of the
// web's `@pyreon/storage` API. But SwiftUI's reactive primitives
// (`@State`, `@AppStorage`) are property wrappers — anything not a
// property wrapper can't drive view re-renders. So the shape that
// composes with SwiftUI is a property wrapper. A free-function shape
// is provided too (`PyreonStorage.read` / `.write`) for non-View
// callers, but views should use the property wrapper.

import SwiftUI

/// Codable-aware UserDefaults-backed storage, mirroring SwiftUI's
/// `@AppStorage` API for any `Codable` value type.
///
/// ## Usage
///
/// ```swift
/// struct Todo: Codable { var id: Int; var text: String; var done: Bool }
///
/// struct TodoApp: View {
///     @PyreonAppStorage("todos") private var todos: [Todo] = []
///
///     var body: some View {
///         List(todos, id: \.id) { todo in
///             Text(todo.text)
///         }
///     }
/// }
/// ```
///
/// The wrapper:
/// - **Reads** by decoding the UserDefaults `Data` slot via JSONDecoder
/// - **Writes** by encoding via JSONEncoder + storing back
/// - **Projects** a `Binding<Value>` via `$todos`, same as `@AppStorage`
/// - **Defaults** to the supplied initial when the key is absent or
///   decoding fails (corruption, schema migration)
/// - **Updates** the view on every write via the underlying
///   `UserDefaults.didChangeNotification` chain SwiftUI already
///   observes for `@AppStorage`
///
/// ## Failure semantics
///
/// JSONDecoder failures fall back to the default value silently. This
/// matches Pyreon's `@pyreon/storage` web API: corrupted localStorage
/// reads also fall back to the default without throwing. Apps that
/// want explicit error visibility can use `PyreonStorage.read(...)`
/// directly and inspect the throw.
///
/// JSONEncoder failures (e.g. a non-Codable value reaching the setter
/// despite the `Codable` constraint — should be unreachable, but Swift's
/// type system doesn't prevent encoding errors for some custom
/// implementations) silently drop the write. Apps that need
/// write-failure visibility can use `PyreonStorage.write(...)` directly.
///
/// ## Memory + performance
///
/// Each get/set roundtrips through `JSONEncoder` / `JSONDecoder` — same
/// cost as the inline bridge. For high-frequency writes (e.g. typing
/// in a search field) consider holding an in-memory `@State` and
/// debouncing the write into `@PyreonAppStorage`. Same advice applies
/// to stock `@AppStorage`.
@propertyWrapper
public struct PyreonAppStorage<Value: Codable>: DynamicProperty {
    private let key: String
    private let defaultValue: Value
    private let store: UserDefaults

    // Hold the underlying Data slot via @AppStorage so SwiftUI's
    // reactive observation chain picks up changes. Using a `Data`
    // backing means we get all the UserDefaults/iCloud key-value
    // sync behaviour @AppStorage already provides.
    @AppStorage private var rawData: Data

    public init(
        wrappedValue defaultValue: Value,
        _ key: String,
        store: UserDefaults? = nil
    ) {
        self.key = key
        self.defaultValue = defaultValue
        self.store = store ?? .standard
        // Underscore-init the @AppStorage to bind to the same key
        // with a `Data()` empty-sentinel default. Empty Data means
        // "decode-fail → return defaultValue".
        self._rawData = AppStorage(
            wrappedValue: Data(),
            key,
            store: store ?? .standard
        )
    }

    public var wrappedValue: Value {
        get {
            PyreonStorage.decodeOrDefault(rawData, default: defaultValue)
        }
        nonmutating set {
            if let encoded = try? JSONEncoder().encode(newValue) {
                rawData = encoded
            }
            // Silent write-failure — matches web @pyreon/storage's
            // localStorage QuotaExceededError behaviour: app continues
            // with the previous persisted value. Apps needing
            // write-failure visibility should use PyreonStorage.write().
        }
    }

    public var projectedValue: Binding<Value> {
        Binding(
            get: { wrappedValue },
            set: { newValue in wrappedValue = newValue }
        )
    }
}

/// Free-function escape hatches for non-View callers (background
/// migrations, snapshot-on-launch logic, test setup).
///
/// Views should use `@PyreonAppStorage` — it composes with SwiftUI's
/// observation chain. These functions exist for the cases where you're
/// outside a View context entirely.
public enum PyreonStorage {
    /// Decode a Codable value from raw `Data`, falling back to the
    /// default on decode failure or empty data.
    ///
    /// This is the same decode path `@PyreonAppStorage` uses
    /// internally — exposed so non-View code can run the same
    /// fallback semantics.
    public static func decodeOrDefault<T: Codable>(
        _ data: Data,
        default defaultValue: T
    ) -> T {
        guard !data.isEmpty,
              let decoded = try? JSONDecoder().decode(T.self, from: data)
        else { return defaultValue }
        return decoded
    }

    /// Read a Codable value from UserDefaults at `key`, throwing on
    /// decode failure (for callers that want explicit error handling
    /// vs the property wrapper's silent fallback).
    public static func read<T: Codable>(
        _ type: T.Type,
        key: String,
        store: UserDefaults = .standard
    ) throws -> T? {
        guard let data = store.data(forKey: key), !data.isEmpty else {
            return nil
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Write a Codable value to UserDefaults at `key`, throwing on
    /// encode failure (matches `read`'s symmetric error path).
    public static func write<T: Codable>(
        _ value: T,
        key: String,
        store: UserDefaults = .standard
    ) throws {
        let data = try JSONEncoder().encode(value)
        store.set(data, forKey: key)
    }

    /// Remove a value at `key`. Mirrors web @pyreon/storage's `.remove()`.
    public static func remove(key: String, store: UserDefaults = .standard) {
        store.removeObject(forKey: key)
    }
}

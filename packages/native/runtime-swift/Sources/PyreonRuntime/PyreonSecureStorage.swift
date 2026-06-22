// PyreonSecureStorage — the SwiftUI side of Pyreon's cross-platform
// SECRET persistence story (Tier 1). Mirrors a web `useSecureStorage`
// surface and the Kotlin `PyreonSecureStorage` one-for-one.
//
// ## What this delivers vs PyreonStorage
//
// `PyreonStorage` (`@PyreonAppStorage`) persists ordinary app state in
// UserDefaults — fine for todos, preferences, UI state, but NOT for
// secrets. Auth tokens, refresh tokens, API keys, and PII MUST live in
// the platform secret store (the iOS Keychain), which is hardware-backed,
// encrypted at rest, and excluded from UserDefaults / iCloud-KV / plist
// backups. Every finance / auth app needs this; UserDefaults for a bearer
// token is a real security bug.
//
// `PyreonSecureStorage` is the imperative secret API:
//
//     let store = PyreonSecureStorage()      // Keychain-backed by default
//     store.write("ey…token", key: "auth")   // → Keychain
//     let token = store.read(key: "auth")     // String?
//     store.remove(key: "auth")
//
// It is imperative (read/write/remove), NOT a reactive view-state
// primitive — a secret is fetched at an auth boundary, not rendered as
// live UI. (Reactive app state stays `@PyreonAppStorage`.)
//
// ## Two layers — pluggable backend + real Keychain edge
//
// The facade is keyed on a `PyreonSecureBackend` (the `StorageBackend`
// blueprint CLAUDE.md documents — `createStorage(backend)`). The DEFAULT
// is `KeychainSecureBackend`, a real `Security`-framework implementation
// (`SecItemAdd` / `SecItemCopyMatching` / `SecItemDelete`) that compiles
// under `swift build`. Tests inject `InMemorySecureBackend` and assert the
// read/write/remove round-trip synchronously — the live Keychain I/O is
// device/host territory (entitlements, a login keychain), NOT asserted in
// the unit tests, the same "real edge constructed, not asserted" boundary
// `PyreonNetworkStatus` (NWPathMonitor) and `PyreonWebSocket`
// (URLSessionWebSocketTask) use.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `useSecureStorage('key')` and emits a
// `PyreonSecureStorage` instance; reads/writes in the component body
// become calls on this facade. Until that lands (the per-service-port
// follow-up), this is usable by hand-written SwiftUI code.

import Foundation
import Security

/// Pluggable secret backend. The facade defaults to `KeychainSecureBackend`;
/// tests / previews inject `InMemorySecureBackend`. The contract is
/// deliberately tiny + synchronous (mirrors the web `StorageBackend`):
/// secrets are small strings, so a sync API is honest + simplest.
public protocol PyreonSecureBackend {
    /// Persist `value` at `key`, overwriting any existing entry. Returns
    /// true on success.
    @discardableResult func write(_ value: String, key: String) -> Bool
    /// Read the secret at `key`, or `nil` if absent / unreadable.
    func read(key: String) -> String?
    /// Delete the secret at `key`. Returns true on success OR if the key
    /// was already absent (idempotent delete).
    @discardableResult func remove(key: String) -> Bool
}

/// In-memory backend — for tests + SwiftUI previews. **NOT secure**: no
/// encryption, process-lifetime only, cleared on relaunch. Production code
/// uses the default `KeychainSecureBackend`.
public final class InMemorySecureBackend: PyreonSecureBackend {
    private var store: [String: String] = [:]

    public init() {}

    @discardableResult
    public func write(_ value: String, key: String) -> Bool {
        store[key] = value
        return true
    }

    public func read(key: String) -> String? {
        store[key]
    }

    @discardableResult
    public func remove(key: String) -> Bool {
        store.removeValue(forKey: key)
        return true // idempotent — absent key is still "removed"
    }
}

/// Real iOS/macOS Keychain backend (`Security` framework). Stores each
/// secret as a `kSecClassGenericPassword` item keyed by `(service,
/// account)`. Compiles under `swift build`; the live `SecItem*` calls run
/// against the host/device keychain — exercised on a real device, NOT in
/// the unit tests (which inject `InMemorySecureBackend`).
public final class KeychainSecureBackend: PyreonSecureBackend {
    private let service: String

    /// `service` namespaces this app's keychain items (default
    /// `com.pyreon.securestorage`). Pass your app's bundle id to isolate.
    public init(service: String = "com.pyreon.securestorage") {
        self.service = service
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    @discardableResult
    public func write(_ value: String, key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        // Delete-then-add for an idempotent overwrite (SecItemUpdate needs
        // a separate attributes dict; delete+add is simpler + atomic enough
        // for a single small secret).
        SecItemDelete(baseQuery(key) as CFDictionary)
        var add = baseQuery(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    public func read(key: String) -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8)
        else { return nil }
        return str
    }

    @discardableResult
    public func remove(key: String) -> Bool {
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        // Treat "not found" as success — delete is idempotent.
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

/// Secret-storage facade — the SwiftUI half of `useSecureStorage`.
/// Defaults to the real Keychain; inject a backend for tests / custom
/// stores.
public final class PyreonSecureStorage {
    private let backend: PyreonSecureBackend

    /// Default to the real Keychain backend. Inject `InMemorySecureBackend`
    /// in tests, or a custom `PyreonSecureBackend` for an alternate store.
    public init(backend: PyreonSecureBackend = KeychainSecureBackend()) {
        self.backend = backend
    }

    /// Persist `value` at `key` (overwrites). Returns true on success.
    @discardableResult
    public func write(_ value: String, key: String) -> Bool {
        backend.write(value, key: key)
    }

    /// Read the secret at `key`, or `nil` if absent / unreadable.
    public func read(key: String) -> String? {
        backend.read(key: key)
    }

    /// Delete the secret at `key`. Idempotent — true even if already absent.
    @discardableResult
    public func remove(key: String) -> Bool {
        backend.remove(key: key)
    }

    /// True iff a secret exists at `key`. Convenience over `read != nil`.
    public func contains(key: String) -> Bool {
        backend.read(key: key) != nil
    }
}

// PyreonStorage + PyreonSecureStorage behavior — standalone assertion program
// the co-source verify gate compiles with ../swift/{PyreonStorage,PyreonSecureStorage}.swift
// (-parse-as-library) and runs. Covers the pure codec, the UserDefaults
// read/write facade, and the secure-store facade over InMemorySecureBackend.
// The SwiftUI `@PyreonAppStorage` property wrapper + the live `KeychainSecureBackend`
// SecItem I/O are device/host territory (asserted by the iOS device gate), not here.

import Foundation

@main
struct PyreonStorageTests {
    struct TestTodo: Codable, Equatable {
        var id: Int
        var text: String
        var done: Bool
    }

    static func eq<T: Equatable>(_ a: T, _ b: T, _ m: String = "") {
        if a != b { fatalError("PyreonStorageTests: \(m) — \(a) != \(b)") }
    }
    static func check(_ c: Bool, _ m: String) { if !c { fatalError("PyreonStorageTests: \(m)") } }

    static func freshStore() -> UserDefaults {
        let suite = "pyreon-test-\(UUID().uuidString)"
        let store = UserDefaults(suiteName: suite)!
        store.removePersistentDomain(forName: suite)
        return store
    }

    static func main() {
        // decodeOrDefault: empty → default, corrupt → default, valid → decoded
        let d1: [TestTodo] = PyreonStorage.decodeOrDefault(Data(), default: [TestTodo(id: 1, text: "default", done: false)])
        eq(d1.count, 1); eq(d1[0].text, "default", "empty data → default")
        let d2: [TestTodo] = PyreonStorage.decodeOrDefault(Data("not valid json".utf8), default: [])
        eq(d2, [], "corrupt data → default")
        let original = [TestTodo(id: 1, text: "first", done: false), TestTodo(id: 2, text: "second", done: true)]
        let encoded = try! JSONEncoder().encode(original)
        let d3: [TestTodo] = PyreonStorage.decodeOrDefault(encoded, default: [])
        eq(d3, original, "valid data round-trips")

        // read / write / remove through a real UserDefaults suite
        let store = freshStore()
        let key = "todos"
        let payload = [TestTodo(id: 1, text: "test", done: false)]
        let before: [TestTodo]? = try! PyreonStorage.read([TestTodo].self, key: key, store: store)
        check(before == nil, "read before write → nil")
        try! PyreonStorage.write(payload, key: key, store: store)
        let after: [TestTodo]? = try! PyreonStorage.read([TestTodo].self, key: key, store: store)
        eq(after, payload, "write then read round-trips")
        PyreonStorage.remove(key: key, store: store)
        let afterRemove: [TestTodo]? = try! PyreonStorage.read([TestTodo].self, key: key, store: store)
        check(afterRemove == nil, "remove clears the key")

        // read returns nil on empty Data (not throw); throws on corrupt
        let s2 = freshStore()
        s2.set(Data(), forKey: "empty")
        let empty: [TestTodo]? = try! PyreonStorage.read([TestTodo].self, key: "empty", store: s2)
        check(empty == nil, "empty Data → nil, not throw")
        s2.set(Data("nope".utf8), forKey: "corrupt")
        var threw = false
        do { _ = try PyreonStorage.read([TestTodo].self, key: "corrupt", store: s2) } catch { threw = true }
        check(threw, "read throws on corrupt stored data")

        // PyreonSecureStorage facade over InMemorySecureBackend
        let sec = PyreonSecureStorage(backend: InMemorySecureBackend())
        check(sec.read(key: "auth") == nil, "secure: absent reads nil")
        check(sec.write(key: "auth", value: "ey.token"), "secure: write returns true")
        eq(sec.read(key: "auth"), "ey.token", "secure: round-trip")
        sec.write(key: "auth", value: "second")
        eq(sec.read(key: "auth"), "second", "secure: overwrite")
        check(sec.remove(key: "auth"), "secure: remove returns true")
        check(sec.read(key: "auth") == nil, "secure: removed reads nil")
        check(sec.remove(key: "never"), "secure: remove absent is idempotent")

        // multiple keys isolated
        let sec2 = PyreonSecureStorage(backend: InMemorySecureBackend())
        sec2.write(key: "a", value: "a-val"); sec2.write(key: "b", value: "b-val")
        sec2.remove(key: "a")
        check(sec2.read(key: "a") == nil, "secure: removing a leaves b")
        eq(sec2.read(key: "b"), "b-val", "secure: b survives a's removal")

        print("[PyreonStorageTests] all assertions passed")
    }
}

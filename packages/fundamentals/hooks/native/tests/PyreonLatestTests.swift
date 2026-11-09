// Executable checks for PyreonLatest (the box behind `useLatest`).
//
// NOT @main: this directory's single @main (PyreonBluetoothTests) calls `runAll()`.

import Foundation

enum PyreonLatestTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        holdsInitialAndLastWrite()
        isSharedByReference()
    }

    static func holdsInitialAndLastWrite() {
        let box = PyreonLatest(1)
        expect(box.current == 1, "holds the initial value")
        box.current = 7
        expect(box.current == 7, "reads back the last write")
    }

    static func isSharedByReference() {
        let box = PyreonLatest("a")
        let alias = box
        alias.current = "b"
        expect(box.current == "b", "a long-lived closure over the box sees a later write")
    }
}

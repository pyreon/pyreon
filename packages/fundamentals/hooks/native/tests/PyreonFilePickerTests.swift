// Executable checks for PyreonFilePicker's accept filter. NOT @main —
// PyreonBluetoothTests owns this directory's entry point and calls runAll().
//
// The picker itself needs UIKit and a window, so only the pure mapping from the
// web `<input accept>` vocabulary to UTTypes is under test here.

import Foundation
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

enum PyreonFilePickerTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        #if canImport(UniformTypeIdentifiers)
        let types = PyreonFilePicker.contentTypes(for:)
        expect(types([]) == [.item], "no filter accepts any file")
        expect(types(["application/pdf"]) == [.pdf], "a MIME type resolves through UTType")
        expect(types([" .PDF "]) == [.pdf], "an extension resolves, trimmed and case-insensitive")
        expect(types(["image/*", "video/*", "audio/*", "text/*"]) == [.image, .movie, .audio, .text], "the common wildcards map to umbrella types")
        expect(types([".pdf", "application/pdf"]) == [.pdf], "duplicates collapse")
        // Widening, not narrowing: a too-narrow filter hides the file the user wants.
        expect(types(["application/pdf", "pdf"]) == [.item], "a bare word widens to any file")
        expect(types(["application/x-not-a-real-type-pyreon"]) == [.item], "an unknown MIME type widens to any file")
        expect(types([".notarealextpyreon"]) == [.item], "an unknown extension widens to any file")
        print("[PyreonFilePickerTests] all assertions passed")
        #endif
    }
}

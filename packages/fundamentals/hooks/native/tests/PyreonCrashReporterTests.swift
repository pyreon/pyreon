// Executable checks for PyreonCrashReporter's report shape — specifically
// the BUILD IDENTITY `pyreon-native symbolicate` keys on. NOT @main:
// PyreonBluetoothTests owns this directory's entry point and calls runAll().
//
// The image fields are read from the running process (this test binary is
// the MH_EXECUTE image here, exactly as the app is on a device), so the
// assertions check them against dyld's own view rather than against
// constants.

import Foundation
import MachO

@available(iOS 17.0, macOS 14.0, *)
enum PyreonCrashReporterTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: PyreonCrashReporterTests: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        reportCarriesBuildIdentityAndRawAddresses()
        recordErrorAddressesFallInsideTheMainImage()
        print("PyreonCrashReporterTests: ok")
    }

    static func freshDir() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("pyreon-crash-test-\(UUID().uuidString)", isDirectory: true)
    }

    static func readReport(_ dir: URL) -> [String: Any] {
        let url = dir.appendingPathComponent("last-crash.json")
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            expect(false, "the report file is a JSON object")
            return [:]
        }
        return obj
    }

    static func reportCarriesBuildIdentityAndRawAddresses() {
        let dir = freshDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let r = PyreonCrashReporter(directory: dir)
        r.breadcrumb("opened settings")
        r.persist(message: "TestCrash: boom", stack: "frame0", addresses: [0x1000, 0x2abc])
        let report = readReport(dir)

        expect(report["platform"] as? String == "macos" || report["platform"] as? String == "ios", "platform")
        expect(report["message"] as? String == "TestCrash: boom", "message")
        expect((report["breadcrumbs"] as? [String]) == ["opened settings"], "breadcrumbs array")
        let build = report["build"] as? [String: String] ?? [:]
        for key in ["appId", "version", "buildNumber"] {
            expect(build[key] != nil, "build.\(key) present")
        }
        expect(report["addresses"] as? [String] == ["0x1000", "0x2abc"], "addresses are hex strings")

        let image = report["image"] as? [String: String] ?? [:]
        let uuid = image["uuid"] ?? ""
        expect(UUID(uuidString: uuid) != nil, "image.uuid is a UUID: \(uuid)")
        expect((image["arch"] ?? "").isEmpty == false, "image.arch")
        // The name and load address must be dyld's own view of the executable.
        let exe = (CommandLine.arguments[0] as NSString).lastPathComponent
        expect(image["name"] == exe, "image.name is the executable (\(image["name"] ?? "") vs \(exe))")
        let load = UInt(String((image["loadAddress"] ?? "0x0").dropFirst(2)), radix: 16) ?? 0
        var found = false
        for i in 0..<_dyld_image_count() {
            if let h = _dyld_get_image_header(i), UInt(bitPattern: h) == load {
                found = h.pointee.filetype == UInt32(MH_EXECUTE)
            }
        }
        expect(found, "image.loadAddress is the MH_EXECUTE image's header")
    }

    static func recordErrorAddressesFallInsideTheMainImage() {
        let dir = freshDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        PyreonCrashReporter(directory: dir).recordError("manual")
        let report = readReport(dir)
        let image = report["image"] as? [String: String] ?? [:]
        let load = UInt(String((image["loadAddress"] ?? "0x0").dropFirst(2)), radix: 16) ?? 0
        let addresses = (report["addresses"] as? [String] ?? [])
            .compactMap { UInt(String($0.dropFirst(2)), radix: 16) }
        expect(addresses.count > 2, "recordError captured the return addresses")
        // This function's own frame is in the executable — so at least one
        // captured address lies past its load address (atos needs exactly
        // that pairing to resolve it).
        expect(addresses.contains { $0 > load && $0 < load + 0x1000_0000 }, "a frame lies inside the main image")
    }
}

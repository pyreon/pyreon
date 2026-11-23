// Fresh app state for UI tests.
//
// Every XCUITest in this app launches with `-PyreonUITestResetState` (the
// suites' `launchFresh()`), and the host wipes what an earlier launch stored
// before any view or store exists. A test then starts from the state of a fresh
// install, however the test before it ended: a run that failed half way, or a
// first attempt the CI retry is now repeating. Without it, a crash report
// recorded by a failed attempt made the retry read `hadCrash == true` before it
// had recorded anything (#4745).
//
// A test that has to prove persistence relaunches WITHOUT the argument
// (`relaunchKeepingState()`), so what the first launch stored is still there.
//
// What a fresh install has and this clears: the app's defaults domain, every
// file under Documents, Library (except Preferences, which belongs to
// cfprefsd and is cleared through the defaults API) and tmp, and every
// Keychain item the app can reach. The Keychain is the part an uninstall does
// NOT clear on iOS, so this is stricter than reinstalling.

import Foundation
import Security

enum UITestAppState {
    static let resetArgument = "-PyreonUITestResetState"

    /// Called from the App's `init`, before the first view or store is built.
    static func resetIfRequested(arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard arguments.contains(resetArgument) else { return }

        if let domain = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: domain)
        }

        let fm = FileManager.default
        let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
        for (dir, keep) in [("Documents", Set<String>()), ("Library", ["Preferences"]), ("tmp", Set<String>())] {
            let url = home.appendingPathComponent(dir, isDirectory: true)
            let entries = (try? fm.contentsOfDirectory(atPath: url.path)) ?? []
            for name in entries where !keep.contains(name) {
                try? fm.removeItem(at: url.appendingPathComponent(name))
            }
        }

        for itemClass in [kSecClassGenericPassword, kSecClassInternetPassword, kSecClassKey, kSecClassCertificate, kSecClassIdentity] {
            SecItemDelete([kSecClass as String: itemClass] as CFDictionary)
        }
    }
}

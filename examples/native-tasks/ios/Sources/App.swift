// @main entry point for the Pyreon iOS tasks showcase.
//
// SwiftUI's `@main App` protocol is the canonical iOS 14+ app entry.
// Mirror of `examples/native-router-demo-ios/ios/App.swift` — same
// minimal SwiftUI shell, different app name + content view.

import SwiftUI

@main
struct PyreonTasksApp: App {
    init() {
        // `-PyreonUITestCrashOnSignal` (UI tests only): the crash-capture proof (CRA-3) needs an uncaught
        // NSException raised while the app's own crash reporter is running, at a moment the test chooses. The
        // test posts a Darwin notification across the process boundary; the host raises on it.
        if ProcessInfo.processInfo.arguments.contains("-PyreonUITestCrashOnSignal") {
            PyreonUITestCrashTrigger.install()
        }
    }

    var body: some Scene {
        WindowGroup {
            // `-PyreonUITestDarkAppearance` (UI tests only) runs the app in dark appearance: it sets the window's
            // style, so SwiftUI's `colorScheme` environment — what `useMediaQuery('(prefers-color-scheme: dark)')`
            // reads — becomes `.dark`. Switching the simulator from inside a test (`XCUIDevice.appearance`) did not
            // reliably reach the app on CI's simulator, which also pins the device to light.
            if ProcessInfo.processInfo.arguments.contains("-PyreonUITestDarkAppearance") {
                ContentView().preferredColorScheme(.dark)
            } else {
                ContentView()
            }
        }
    }
}

/// Raises an uncaught `NSException` when the UI test posts `com.pyreon.tasks.uitest.crash` (CRA-3). Installed only
/// under `-PyreonUITestCrashOnSignal`, so a normal launch has no way to crash itself.
enum PyreonUITestCrashTrigger {
    static let name = "com.pyreon.tasks.uitest.crash" as CFString

    static func install() {
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(), nil,
            { _, _, _, _, _ in
                DispatchQueue.main.async {
                    NSException(
                        name: NSExceptionName("PyreonCrashProof"),
                        reason: "raised by the UI test, uncaught",
                        userInfo: nil
                    ).raise()
                }
            },
            name, nil, .deliverImmediately)
    }
}

// The platform halves of `useWakeLock`, `useDeviceInfo`, `useCamera`,
// `useBluetooth`, `useAudioRecorder`, `useSpeech` and `useDeviceMotion` on iOS —
// `UIKitIdleTimer`, `UIKitDeviceProbe`, `UIKitCameraPresenter`,
// `CoreBluetoothScanner`, `AVFoundationRecordingEngine`, `AVSpeechSynth` and
// `CoreMotionSource`, named by the SwiftUI emit.
//
// Own file so the hook state machines (`PyreonWakeLock.swift` …) stay
// UIKit-free (they compile and run on Linux under the stub gate); each half
// here is guarded by `canImport` of the framework it wraps.
//
// ## Why these exist
//
// The emit named all seven but they existed only in `swift-stubs.ts`, so an
// app using any of the hooks could not compile against the real SDK while
// every stub-based gate stayed green.
//
// ## Permissions
//
// The protocols are synchronous, and an iOS permission prompt is not. The
// engines that need one (microphone, camera, Bluetooth) ask the system and
// report the ordinary "denied" outcome for THIS call; the next call, after the
// user has answered, succeeds — the same fire-and-check contract the Android
// engines use, and the same way the web arm surfaces a denial (a branch, never
// a throw). The app must declare the usage strings in its Info.plist:
// `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`,
// `NSBluetoothAlwaysUsageDescription`.

import Foundation

#if canImport(UIKit)
import UIKit

@MainActor
private func pyreonForegroundScene() -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
}

// MARK: - Wake lock

/// `UIApplication.isIdleTimerDisabled`. Survives backgrounding, which the web
/// arm re-acquires on `visibilitychange` to reach.
public final class UIKitIdleTimer: IdleTimerController {
    public init() {}

    public var isSupported: Bool { true }

    public func setIdleTimerDisabled(_ disabled: Bool) {
        MainActor.assumeIsolated {
            UIApplication.shared.isIdleTimerDisabled = disabled
        }
    }
}

// MARK: - Device info

/// Hardware identifier (`iPhone16,1`; the Simulator reports the simulated
/// model), system version, touch capability and the screen in points with its
/// backing scale. Read through on every access so a rotation is reflected.
public final class UIKitDeviceProbe: DeviceProbe {
    public init() {}

    public var model: String {
        if let sim = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !sim.isEmpty {
            return sim
        }
        var info = utsname()
        uname(&info)
        return withUnsafePointer(to: &info.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: Int(_SYS_NAMELEN)) { String(cString: $0) }
        }
    }

    public var osVersion: String {
        MainActor.assumeIsolated { UIDevice.current.systemVersion }
    }

    /// Every UIKit device has a touch screen.
    public var isTouch: Bool { true }

    public var screen: PyreonDeviceScreen {
        MainActor.assumeIsolated {
            guard let s = pyreonForegroundScene()?.screen else {
                return PyreonDeviceScreen(width: 0, height: 0, scale: 1)
            }
            return PyreonDeviceScreen(
                width: Double(s.bounds.width), height: Double(s.bounds.height), scale: Double(s.scale))
        }
    }
}

// MARK: - Camera

/// The system camera through `UIImagePickerController(.camera)`. Calls back
/// with a `file://` URL of the captured JPEG in the temp directory, or nil on
/// cancel / no camera / a denied permission (the system shows the prompt on
/// first present). Needs `NSCameraUsageDescription`.
public final class UIKitCameraPresenter: CameraPresenter {
    public init() {}

    public var isAvailable: Bool {
        MainActor.assumeIsolated { UIImagePickerController.isSourceTypeAvailable(.camera) }
    }

    public func present(_ completion: @escaping (String?) -> Void) {
        _Concurrency.Task { @MainActor in
            guard UIImagePickerController.isSourceTypeAvailable(.camera),
                var top = pyreonForegroundScene()?.windows.first(where: { $0.isKeyWindow })?.rootViewController
            else {
                completion(nil)
                return
            }
            while let presented = top.presentedViewController { top = presented }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            let delegate = PyreonCameraDelegate(completion)
            // The picker holds its delegate weakly; park it on the picker so it
            // lives exactly as long as the presentation.
            picker.delegate = delegate
            objc_setAssociatedObject(picker, &PyreonCameraDelegate.key, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            top.present(picker, animated: true)
        }
    }
}

private final class PyreonCameraDelegate: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    nonisolated(unsafe) static var key: UInt8 = 0
    private var completion: ((String?) -> Void)?

    init(_ completion: @escaping (String?) -> Void) { self.completion = completion }

    private func finish(_ uri: String?) {
        // A delegate that fires twice must not call back twice.
        let c = completion
        completion = nil
        c?(uri)
    }

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        picker.dismiss(animated: true)
        guard let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.9) else {
            finish(nil)
            return
        }
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("pyreon-\(UUID().uuidString).jpg")
        do {
            try data.write(to: url)
            finish(url.absoluteString)
        } catch {
            finish(nil)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        finish(nil)
    }
}
#endif

#if canImport(CoreBluetooth)
import CoreBluetooth

// MARK: - Bluetooth

/// BLE discovery through `CBCentralManager`. Discovery only, like every target
/// of `useBluetooth`. The manager is created LAZILY on the first scan —
/// constructing it is what triggers the system permission prompt, and a screen
/// that merely mounts the hook must not ask. Needs
/// `NSBluetoothAlwaysUsageDescription`.
public final class CoreBluetoothScanner: NSObject, BluetoothScanner, CBCentralManagerDelegate {
    private var manager: CBCentralManager?
    private var onDevice: ((PyreonBluetoothDevice) -> Void)?
    private var onError: ((String) -> Void)?
    private var wantsScan = false

    public override init() { super.init() }

    /// False once the OS reports there is no usable radio, or the app is
    /// restricted from Bluetooth. Before the first scan there is nothing to
    /// ask, so it reports true (the truthful answer arrives with the state).
    public var isAvailable: Bool {
        if CBCentralManager.authorization == .restricted { return false }
        guard let m = manager else { return true }
        return m.state != .unsupported
    }

    public func startScan(
        onDevice: @escaping (PyreonBluetoothDevice) -> Void,
        onError: @escaping (String) -> Void
    ) {
        self.onDevice = onDevice
        self.onError = onError
        wantsScan = true
        if let m = manager {
            handle(m.state)
        } else {
            // The state callback fires once the manager is ready (after the
            // permission prompt, on first use).
            manager = CBCentralManager(delegate: self, queue: nil)
        }
    }

    public func stopScan() {
        wantsScan = false
        manager?.stopScan()
    }

    private func handle(_ state: CBManagerState) {
        guard wantsScan else { return }
        switch state {
        case .poweredOn:
            manager?.scanForPeripherals(withServices: nil, options: nil)
        case .unauthorized:
            fail("Bluetooth permission was denied")
        case .poweredOff:
            fail("Bluetooth is turned off")
        case .unsupported:
            fail("Bluetooth is not available on this platform")
        default:
            break // .unknown / .resetting: a later state callback decides
        }
    }

    private func fail(_ message: String) {
        wantsScan = false
        onError?(message)
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        handle(central.state)
    }

    public func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name ?? ""
        onDevice?(PyreonBluetoothDevice(id: peripheral.identifier.uuidString, name: name))
    }
}
#endif

#if canImport(AVFoundation)
import AVFoundation

// MARK: - Audio recording

/// `AVAudioRecorder` capturing AAC in an MPEG-4 container into the temp
/// directory; `end()` returns the `file://` URL of the finished recording.
/// `begin()` returns false while microphone permission is undetermined (it asks)
/// or denied. Needs `NSMicrophoneUsageDescription`.
public final class AVFoundationRecordingEngine: RecordingEngine {
    private var recorder: AVAudioRecorder?

    public init() {}

    public var isAvailable: Bool {
        #if os(iOS)
        return AVAudioSession.sharedInstance().isInputAvailable
        #else
        return false
        #endif
    }

    public func begin() -> Bool {
        #if os(iOS)
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            break
        case .undetermined:
            AVAudioApplication.requestRecordPermission { _ in }
            return false
        default:
            return false
        }
        release()
        let session = AVAudioSession.sharedInstance()
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("pyreon-rec-\(UUID().uuidString).m4a")
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let r = try AVAudioRecorder(
                url: url,
                settings: [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44_100,
                    AVNumberOfChannelsKey: 1,
                ])
            guard r.record() else {
                try? session.setActive(false, options: .notifyOthersOnDeactivation)
                return false
            }
            recorder = r
            return true
        } catch {
            return false
        }
        #else
        return false
        #endif
    }

    public func end() -> String? {
        guard let r = recorder else { return nil }
        let url = r.url
        r.stop()
        recorder = nil
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        guard size > 0 else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return url.absoluteString
    }

    /// Releasing the session is what turns the OS recording indicator off.
    public func release() {
        if let r = recorder {
            r.stop()
            try? FileManager.default.removeItem(at: r.url)
        }
        recorder = nil
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
}

// MARK: - Speech

/// `AVSpeechSynthesizer` with the default voice for the current locale.
public final class AVSpeechSynth: SpeechSynth {
    private let synth = AVSpeechSynthesizer()

    public init() {}

    public var isAvailable: Bool { true }

    public func speak(_ text: String) {
        synth.speak(AVSpeechUtterance(string: text))
    }

    public func cancel() {
        synth.stopSpeaking(at: .immediate)
    }
}
#endif

#if canImport(CoreMotion)
import CoreMotion

// MARK: - Device motion

/// `CMMotionManager` device-motion updates paired into one
/// `(acceleration, rotation)` sample. Units follow the web arm exactly:
/// acceleration in m/s² INCLUDING gravity with the W3C sign (resting face-up
/// reads z ≈ +9.81 — CoreMotion reports gravity as a vector pointing DOWN and
/// user acceleration as the acceleration imparted, so the accelerometer's
/// specific force is `(user - gravity) * g`), rotation in deg/s about x/y/z.
/// The Simulator has no motion hardware, so it reports unavailable there.
public final class CoreMotionSource: MotionSource {
    private let manager = CMMotionManager()

    public init() {}

    public var isAvailable: Bool { manager.isDeviceMotionAvailable }

    public func begin(_ onSample: @escaping (PyreonVec3, PyreonVec3) -> Void) -> Bool {
        guard manager.isDeviceMotionAvailable else { return false }
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        let g = 9.80665
        manager.startDeviceMotionUpdates(to: .main) { motion, _ in
            guard let m = motion else { return }
            let accel = PyreonVec3(
                x: (m.userAcceleration.x - m.gravity.x) * g,
                y: (m.userAcceleration.y - m.gravity.y) * g,
                z: (m.userAcceleration.z - m.gravity.z) * g)
            let deg = 180.0 / Double.pi
            let rot = PyreonVec3(
                x: m.rotationRate.x * deg, y: m.rotationRate.y * deg, z: m.rotationRate.z * deg)
            onSample(accel, rot)
        }
        return true
    }

    public func end() {
        manager.stopDeviceMotionUpdates()
    }
}
#endif

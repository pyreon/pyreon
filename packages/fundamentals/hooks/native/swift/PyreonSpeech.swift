// PyreonSpeech — the AVSpeechSynthesizer side of `@pyreon/hooks`' useSpeech.
//
// Rate, pitch and voice selection are out of scope: the three platforms
// disagree on their ranges and on how voices are identified, so one name
// would mean three different things. Plain speech is what crosses.
//
// The synthesiser is injected so the state machine is testable with no
// AVFoundation and no audio device.

import Foundation
import Observation

/// The platform half. Swapped for a fake in tests.
public protocol SpeechSynth: AnyObject {
    var isAvailable: Bool { get }
    func speak(_ text: String)
    func cancel()
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonSpeech {
    public private(set) var speaking: Bool = false
    private let synth: SpeechSynth

    public var supported: Bool { synth.isAvailable }

    public init(synth: SpeechSynth) {
        self.synth = synth
    }

    @discardableResult
    public func speak(_ text: String) -> Bool {
        guard synth.isAvailable, !text.isEmpty else { return false }
        // Cancel first — queueing is the platform default, so a second press
        // would otherwise talk over itself rather than replacing.
        synth.cancel()
        synth.speak(text)
        speaking = true
        return true
    }

    public func stop() {
        synth.cancel()
        speaking = false
    }

    deinit {
        // Speech outliving its view talks over the next screen.
        synth.cancel()
    }
}

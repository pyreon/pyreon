// PyreonSyncTransport — the iOS-native equivalent of @pyreon/sync's web
// `connectPyreonSync(doc, channel)`. Wires a `PyreonCrdtDoc` to a peer over a
// string-duplex `PyreonSyncChannel` (a WebSocket, a WebView postMessage bridge,
// an in-memory pair for tests) so two devices editing the same document CONVERGE
// in real time.
//
// Wire format + semantics are IDENTICAL to the web transport (so an iOS peer
// converges with a web and an Android peer): on open a peer sends its FULL state
// (each register carries its own (clock, actor) stamp, so a state dump merges
// convergently in any order); thereafter it relays only its LOCAL ops. Inbound
// messages are merged via `applyMessage`, which fires observers but emits NO ops
// — so echo-prevention is STRUCTURAL, not a re-entrancy flag: an applied remote
// op can never re-broadcast (`onLocalOps` fires only from `set()`).
//
// Foundation-only (no SwiftUI / Observation import) so it compiles standalone and
// unit-tests headlessly, mirroring PyreonCrdt.swift.

import Foundation

/// The minimal string-duplex a transport binding provides.
public protocol PyreonSyncChannel: AnyObject {
  func send(_ data: String)
  func onMessage(_ cb: @escaping (String) -> Void)
  /// Fires when the channel is ready to send. Fire immediately if already open.
  func onOpen(_ cb: @escaping () -> Void)
  func close()
}

/// Relays a `PyreonCrdtDoc`'s local ops to a peer over `channel`, and merges the
/// peer's ops back in. Construct one per (doc, channel) pair; `dispose()` detaches
/// ONLY this transport's hook + closes the channel — the shared doc survives.
public final class PyreonSyncTransport {
  private let doc: PyreonCrdtDoc
  private let channel: PyreonSyncChannel
  private var disposed = false

  public init(doc: PyreonCrdtDoc, channel: PyreonSyncChannel) {
    self.doc = doc
    self.channel = channel

    // Register inbound + outbound BEFORE onOpen so everything is live when the
    // open callback fires (a channel may fire onOpen synchronously if already
    // open). `[weak self]` is load-bearing: `onLocalOps` is stored ON the doc,
    // so a strong `self` capture would create a doc → closure → doc retain
    // cycle. Capture weakly and route through self.
    channel.onMessage { [weak self] data in
      guard let self, !self.disposed else { return }
      self.doc.applyMessage(data) // emits no ops → no echo (structural)
    }
    doc.onLocalOps = { [weak self] ops in
      guard let self, !self.disposed else { return }
      self.channel.send(self.doc.encodeMessage(ops))
    }
    channel.onOpen { [weak self] in
      guard let self, !self.disposed else { return }
      self.channel.send(self.doc.encodeMessage(self.doc.encodeState())) // initial full-state sync
    }
  }

  /// Idempotent. Detaches ONLY this transport's `onLocalOps` hook and closes the
  /// channel — never touches the shared doc's state.
  public func dispose() {
    if disposed { return }
    disposed = true
    doc.onLocalOps = nil
    channel.close()
  }

  deinit { dispose() }
}

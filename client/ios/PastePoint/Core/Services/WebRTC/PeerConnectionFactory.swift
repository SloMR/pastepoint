//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
@preconcurrency import WebRTC

// `@unchecked Sendable`: the wrapped `RTCPeerConnectionFactory` is internally
// thread-safe (libwebrtc handles its own locking), and our only stored property
// is `let factory`. Safe to share across actors.
final nonisolated class PeerConnectionFactory: @unchecked Sendable {
  static let shared = PeerConnectionFactory()

  private let factory: RTCPeerConnectionFactory

  private init() {
    RTCInitializeSSL()
    factory = RTCPeerConnectionFactory(encoderFactory: nil, decoderFactory: nil)
  }

  func makePeerConnection(
    iceServers: [RTCIceServer],
    delegate: RTCPeerConnectionDelegate,
  ) async -> RTCPeerConnection? {
    await WebRTCQueue.run {
      let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
      return self.factory.peerConnection(
        with: WebRTCConfig.makeConfiguration(iceServers: iceServers),
        constraints: constraints,
        delegate: delegate,
      )
    }
  }
}

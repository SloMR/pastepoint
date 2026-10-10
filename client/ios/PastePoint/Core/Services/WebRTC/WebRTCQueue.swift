//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
@preconcurrency import WebRTC

/// libwebrtc blocks the caller until its signaling thread is free, so every call goes through this queue instead of the main actor.
nonisolated enum WebRTCQueue {
  private static let queue = DispatchQueue(label: "com.pastepoint.webrtc", qos: .userInitiated)

  private struct NoDescriptionError: LocalizedError {
    var errorDescription: String? { "WebRTC created no offer or answer and gave no error" }
  }

  static func run<T>(_ work: @escaping @Sendable () -> T) async -> T {
    await withCheckedContinuation { continuation in
      queue.async { continuation.resume(returning: work()) }
    }
  }

  static func makeDataChannel(on pc: RTCPeerConnection, label: String) async -> RTCDataChannel? {
    await run { pc.dataChannel(forLabel: label, configuration: WebRTCConfig.dataChannelConfig) }
  }

  /// Creates an offer or an answer, sets it as the local description and returns its SDP.
  static func makeLocalDescription(_ type: RTCSdpType, on pc: RTCPeerConnection) async throws -> String {
    let sdp: String = try await withCheckedThrowingContinuation { continuation in
      queue.async {
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let completion: @Sendable (RTCSessionDescription?, Error?) -> Void = { description, error in
          if let description {
            continuation.resume(returning: description.sdp)
          } else {
            continuation.resume(throwing: error ?? NoDescriptionError())
          }
        }

        if type == .answer {
          pc.answer(for: constraints, completionHandler: completion)
        } else {
          pc.offer(for: constraints, completionHandler: completion)
        }
      }
    }

    try await perform { done in
      pc.setLocalDescription(RTCSessionDescription(type: type, sdp: sdp), completionHandler: done)
    }
    return sdp
  }

  static func setRemoteDescription(_ type: RTCSdpType, sdp: String, on pc: RTCPeerConnection) async throws {
    try await perform { done in
      pc.setRemoteDescription(RTCSessionDescription(type: type, sdp: sdp), completionHandler: done)
    }
  }

  static func send(_ data: Data, on channel: RTCDataChannel) {
    queue.async {
      if !channel.sendData(RTCDataBuffer(data: data, isBinary: false)) {
        log.warning("data channel refused a frame")
      }
    }
  }

  static func sendChunk(_ data: Data, on channel: RTCDataChannel) async -> Bool {
    await run {
      guard channel.bufferedAmount < WebRTCConfig.maxBufferedAmount else { return false }
      return channel.sendData(RTCDataBuffer(data: data, isBinary: true))
    }
  }

  static func add(_ candidate: RTCIceCandidate, to pc: RTCPeerConnection) async throws {
    try await perform { done in
      pc.add(candidate, completionHandler: done)
    }
  }

  static func states(of pc: RTCPeerConnection) async -> (peer: RTCPeerConnectionState, ice: RTCIceConnectionState) {
    await run { (pc.connectionState, pc.iceConnectionState) }
  }

  static func close(_ pc: RTCPeerConnection?, channel: RTCDataChannel?) {
    queue.async {
      channel?.close()
      pc?.close()
    }
  }

  private static func perform(_ call: @escaping @Sendable (@escaping @Sendable (Error?) -> Void) -> Void) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      queue.async {
        call { error in
          if let error {
            continuation.resume(throwing: error)
          } else {
            continuation.resume()
          }
        }
      }
    }
  }
}

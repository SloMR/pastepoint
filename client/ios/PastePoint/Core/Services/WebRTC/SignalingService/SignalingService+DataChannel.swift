//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Combine
import Foundation
import WebRTC

// MARK: - Data Channel Send

extension SignalingService {

  /// Send a chat message to every open data channel.
  /// Returns the list of peers it actually reached.
  @discardableResult
  func broadcastChat(_ message: ChatMessage) -> [String] {
#if DEBUG
    if AppBuildInfo.isXcodePreview {
      return peerDirectory.peers
    }
#endif

    guard let data = encodeChatForWire(message) else { return [] }

    return Array(connectedPeers.union(connectingPeers)).filter {
      send(data, to: $0)
    }
  }

  /// Transport hook: send a pre-encoded data-channel envelope to one peer.
  /// Returns false if the channel is closed or back-pressured.
  /// Called by services that build their own envelopes (e.g. `FileTransferService`).
  func send(_ data: Data, to peer: String, isBinary: Bool = false) -> Bool {
    // The channel can open before the flush runs. Keep queueing until the queue is
    // drained, or a frame sent in that window arrives ahead of older ones.
    if !isBinary, pendingMessages[peer] != nil {
      return enqueue(data, for: peer)
    }

    // `connectedPeers` follows the channel's open state, so no blocking `readyState` read here.
    guard let channel = dataChannels[peer], connectedPeers.contains(peer) else {
      // Chunks are never queued; they only flow after an accept on an open channel.
      if !isBinary, connectingPeers.contains(peer) {
        return enqueue(data, for: peer)
      }
      log.warning("no open channel to peer")
      return false
    }

    guard !isBinary || channel.bufferedAmount < WebRTCConfig.maxBufferedAmount else {
      log.debug("channel to \(peer) back-pressured (\(channel.bufferedAmount) bytes)")
      return false
    }

    return channel.sendData(RTCDataBuffer(data: data, isBinary: isBinary))
  }

  /// Holds a frame for a connecting peer; false once full, so a peer that never
  /// opens reports failure instead of swallowing everything silently.
  private func enqueue(_ data: Data, for peer: String) -> Bool {
    var queued = pendingMessages[peer] ?? []
    guard queued.count < Self.maxPendingMessages else {
      log.warning("pending queue full, dropping frame")
      return false
    }

    queued.append(data)
    pendingMessages[peer] = queued
    log.info("queued frame (pending: \(queued.count))")
    return true
  }

  /// Abandons anything queued for a peer we will not reach. Announced so services
  /// holding state on those frames (a file offer waiting to go out) can fail it,
  /// and so frames can never flush to a later peer that reuses the random name.
  func discardPending(for peer: String) {
    let dropped = pendingMessages.removeValue(forKey: peer)?.count ?? 0
    if dropped > 0 {
      log.warning("discarded \(dropped) queued frames for unreachable peer")
    }
    peerUnreachable.send(peer)
  }

  /// Drains the queue in order; removed first so a closed channel re-queues.
  private func flushPendingMessages(to peer: String) {
    guard let queued = pendingMessages.removeValue(forKey: peer), !queued.isEmpty else { return }

    for data in queued {
      _ = send(data, to: peer)
    }
    log.info("flushed \(queued.count) queued frames")
  }

  private func encodeChatForWire(_ chat: ChatMessage) -> Data? {
    do {
      return try DataChannelMessage.encodeChat(chat)
    } catch {
      log.error("encodeChat failed: \(error)")
      return nil
    }
  }
}

// MARK: - RTCDataChannelDelegate

extension SignalingService: RTCDataChannelDelegate {

  nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
    let dataChannelID = ObjectIdentifier(dataChannel)
    let state = dataChannel.readyState

    Task { @MainActor [weak self] in
      guard let self else { return }

      guard let peer = self.peer(forChannelID: dataChannelID) else {
        log.debug("unknown channel (already closed)")
        return
      }

      switch state {
      case .open:
        handleChannelOpened(peer)
      case .closed:
        self.connectedPeers.remove(peer)
        self.connectionLocks.remove(peer)
        log.info("disconnected from peer")
        self.scheduleReconnect(to: peer)
      case .connecting:
        log.info("connecting to peer")
      case .closing:
        log.info("closing connection to peer")
      @unknown default:
        break
      }

    }
  }

  func handleChannelOpened(_ peer: String) {
    guard !connectedPeers.contains(peer) else { return }

    connectedPeers.insert(peer)
    connectingPeers.remove(peer)
    connectionLocks.remove(peer)
    reconnectAttempts[peer] = nil

    clearConnectionTimeout(for: peer)
    flushPendingMessages(to: peer)

    finishConnectSpanAsSuccess(peer)
    telemetry.event("mesh.peer_connected", attributes: [
      "room_size": peerDirectory.peers.count + 1,
      "is_private": wsService.currentSessionCode != nil,
    ])

    log.info("connected to peer")
  }

  nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
    let dataChannelID = ObjectIdentifier(dataChannel)
    let bytes = buffer.data
    let isBinary = buffer.isBinary

    Task { @MainActor [weak self] in
      guard let self else { return }

      guard let peer = self.peer(forChannelID: dataChannelID) else {
        log.warning("unknown channel")
        return
      }

      if isBinary {
        guard let parsed = BinaryChunk.decode(bytes) else {
          log.warning("dropped malformed binary chunk")
          telemetry.breadcrumb(category: "webrtc.datachannel", message: "chunk decode failed", level: .error)
          return
        }

        self.chunkReceived.send((parsed, from: peer))
        return
      }

      do {
        let decoded = try DataChannelMessage.decode(bytes)
        self.route(decoded, from: peer)
      } catch {
        log.warning("dropping a data-channel message that failed to decode")
      }
    }
  }

  private func route(_ decoded: DataChannelMessage.Decoded, from peer: String) {
    guard !blockService.isBlocked(peer) else {
      log.info("dropping data-channel message from blocked peer")
      return
    }

    switch decoded {
    case .chat(let msg):
      telemetry.event("chat.message_received")
      chatMessages.send(ChatMessage(from: peer, text: msg.text, timestamp: msg.timestamp))
    case .fileOffer(let payload): fileEvent.send(.offer(payload, from: peer))
    case .fileAccept(let payload): fileEvent.send(.accept(payload, from: peer))
    case .fileDecline(let payload): fileEvent.send(.decline(payload, from: peer))
    case .fileCancelUpload(let payload): fileEvent.send(.cancelUpload(payload, from: peer))
    case .fileCancelDownload(let payload): fileEvent.send(.cancelDownload(payload, from: peer))
    case .fileReceived(let payload): fileEvent.send(.received(payload, from: peer))
    case .unknown: log.warning("dropping a data-channel message of unknown type")
    }
  }

  nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didChangeBufferedAmount amount: UInt64) {
    let dataChannelID = ObjectIdentifier(dataChannel)
    let currentBuffered = dataChannel.bufferedAmount

    Task { @MainActor [weak self] in
      guard let self else { return }
      guard let peer = self.peer(forChannelID: dataChannelID) else { return }

      if currentBuffered < WebRTCConfig.bufferedAmountLowThreshold {
        self.bufferedAmountLow.send(peer)
      }
    }
  }
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Combine
import Foundation

@MainActor
final class FileTransferService: ObservableObject {
  let signalingService: SignalingService
  let userService: UserService

  @Published var activeUploads: [FileUpload] = []
  @Published var incomingFileOffers: [FileDownload] = []
  var activeDownloads: [FileDownload] = []

  let attachmentMessages = PassthroughSubject<ChatMessage, Never>()
  let outgoingAttachment = PassthroughSubject<ChatMessage, Never>()
  let downloadCompleted = PassthroughSubject<(fileId: String, fileURL: URL?), Never>()
  let uploadBatchStatus = PassthroughSubject<UploadBatchStatus, Never>()
  let attachmentPreviewUpdated = PassthroughSubject<(fileId: String, previewDataUrl: String, previewMime: String?), Never>()
  let fileTransferCancelled = PassthroughSubject<String, Never>()
  let fileTransferFailed = PassthroughSubject<(fileId: String, reason: FileTransferFailureReason), Never>()

  var uploadTasks: [String: Task<Void, Never>] = [:]
  var offerTasks: [String: Task<Void, Never>] = [:]
  var uploadBatches: [String: UploadBatch] = [:]
  var fileHashTasks: [URL: Task<String?, Never>] = [:]

  let downloadStallTimeout: TimeInterval = 30
  var stallWatchdog: Task<Void, Never>?
  var pendingChunkIndices: [String: Set<Int>] = [:]
  var lastDownloadFlush = Date.distantPast
  var receiveSpans: [String: TelemetrySpan] = [:]

  private var knownPeers: Set<String> = []
  private var cancellables: Set<AnyCancellable> = []

  // MARK: - Init

  init(signalingService: SignalingService, userService: UserService, peerDirectory: PeerDirectory) {
    self.signalingService = signalingService
    self.userService = userService
    Self.removeLeftoverDownloadFiles()

    signalingService.fileEvent
      .sink { [weak self] event in
        Task { @MainActor in
          self?.handleFileEvent(event)
        }
      }
      .store(in: &cancellables)

    signalingService.chunkReceived
      .sink { [weak self] parsed, from in
        Task { @MainActor in
          await self?.handleChunk(parsed, from: from)
        }
      }
      .store(in: &cancellables)

    peerDirectory.$peers
      .sink { [weak self] peers in
        Task { @MainActor in
          self?.reconcilePeers(peers)
        }
      }
      .store(in: &cancellables)

    signalingService.peerUnreachable
      .sink { [weak self] peer in
        Task { @MainActor in
          self?.purgeTransfers(for: peer)
        }
      }
      .store(in: &cancellables)
  }

  // MARK: - File Events

  func handleFileEvent(_ event: FileChannelEvent) {
    switch event {
    case .offer(let payload, let from):
      receiveFileOffer(payload: payload, from: from)
    case .accept(let payload, let from):
      handleFileAccept(payload: payload, from: from)
    case .received(let payload, let from):
      handleFileReceived(payload: payload, from: from)
    case .decline(let payload, let from):
      handleFileDecline(fileId: payload.fileId, from: from)
    case .cancelDownload(let payload, let from):
      handleFileDownloadCancellation(fileId: payload.fileId, from: from)
    case .cancelUpload(let payload, let from):
      handleFileUploadCancellation(fileId: payload.fileId, from: from)
    }
  }

  // MARK: - Peer Lifecycle

  private func reconcilePeers(_ current: [String]) {
    let currentSet = Set(current)
    let departed = knownPeers.subtracting(current)

    knownPeers = currentSet
    for peer in departed {
      purgeTransfers(for: peer)
    }
  }

  private func purgeTransfers(for peer: String, cancelledBy: CancelledBy = .peerLeft) {
    // Uploads to this peer — stop send loops, no notify (peer is gone).
    let uploadIds = activeUploads.filter { $0.targetUser == peer }.map(\.id)
    for fileId in uploadIds {
      stopFileUpload(targetUser: peer, fileId: fileId, notifyRecipient: false)
    }

    // Downloads from this peer — drop in-flight state + scratch, flip bubble.
    let downloadIds = activeDownloads.filter { $0.fromUser == peer }.map(\.id)
    for fileId in downloadIds {
      cleanupDownload(fileId: fileId, fromUser: peer, outcome: .cancelled, attributes: ["cancelled_by": cancelledBy.rawValue])
      fileTransferCancelled.send(fileId)
    }

    // Pending offers never accepted.
    let offerIds = incomingFileOffers.filter { $0.fromUser == peer }.map(\.id)
    incomingFileOffers.removeAll { $0.fromUser == peer }
    for fileId in offerIds {
      fileTransferCancelled.send(fileId)
    }
  }

  func cancelAllTransfers() {
    let peers = Set(activeUploads.map(\.targetUser))
      .union(activeDownloads.map(\.fromUser))
      .union(incomingFileOffers.map(\.fromUser))
    for peer in peers {
      purgeTransfers(for: peer, cancelledBy: .receiver)
    }
  }
}

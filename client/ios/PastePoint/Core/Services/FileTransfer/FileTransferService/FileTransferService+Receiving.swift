//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Combine
import Foundation

// MARK: - Receiving

extension FileTransferService {

  // MARK: Offer

  func receiveFileOffer(payload: FileOfferPayload, from peer: String) {
    if let i = incomingFileOffers.firstIndex(where: { $0.id == payload.fileId }) {
      if let hash = payload.fileHash, incomingFileOffers[i].expectedHash == nil {
        incomingFileOffers[i].expectedHash = hash
        log.info("merged hash into pending offer \(payload.fileId)")
      }

      if
        let preview = payload.previewDataUrl,
        let previewMime = payload.previewMime,
        incomingFileOffers[i].previewDataUrl == nil
      {
        incomingFileOffers[i].previewDataUrl = preview

        attachmentPreviewUpdated.send((fileId: payload.fileId, previewDataUrl: preview, previewMime: previewMime))
        log.info("merged preview into pending offer \(payload.fileId)")
      }
      return
    }

    if let i = activeDownloads.firstIndex(where: { $0.id == payload.fileId && $0.fromUser == peer }) {
      if let hash = payload.fileHash, activeDownloads[i].expectedHash == nil {
        activeDownloads[i].expectedHash = hash
        log.info("merged hash into accepted download \(payload.fileId)")
      }

      if
        let preview = payload.previewDataUrl,
        let previewMime = payload.previewMime,
        activeDownloads[i].previewDataUrl == nil
      {
        activeDownloads[i].previewDataUrl = preview

        attachmentPreviewUpdated.send((fileId: payload.fileId, previewDataUrl: preview, previewMime: previewMime))
        log.info("merged preview into accepted download \(payload.fileId)")
      }
      return
    }

    if incomingFileOffers.count(where: { $0.fromUser == peer }) >= FileTransferValidation.maxPendingOffersPerPeer {
      log.warning("declining: too many pending offers from one peer")
      if let data = try? DataChannelMessage.encodeFileDecline(FileDeclinePayload(fileId: payload.fileId)) {
        _ = signalingService.send(data, to: peer)
      }
      return
    }

    let fileName = FileTransferValidation.sanitizedFileName(payload.fileName)
    let download = FileDownload(
      id: payload.fileId,
      fileName: fileName,
      fileSize: payload.fileSize,
      fromUser: peer,
      totalChunks: 0,
      receivedSize: 0,
      receivedChunkURLs: [:],
      lastActivityAt: Date(),
      progress: 0,
      expectedHash: payload.fileHash,
      previewDataUrl: payload.previewDataUrl,
    )
    incomingFileOffers.append(download)

    let fileTransfer = FileTransferData(
      fileId: payload.fileId,
      fileName: fileName,
      fileSize: payload.fileSize,
      fromUser: peer,
      status: .pending,
      previewDataUrl: payload.previewDataUrl,
      previewMime: payload.previewMime,
    )
    let message = ChatMessage(
      from: peer,
      text: fileName,
      type: .attachment,
      fileTransfer: fileTransfer,
    )

    attachmentMessages.send(message)
    log.info("received file-offer: \(payload.fileId)")
  }

  @discardableResult
  func acceptFileOffer(fromUser: String, fileId: String) async -> Bool {
    guard let idx = incomingFileOffers.firstIndex(where: { $0.id == fileId }) else {
      log.warning("no offer for \(fileId)")
      return false
    }

    let data: Data
    do {
      data = try DataChannelMessage.encodeFileAccept(FileAcceptPayload(fileId: fileId))
    } catch {
      log.error("encodeFileAccept failed: \(error)")
      return false
    }

    let uploader = fromUser
    guard signalingService.send(data, to: uploader) else {
      log.warning("send failed for file-accept \(fileId)")
      return false
    }

    var download = incomingFileOffers.remove(at: idx)
    download.lastActivityAt = Date()
    objectWillChange.send()
    activeDownloads.append(download)
    startStallWatchdog()

    log.info("file-accept sent: \(fileId)")
    telemetry.event("file.offer_accepted", attributes: ["file_size_bytes": Int(download.fileSize)])
    return true
  }

  @discardableResult
  func declineFileOffer(fromUser: String, fileId: String) async -> Bool {
    guard let idx = incomingFileOffers.firstIndex(where: { $0.id == fileId }) else {
      log.warning("no offer for \(fileId)")
      return false
    }

    let data: Data
    do {
      data = try DataChannelMessage.encodeFileDecline(FileDeclinePayload(fileId: fileId))
    } catch {
      log.error("encodeFileDecline failed: \(error)")
      return false
    }

    let uploader = fromUser
    guard signalingService.send(data, to: uploader) else {
      log.warning("send failed for file-decline \(fileId)")
      return false
    }

    incomingFileOffers.remove(at: idx)
    log.info("file-decline sent: \(fileId)")
    telemetry.event("file.offer_declined")
    return true
  }

  // MARK: Chunks

  func handleChunk(_ parsed: ParsedChunk, from peer: String) async {
    guard
      let idx = activeDownloads.firstIndex(where: { file in
        file.id == parsed.fileId && file.fromUser == peer
      })
    else {
      // No accepted download for this chunk — offer not accepted, or already done.
      return
    }

    guard parsed.isValid else {
      log.warning("invalid chunk \(parsed.chunkIndex) for \(parsed.fileId), failing transfer")
      failDownload(fileId: parsed.fileId, from: peer, reason: .integrity, outcome: .crcFailed, attributes: [
        "chunk_index": Int(parsed.chunkIndex),
        "total_chunks": Int(parsed.totalChunks),
        "bytes_received": Int(activeDownloads[idx].receivedSize),
      ])
      return
    }

    if activeDownloads[idx].expectedHash == nil {
      log.warning("no hash for \(parsed.fileId); rejecting early")
      failDownload(fileId: parsed.fileId, from: peer, reason: .noHash, outcome: .noHash)
      return
    }

    let chunkIndex = Int(parsed.chunkIndex)

    // Atomic reserve (no await before this returns): skip if already committed
    // or already being written.
    let isDuplicate = activeDownloads[idx].receivedChunkURLs[chunkIndex] != nil
      || pendingChunkIndices[parsed.fileId]?.contains(chunkIndex) == true
    if isDuplicate { return }
    pendingChunkIndices[parsed.fileId, default: []].insert(chunkIndex)

    // Write off the main actor.
    let dir = chunkDirectory(for: parsed.fileId)
    let chunkURL = dir.appendingPathComponent("\(chunkIndex)")
    let data = parsed.data

    let didWrite = await Task.detached {
      do {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try data.write(to: chunkURL)
        return true
      } catch {
        return false
      }
    }.value

    // Back on MainActor. Clear the reservation.
    pendingChunkIndices[parsed.fileId]?.remove(chunkIndex)

    guard didWrite else {
      log.error("failed to persist chunk \(chunkIndex) for \(parsed.fileId)")
      return
    }

    // The download may have been removed (declined/cancelled) during the write.
    guard
      let i = activeDownloads.firstIndex(where: { file in
        file.id == parsed.fileId && file.fromUser == peer
      })
    else {
      try? FileManager.default.removeItem(at: chunkURL)
      return
    }

    // Checked after the write, against the state other in-flight chunks may have changed.
    let totalChunks = Int(parsed.totalChunks)
    guard activeDownloads[i].accepts(chunkIndex: chunkIndex, totalChunks: totalChunks, byteCount: data.count) else {
      failDownload(fileId: parsed.fileId, from: peer, reason: .integrity, outcome: .invalidChunk)
      return
    }

    // Update download state.
    if activeDownloads[i].totalChunks == 0 {
      activeDownloads[i].totalChunks = totalChunks
      startReceiveSpan(for: activeDownloads[i])
    }
    activeDownloads[i].receivedChunkURLs[chunkIndex] = chunkURL
    activeDownloads[i].receivedSize += Int64(data.count)
    activeDownloads[i].lastActivityAt = Date()

    let received = activeDownloads[i].receivedSize
    let size = activeDownloads[i].fileSize
    activeDownloads[i].progress = size > 0 ? min(1.0, Double(received) / Double(size)) : 0

    // Completion check.
    let total = activeDownloads[i].totalChunks
    if total > 0, activeDownloads[i].receivedChunkURLs.count == total {
      let download = activeDownloads[i]

      log.info("all \(total) chunks received for \(download.id)")
      activeDownloads[i].isFinalizing = true
      flushDownloadProgress(force: true)
      finalizeDownload(download, from: peer)
    } else {
      flushDownloadProgress()
    }
  }

  // MARK: Finalize

  private func finalizeDownload(_ download: FileDownload, from peer: String) {
    Task { @MainActor in
      let dir = chunkDirectory(for: download.id)

      let completedDir = Self.completedRoot
        .appendingPathComponent(FileTransferValidation.directoryName(for: download.id), isDirectory: true)
      try? FileManager.default.createDirectory(at: completedDir, withIntermediateDirectories: true)
      let finalURL = completedDir.appendingPathComponent(download.fileName)

      // Assemble + (optional) verify off the main actor.
      let result: (ok: Bool, reason: FileTransferFailureReason?) = await Task.detached {
        do {
          // Concatenate chunks 0..<total in order.
          if FileManager.default.fileExists(atPath: finalURL.path) {
            try FileManager.default.removeItem(at: finalURL)
          }

          FileManager.default.createFile(atPath: finalURL.path, contents: nil)
          let out = try FileHandle(forWritingTo: finalURL)
          defer { try? out.close() }

          for index in 0..<download.totalChunks {
            let chunkURL = dir.appendingPathComponent("\(index)")
            let chunkData = try Data(contentsOf: chunkURL)
            try out.write(contentsOf: chunkData)
          }
          try? out.close()

          // Verify hash.
          guard let expectedHash = download.expectedHash else {
            return (false, .noHash)
          }
          let actual = try BinaryChunk.blake3Hex(ofFileAt: finalURL)
          if actual != expectedHash {
            return (false, .integrity)
          }

          log.info("file integrity verified for \(download.id) ✓")
          return (true, nil)
        } catch {
          return (false, .assembly)
        }
      }.value

      // Clean up scratch chunks regardless of outcome.
      Self.removeChunkDirectory(dir)

      guard result.ok else {
        log.error("finalize failed for \(download.id), reason: \(result.reason ?? .assembly)")

        try? FileManager.default.removeItem(at: completedDir)
        failDownload(
          fileId: download.id,
          from: peer,
          reason: result.reason ?? .assembly,
          outcome: Self.finalizeOutcome(result.reason),
          attributes: ["total_chunks": download.totalChunks],
        )
        return
      }

      sendFileReceived(fileId: download.id, to: peer)
      endReceiveSpan(fileId: download.id, outcome: .completed)
      objectWillChange.send()
      activeDownloads.removeAll { $0.id == download.id && $0.fromUser == peer }
      stopStallWatchdogIfIdle()

      let outcome = await ReceivedFileSaver.save(at: finalURL, fileName: download.fileName)
      try? FileManager.default.removeItem(at: completedDir)

      switch outcome {
      case .photos:
        downloadCompleted.send((fileId: download.id, fileURL: nil))
      case let .documents(dest):
        downloadCompleted.send((fileId: download.id, fileURL: dest))
      case .permissionDenied:
        fileTransferFailed.send((fileId: download.id, reason: .photosPermissionDenied))
        return
      case .failed:
        fileTransferFailed.send((fileId: download.id, reason: .saveFailed))
        return
      }
      log.info("download complete: \(download.id)")
    }
  }

  private func sendFileReceived(fileId: String, to peer: String) {
    do {
      let data = try DataChannelMessage.encodeFileReceived(FileReceivedPayload(fileId: fileId))
      _ = signalingService.send(data, to: peer)
    } catch {
      log.error("encodeFileReceived failed: \(error)")
    }
  }

  // MARK: Cancellation

  @discardableResult
  func cancelFileDownload(fromUser: String, fileId: String) -> Bool {
    guard
      activeDownloads.contains(where: { file in
        file.id == fileId && file.fromUser == fromUser
      })
    else {
      return false
    }

    cleanupDownload(fileId: fileId, fromUser: fromUser, outcome: .cancelled, attributes: ["cancelled_by": CancelledBy.receiver.rawValue])
    fileTransferCancelled.send(fileId)

    let uploader = fromUser
    do {
      let data = try DataChannelMessage.encodeFileCancelDownload(FileCancelPayload(fileId: fileId))
      _ = signalingService.send(data, to: uploader)
    } catch {
      log.error("encodeFileCancelDownload failed: \(error)")
    }

    log.info("download cancelled: \(fileId)")
    return true
  }

  func handleFileUploadCancellation(fileId: String, from peer: String) {
    cleanupDownload(fileId: fileId, fromUser: peer, outcome: .cancelled, attributes: ["cancelled_by": CancelledBy.sender.rawValue])
    incomingFileOffers.removeAll { file in
      file.id == fileId && file.fromUser == peer
    }

    fileTransferCancelled.send(fileId)
    log.info("upload cancelled by sender: \(fileId)")
  }

  func failDownload(
    fileId: String,
    from peer: String,
    reason: FileTransferFailureReason,
    outcome: ReceiveOutcome,
    attributes: Telemetry.Attributes = [:],
  ) {
    cleanupDownload(fileId: fileId, fromUser: peer, outcome: outcome, attributes: attributes)

    do {
      let data = try DataChannelMessage.encodeFileCancelDownload(FileCancelPayload(fileId: fileId))
      _ = signalingService.send(data, to: peer)
    } catch {
      log.error("encodeFileCancelDownload (fail) failed: \(error)")
    }

    fileTransferFailed.send((
      fileId: fileId,
      reason: reason,
    ))
  }

  /// Every non-completed download leaves through here, so the receive span is closed exactly once.
  func cleanupDownload(fileId: String, fromUser: String, outcome: ReceiveOutcome, attributes: Telemetry.Attributes = [:]) {
    endReceiveSpan(fileId: fileId, outcome: outcome, attributes: attributes)
    objectWillChange.send()
    activeDownloads.removeAll { file in
      file.id == fileId && file.fromUser == fromUser
    }

    stopStallWatchdogIfIdle()
    pendingChunkIndices[fileId] = nil
    Self.removeChunkDirectory(chunkDirectory(for: fileId))
  }
}

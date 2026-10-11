//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Combine
import Foundation

// MARK: - Sending

extension FileTransferService {

  // MARK: Send

  func sendFiles(_ files: [StagedFile], to member: String) async {
    for file in files {
      await sendStagedFile(file, to: [member])
    }
  }

  func sendStagedFile(_ stagedFile: StagedFile, to peers: [String]) async {
    guard stagedFile.size > 0 else {
      log.warning("skipping empty file")
      stagedFile.kind.releaseSource(at: stagedFile.url)
      return
    }

    await userService.waitForUsername()
    let sender = userService.user
    let batchId = UUID().uuidString
    uploadBatches[batchId] = UploadBatch(total: peers.count)
    let preview = await PreviewGenerator.make(forFileAt: stagedFile.url)

    outgoingAttachment.send(
      ChatMessage(
        from: sender,
        text: stagedFile.name,
        type: .attachment,
        fileTransfer: FileTransferData(
          fileId: UUID().uuidString,
          fileName: stagedFile.name,
          fileSize: stagedFile.size,
          fromUser: sender,
          status: .pending,
          previewDataUrl: preview?.dataUrl,
          previewMime: preview?.mime,
          batchId: batchId,
          deliveredCount: 0,
          recipientCount: peers.count,
        ),
        isMine: true,
      ),
    )

    let hashTask = prewarmFileHash(forFileAt: stagedFile.url)
    var offeredAny = false
    for peer in peers {
      let offered = await prepareFileForSending(
        stagedFile: stagedFile,
        targetUser: peer,
        batchId: batchId,
        hashTask: hashTask,
        preview: preview,
      )
      if offered {
        offeredAny = true
      } else {
        markBatchOutcome(batchId, success: false)
      }
    }
    // All peers have consumed the shared hash; drop the cache entry.
    fileHashTasks[stagedFile.url] = nil
    // No upload holds the file, so none will release it.
    if !offeredAny {
      stagedFile.kind.releaseSource(at: stagedFile.url)
    }
  }

  /// Pre-computes a file's BLAKE3 hash so it's ready by send time.
  @discardableResult
  func prewarmFileHash(forFileAt url: URL) -> Task<String?, Never> {
    if let existing = fileHashTasks[url] { return existing }
    let task = Task.detached { try? BinaryChunk.blake3Hex(ofFileAt: url) }
    fileHashTasks[url] = task
    return task
  }

  // MARK: Offer

  @discardableResult
  func prepareFileForSending(
    stagedFile: StagedFile,
    targetUser: String,
    batchId: String,
    hashTask: Task<String?, Never>? = nil,
    preview: PreviewGenerator.Preview? = nil,
  ) async -> Bool {
    guard stagedFile.size > 0 else {
      log.warning("skipping empty file")
      return false
    }

    await userService.waitForUsername()
    let sender = userService.user

    let fileId = UUID().uuidString
    let offer = FileOfferPayload(
      fileId: fileId,
      fileName: stagedFile.name,
      fileSize: stagedFile.size,
      fromUser: sender,
      fileHash: nil,
      previewDataUrl: nil,
      previewMime: nil,
    )

    let data: Data
    do {
      data = try DataChannelMessage.encodeFileOffer(offer)
    } catch {
      log.error("encodeFileOffer failed: \(error)")
      return false
    }

    guard signalingService.send(data, to: targetUser) else {
      log.warning("send failed for file-offer \(fileId)")
      return false
    }

    activeUploads.append(
      FileUpload(
        id: fileId,
        batchId: batchId,
        fileURL: stagedFile.url,
        kind: stagedFile.kind,
        displayName: stagedFile.name,
        fileSize: stagedFile.size,
        targetUser: targetUser,
        progress: 0,
        phase: .sending,
      ),
    )
    log.info("file-offer sent: \(fileId)")
    telemetry.event("file.offer_sent", attributes: [
      "file_size_bytes": Int(stagedFile.size),
      "mime": Self.mime(forFileName: stagedFile.name),
    ])

    offerTasks[fileId] = Task { [weak self] in
      await self?.sendEnrichOffer(
        fileId: fileId,
        stagedFile: stagedFile,
        sender: sender,
        to: targetUser,
        hashTask: hashTask,
        preview: preview,
      )
      self?.offerTasks[fileId] = nil
    }
    return true
  }

  private func sendEnrichOffer(
    fileId: String,
    stagedFile: StagedFile,
    sender: String,
    to targetUser: String,
    hashTask: Task<String?, Never>? = nil,
    preview: PreviewGenerator.Preview? = nil,
  ) async {
    let hash: String?
    if let hashTask {
      hash = await hashTask.value
    } else {
      hash = await Task.detached {
        try? BinaryChunk.blake3Hex(ofFileAt: stagedFile.url)
      }.value
    }

    guard let hash else {
      log.error("hash failed for \(fileId); aborting send")
      stopFileUpload(targetUser: targetUser, fileId: fileId) // removes upload + sends file-cancel-upload
      fileTransferFailed.send((fileId: fileId, reason: .sendHashFailed))
      return
    }

    let resolvedPreview: PreviewGenerator.Preview?
    if let preview {
      resolvedPreview = preview
    } else {
      resolvedPreview = await PreviewGenerator.make(forFileAt: stagedFile.url)
    }

    // The peer may have declined, or we cancelled, while the hash and preview were made.
    guard activeUploads.contains(where: { $0.id == fileId && $0.targetUser == targetUser }) else {
      log.info("offer \(fileId) was withdrawn before its hash went out")
      return
    }

    let enriched = FileOfferPayload(
      fileId: fileId,
      fileName: stagedFile.name,
      fileSize: stagedFile.size,
      fromUser: sender,
      fileHash: hash,
      previewDataUrl: resolvedPreview?.dataUrl,
      previewMime: resolvedPreview?.mime,
    )

    do {
      _ = signalingService.send(try DataChannelMessage.encodeFileOffer(enriched), to: targetUser)
      log.info("enriched file-offer sent: \(fileId)")
    } catch {
      log.error("encodeFileOffer (enriched) failed for \(fileId): \(error)")
    }
  }

  // MARK: Chunk Loop

  func handleFileAccept(payload: FileAcceptPayload, from peer: String) {
    guard
      let idx = activeUploads.firstIndex(where: {
        $0.targetUser == peer && $0.id == payload.fileId
      }),
      uploadTasks[payload.fileId] == nil,
      activeUploads[idx].phase != .finalizing
    else {
      log.warning("file-accept ignored: no upload waiting for \(payload.fileId)")
      return
    }

    let upload = activeUploads[idx]
    log.info("file-accept received: starting chunk send for \(upload.id)")

    let offerTask = offerTasks[payload.fileId]
    let task = Task.detached { [weak self] in
      guard let self else { return }
      await offerTask?.value
      await self.runChunkSendLoop(uploadId: upload.id, targetUser: peer)
    }
    uploadTasks[upload.id] = task
  }

  nonisolated func runChunkSendLoop(uploadId: String, targetUser: String) async {
    defer { Task { @MainActor [weak self] in self?.uploadTasks[uploadId] = nil } }
    await telemetry.withSpan(op: "file.transfer.send") { span in
      await runChunkSendLoopInner(uploadId: uploadId, targetUser: targetUser, span: span)
    }
  }

  private nonisolated func runChunkSendLoopInner(uploadId: String, targetUser: String, span: TelemetrySpan) async {
    // 1. Snapshot upload metadata from the MainActor.
    let snapshot: (fileURL: URL, fileSize: Int64, mime: String)? = await MainActor.run {
      guard let upload = activeUploads.first(where: { $0.id == uploadId }) else { return nil }
      return (upload.fileURL, upload.fileSize, Self.mime(forFileName: upload.displayName))
    }

    guard let snapshot else {
      log.warning("chunk loop: upload \(uploadId) not found")
      markSendSpan(span, .cancelled)
      return
    }
    telemetry.setAttributes(["file_size_bytes": Int(snapshot.fileSize), "mime": snapshot.mime], on: span)

    // 2. Open the file once.
    let handle: FileHandle
    do {
      handle = try FileHandle(forReadingFrom: snapshot.fileURL)
    } catch {
      log.error("chunk loop: cannot open source file: \(error.codeDescription)")
      markSendSpan(span, .abortedMaxErrors, message: "max_consecutive_errors")
      return
    }
    defer { try? handle.close() }

    let totalChunks = BinaryChunk.totalChunks(forFileSize: snapshot.fileSize)
    telemetry.setAttributes(["total_chunks": Int(totalChunks)], on: span)
    var chunkIndex: UInt32 = 0
    var bytesSent: Int64 = 0

    var lastProgressFlush = Date.distantPast

    // 3. Send loop.
    while true {
      if Task.isCancelled {
        log.info("chunk loop cancelled for \(uploadId)")
        markSendSpan(span, .cancelled)
        return
      }

      let chunkData: Data
      do {
        guard
          let data = try handle.read(upToCount: BinaryChunk.chunkSize),
          !data.isEmpty
        else {
          break // EOF
        }

        chunkData = data
      } catch {
        log.error("chunk loop: read error: \(error.codeDescription)")
        markSendSpan(span, .abortedMaxErrors, message: "max_consecutive_errors")
        return
      }

      let encoded = BinaryChunk.encode(
        fileId: uploadId,
        chunkIndex: chunkIndex,
        totalChunks: totalChunks,
        data: chunkData,
      )

      // Back-pressure: poll-retry. `sendChunk` returns false when bufferedAmount is
      // above maxBufferedAmount — we sleep briefly and retry until it accepts.
      guard await sendEncodedChunk(encoded, to: targetUser) else {
        log.info("chunk loop cancelled (back-pressure wait) for \(uploadId)")
        markSendSpan(span, .cancelled)
        return
      }

      bytesSent += Int64(chunkData.count)
      chunkIndex += 1

      let now = Date()
      if now.timeIntervalSince(lastProgressFlush) >= Self.progressFlushInterval {
        lastProgressFlush = now
        await applyUploadProgress(uploadId: uploadId, bytesSent: bytesSent, fileSize: snapshot.fileSize)
      }
    }

    // 4. Final flush + flip phase to .finalizing — bytes shipped, awaiting
    //    receiver ack. The flush guarantees the bar hits 100% even if the last
    //    periodic update was throttled out.
    markSendSpan(span, .queuedAllChunks)
    await applyUploadProgress(
      uploadId: uploadId,
      bytesSent: bytesSent,
      fileSize: snapshot.fileSize,
      phase: .finalizing,
    )
    log.info("chunk loop: finished \(chunkIndex) chunks for \(uploadId)")
  }

  /// Sends one encoded chunk, waiting out back-pressure. False if cancelled.
  private nonisolated func sendEncodedChunk(_ encoded: Data, to targetUser: String) async -> Bool {
    while true {
      if await signalingService.sendChunk(encoded, to: targetUser) { return true }
      try? await Task.sleep(nanoseconds: 50_000_000) // 50 ms
      if Task.isCancelled { return false }
    }
  }

  /// Applies progress (and optionally a phase) to the matching active upload.
  private func applyUploadProgress(
    uploadId: String,
    bytesSent: Int64,
    fileSize: Int64,
    phase: FileUpload.Phase? = nil,
  ) {
    guard let idx = activeUploads.firstIndex(where: { $0.id == uploadId }) else { return }
    activeUploads[idx].progress = min(1.0, Double(bytesSent) / Double(fileSize))
    if let phase { activeUploads[idx].phase = phase }
  }

  // MARK: Delivery

  func handleFileReceived(payload: FileReceivedPayload, from peer: String) {
    guard
      let idx = activeUploads.firstIndex(where: {
        $0.targetUser == peer && $0.id == payload.fileId
      })
    else {
      log.warning("file-received ignored: no upload for \(payload.fileId)")
      return
    }

    let removed = activeUploads.remove(at: idx)
    markBatchOutcome(removed.batchId, success: true)
    log.info("file-received ack: \(payload.fileId)")
    telemetry.event("file.delivered", attributes: [
      "file_size_bytes": Int(removed.fileSize),
      "mime": Self.mime(forFileName: removed.displayName),
    ])

    // Delete the tmp file only if no other in-flight upload references it.
    // Multiple peer-specific FileUploads share the same source `fileURL` when the
    // user sent one file to many peers; the last one out deletes.
    releaseSourceFile(of: removed)
  }

  // MARK: Cancellation

  @discardableResult
  func stopFileUpload(targetUser: String, fileId: String, notifyRecipient: Bool = true) -> Bool {
    uploadTasks[fileId]?.cancel()
    uploadTasks[fileId] = nil
    offerTasks[fileId]?.cancel()
    offerTasks[fileId] = nil

    guard
      let idx = activeUploads.firstIndex(where: { file in
        file.targetUser == targetUser && file.id == fileId
      })
    else {
      return false
    }
    let removed = activeUploads.remove(at: idx)
    markBatchOutcome(removed.batchId, success: false)
    releaseSourceFile(of: removed)

    if notifyRecipient {
      do {
        let data = try DataChannelMessage.encodeFileCancelUpload(FileCancelPayload(fileId: fileId))
        _ = signalingService.send(data, to: targetUser)
      } catch {
        log.error("encodeFileCancelUpload failed: \(error)")
      }
    }

    log.info("upload stopped: \(fileId) (notify=\(notifyRecipient))")
    return true
  }

  /// Receiver rejected a pending offer. Stop the upload; they already know.
  func handleFileDecline(fileId: String, from peer: String) {
    stopFileUpload(targetUser: peer, fileId: fileId, notifyRecipient: false)
  }

  /// Receiver cancelled an in-flight download. Stop sending; they already know.
  func handleFileDownloadCancellation(fileId: String, from peer: String) {
    stopFileUpload(targetUser: peer, fileId: fileId, notifyRecipient: false)
  }

  private func releaseSourceFile(of upload: FileUpload) {
    let stillReferenced = activeUploads.contains { file in
      file.fileURL == upload.fileURL
    }
    guard !stillReferenced else { return }

    upload.kind.releaseSource(at: upload.fileURL)
    log.info("released source (\(upload.kind))")
  }
}

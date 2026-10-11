//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

// MARK: - Download Storage

extension FileTransferService {
  nonisolated static let receivedChunksRoot = FileManager.default.temporaryDirectory
    .appendingPathComponent("received-chunks", isDirectory: true)

  nonisolated static let completedRoot = FileManager.default.temporaryDirectory
    .appendingPathComponent("completed", isDirectory: true)

  /// Per-file folder for received chunks: <tmp>/received-chunks/<hashed fileId>/.
  func chunkDirectory(for fileId: String) -> URL {
    Self.receivedChunksRoot
      .appendingPathComponent(FileTransferValidation.directoryName(for: fileId), isDirectory: true)
  }

  /// Deletes a chunk directory off the main actor; it holds one file per received chunk.
  nonisolated static func removeChunkDirectory(_ dir: URL) {
    DispatchQueue.global(qos: .utility).async {
      try? FileManager.default.removeItem(at: dir)
    }
  }

  /// Clears files a killed download left behind. The rename keeps new downloads out of the slow delete.
  nonisolated static func removeLeftoverDownloadFiles() {
    // TODO: Remove once no one runs a version that kept chunks in <tmp>/incoming.
    let oldChunksRoot = FileManager.default.temporaryDirectory.appendingPathComponent("incoming", isDirectory: true)
    for root in [receivedChunksRoot, completedRoot, oldChunksRoot] {
      let aside = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
      guard (try? FileManager.default.moveItem(at: root, to: aside)) != nil else { continue }
      removeChunkDirectory(aside)
    }
  }
}

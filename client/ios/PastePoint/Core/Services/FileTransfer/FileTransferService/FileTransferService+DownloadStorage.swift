//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

// MARK: - Download Storage

extension FileTransferService {
  // TODO: Change the path name from incoming to something better.
  nonisolated static let incomingRoot = FileManager.default.temporaryDirectory
    .appendingPathComponent("incoming", isDirectory: true)

  nonisolated static let completedRoot = FileManager.default.temporaryDirectory
    .appendingPathComponent("completed", isDirectory: true)

  /// Per-file scratch directory for incoming chunks: <tmp>/incoming/<hashed fileId>/.
  func chunkDirectory(for fileId: String) -> URL {
    Self.incomingRoot
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
    for root in [incomingRoot, completedRoot] {
      let aside = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
      guard (try? FileManager.default.moveItem(at: root, to: aside)) != nil else { continue }
      removeChunkDirectory(aside)
    }
  }
}

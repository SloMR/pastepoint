//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Combine
import Foundation

// MARK: - Progress

extension FileTransferService {
  nonisolated static let progressFlushInterval: TimeInterval = 0.25

  /// Redraws download progress at most every `progressFlushInterval`; chunks can land many times per frame.
  func flushDownloadProgress(force: Bool = false) {
    let now = Date()
    guard force || now.timeIntervalSince(lastDownloadFlush) >= Self.progressFlushInterval else { return }
    lastDownloadFlush = now
    objectWillChange.send()
  }
}

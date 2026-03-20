//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Logging

// MARK: - Version

extension Bundle {
  var appVersion: String {
    infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
  }
}

// MARK: - Build Environment

enum AppBuildInfo {
  /// `true` when running inside Xcode's SwiftUI preview renderer (simulator or in-process).
  static let isXcodePreview = ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
}

// MARK: - Logging Bootstrap

enum AppLogging {
  private static var bootstrapped = false

  /// Bootstraps the logging system exactly once per process.
  /// Safe to call from both `PastePointApp.init()` and `AppServices.preview`.
  static func bootstrap() {
    guard !bootstrapped else { return }
    bootstrapped = true

#if DEBUG
    LoggingSystem.bootstrap(AppLogHandler.init)
#else
    LoggingSystem.bootstrap(SwiftLogNoOpLogHandler.init)
#endif
  }
}

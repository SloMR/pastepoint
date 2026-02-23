//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Logging
import os

struct AppLogHandler: LogHandler {
    private let label: String
    private let osLogger: os.Logger

    var metadata: Logging.Logger.Metadata = [:]
    var logLevel: Logging.Logger.Level = .debug

    init(label: String) {
        self.label = label
        self.osLogger = os.Logger(subsystem: "com.pastepoint", category: label)
    }

    subscript(metadataKey key: String) -> Logging.Logger.Metadata.Value? {
        get { metadata[key] }
        set { metadata[key] = newValue }
    }

    // swiftlint:disable:next function_parameter_count
    func log(
        level: Logging.Logger.Level,
        message: Logging.Logger.Message,
        metadata _: Logging.Logger.Metadata?,
        source _: String,
        file: String,
        function: String,
        line: UInt,
    ) {
        let filename = URL(fileURLWithPath: file).lastPathComponent
        let entry = "\(emoji(for: level)) \(filename):\(line) [\(function)]: \(message)"

        switch level {
        case .trace, .debug:
            osLogger.debug("\(entry, privacy: .public)")
        case .info:
            osLogger.info("\(entry, privacy: .public)")
        case .notice:
            osLogger.notice("\(entry, privacy: .public)")
        case .warning:
            osLogger.warning("\(entry, privacy: .public)")
        case .error:
            osLogger.error("\(entry, privacy: .public)")
        case .critical:
            osLogger.critical("\(entry, privacy: .public)")
        }
    }

    private func emoji(for level: Logging.Logger.Level) -> String {
        switch level {
        case .trace: return "⚪️"
        case .debug: return "🔵"
        case .info: return "🟢"
        case .notice: return "🟡"
        case .warning: return "🟠"
        case .error: return "🔴"
        case .critical: return "🟣"
        }
    }
}

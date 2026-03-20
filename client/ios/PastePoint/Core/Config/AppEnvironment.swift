//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

enum AppEnvironment {
#if DEBUG
  static let host = "127.0.0.1"
  static let wsPort = 9000
#else
  static let host = "pastepoint.com"
  static let wsPort: Int? = nil
#endif

  /// Used for WebSocket and HTTP API calls — includes port in DEBUG.
  static var apiUrl: String {
    if let port = wsPort { return "\(host):\(port)" }
    return host
  }

  /// Used for shareable URLs (e.g. QR codes) — never includes the WS port.
  static var webUrl: String { host }
}

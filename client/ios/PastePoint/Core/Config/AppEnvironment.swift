//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

enum AppEnvironment {
  #if DEBUG
  static let apiUrl   = "127.0.0.1:9000"
  #else
  static let apiUrl = "pastepoint.com"
  #endif
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

// MARK: - Version
extension Bundle {
  var appVersion: String {
    return infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
  }
}

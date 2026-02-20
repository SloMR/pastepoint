//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI
import Combine

@MainActor
final class AppServices: ObservableObject {
  let wsService = WebSocketConnectionService()
  
  static let shared = AppServices()
}


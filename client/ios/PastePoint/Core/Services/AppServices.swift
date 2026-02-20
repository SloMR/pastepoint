//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI
import Combine

@MainActor
final class AppServices: ObservableObject {
  let wsService = WebSocketConnectionService()
  lazy var userService = UserService(wsService: wsService)
  lazy var roomService = RoomService(wsService: wsService)
  
  static let shared = AppServices()
}


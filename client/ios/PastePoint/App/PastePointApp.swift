//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

@main
struct PastePointApp: App {
  @Environment(\.scenePhase) private var phase
  
  @StateObject private var services = AppServices.shared
  
  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(services)
    }
    .onChange(of: phase) { _, newPhase in
      switch newPhase {
        
      case .active:
        Task { await services.handleForeground() }
        
      case .background:
        services.handleBackground()
        
      case .inactive:
        break
        
      @unknown default:
        break
      }
    }
  }
}

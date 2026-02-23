//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI

@main
struct PastePointApp: App {
    @Environment(\.scenePhase) private var phase

    @StateObject private var services = AppServices.shared

    init() {
#if DEBUG
        LoggingSystem.bootstrap(AppLogHandler.init)
#else
        LoggingSystem.bootstrap(SwiftLogNoOpLogHandler.init)
#endif
    }

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

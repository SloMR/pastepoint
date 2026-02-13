//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

// MARK: - Root

struct ContentView: View {
  @State private var showSettings = false

  var body: some View {
    VStack(spacing: 0) {
      ChatHeaderView(onMenuTap: { showSettings = true })
      Divider()

      RoomContentView()

      MessageInputBar()
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    .background(AppColors.Background.background)
    .ignoresSafeArea(.keyboard, edges: .bottom)
    .sheet(isPresented: $showSettings) {
      NavigationStack {
        SettingsView()
      }
    }
  }
}

// MARK: - Main Content Switcher

struct RoomContentView: View {
  @State private var hasMessages: Bool = true

  var body: some View {
    Group {
      if hasMessages {
        ChatView()
      } else {
        WelcomeView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AppColors.Background.background)
  }
}

// MARK: - Preview

#Preview {
  ContentView()
}

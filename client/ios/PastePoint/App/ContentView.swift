//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

// MARK: - Root

struct ContentView: View {
  @AppStorage(AppColors.Scheme.storageKey) private var colorSchemeRaw: String = AppColors.Scheme.default
  @EnvironmentObject private var services: AppServices

  @State private var showSettings = false

  var body: some View {
    VStack(spacing: 0) {
      ChatHeaderView(
        onMenuTap: { showSettings = true },
        onThemeTap: { colorSchemeRaw = AppColors.Scheme.next(after: colorSchemeRaw) }
      )
      Divider()

      RoomContentView()

      MessageInputBar()
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    .background(AppColors.Background.background)
    .preferredColorScheme(AppColors.Scheme.colorScheme(from: colorSchemeRaw))
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

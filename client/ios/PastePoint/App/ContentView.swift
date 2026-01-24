//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

// MARK: - Root

struct ContentView: View {
  var body: some View {
    VStack(spacing: 0) {
      HeaderView()
      Divider()

      RoomContentView()

      MessageInputBar()
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    .background(AppColors.Background.background)
    .ignoresSafeArea(.keyboard, edges: .bottom)
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

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

// MARK: - Root

struct ContentView: View {
  @AppStorage(AppColors.Scheme.storageKey) private var colorSchemeRaw: String = AppColors.Scheme.default
  @Environment(\.scenePhase) var phase
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
        SettingsView(
          roomService: services.roomService,
          userService: services.userService,
          wsService: services.wsService,
          sessionService: services.sessionService
        )
      }
    }
    .task {
      await connectIfNeeded()
    }
    .onReceive(services.wsService.$message) { msg in
      if let msg = msg, !msg.isEmpty {
        print("User message:", msg)
      }
    }
    .onReceive(services.wsService.$signalMessage) { sig in
      guard let sig = sig else { return }
      print("Signal: \(sig.type.rawValue) | from: \(sig.from) → to: \(sig.to)")
    }
    .onChange(of: phase) { _, newPhase in
      if newPhase == .background {
        services.wsService.disconnect(manual: false)
      }
      if newPhase == .active {
        Task { await connectIfNeeded() }
      }
    }
  }
  
  private func connectIfNeeded() async {
    guard !services.wsService.isConnected else { return }
    if let sessionCode = services.wsService.currentSessionCode,
       !sessionCode.isEmpty {
      await services.wsService.connect(sessionCode: sessionCode)
    } else {
      await services.wsService.connect()
    }

    await services.roomService.listRooms()
    await services.userService.getUsername()
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
    .environmentObject(AppServices.shared)
}

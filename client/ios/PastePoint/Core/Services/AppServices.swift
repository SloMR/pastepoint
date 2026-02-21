//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI
import Combine
import Network
import UIKit

@MainActor
final class AppServices: ObservableObject {
  public let wsService      : WebSocketConnectionService
  public let sessionService : SessionService
  public let userService    : UserService
  public let roomService    : RoomService

  static let shared = AppServices()

  private var isInBackground = false
  private let networkMonitor = NWPathMonitor()
  private var cancellables   = Set<AnyCancellable>()

  private init() {
    wsService      = WebSocketConnectionService()
    sessionService = SessionService()
    userService    = UserService(wsService: wsService)
    roomService    = RoomService(wsService: wsService)

    startNetworkMonitoring()
    startTerminationObserver()
    forwardServiceChanges()
  }

  // MARK: - App Lifecycle

  public func handleForeground() async {
    isInBackground = false
    guard !wsService.isConnected else { return }
    await wsService.connect(sessionCode: wsService.currentSessionCode)
    await roomService.listRooms()
    await userService.getUsername()
  }

  public func handleBackground() {
    isInBackground = true
    wsService.disconnect(manual: false)
  }

  // MARK: - Network Monitoring

  /// Watches for network restoration and reconnects automatically —
  /// covers the case where the reconnect loop exhausted its attempts
  /// while the network was down, then the network came back.
  private func startNetworkMonitoring() {
    networkMonitor.pathUpdateHandler = { [weak self] path in
      guard path.status == .satisfied else { return }
      Task { @MainActor [weak self] in
        guard let self, !self.isInBackground else { return }
        await self.handleForeground()
      }
    }
    networkMonitor.start(queue: DispatchQueue(label: "com.pastepoint.NetworkMonitor"))
  }

  // MARK: - Termination

  private func startTerminationObserver() {
    NotificationCenter.default
      .publisher(for: UIApplication.willTerminateNotification)
      .sink { [weak self] _ in
        self?.wsService.disconnect(manual: true)
      }
      .store(in: &cancellables)
  }

  // MARK: - Change Forwarding

  private func forwardServiceChanges() {
    wsService.objectWillChange
      .sink { [weak self] _ in self?.objectWillChange.send() }
      .store(in: &cancellables)
    userService.objectWillChange
      .sink { [weak self] _ in self?.objectWillChange.send() }
      .store(in: &cancellables)
    roomService.objectWillChange
      .sink { [weak self] _ in self?.objectWillChange.send() }
      .store(in: &cancellables)
  }
}

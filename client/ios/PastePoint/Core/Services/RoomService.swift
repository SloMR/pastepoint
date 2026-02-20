//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Combine

@MainActor
final class RoomService: ObservableObject {
  @Published var rooms: [String] = []
  @Published var members: [String] = []
  @Published var currentRoom: String = ""
  
  private var cancellables = Set<AnyCancellable>()
  private let wsService: WebSocketConnectionService
  
  init(wsService: WebSocketConnectionService) {
    self.wsService = wsService

    wsService.$systemMessage
      .receive(on: DispatchQueue.main)
      .sink { [weak self] message in
        guard let message = message, !message.isEmpty else { return }
        self?.handleSystemMessage(message)
      }
      .store(in: &cancellables)
  }
  
  func listRooms() async {
    await wsService.send("[UserCommand] /list")
  }
  
  func joinOrJoinRoom(_ room: String) async {
    guard !room.isEmpty, room != currentRoom else { return }
    await wsService.send("[UserCommand] /join \(room)")
    currentRoom = room
    await listRooms()
  }
  
  private func handleSystemMessage(_ message: String) {
    if message.contains("[SystemRooms]") {
      if let range = message.range(of: "\\[SystemRooms]\\s*(.*)$", options: .regularExpression) {
        let rest = String(message[range])
        let prefix = "[SystemRooms] "
        let list = rest.hasPrefix(prefix) ? String(rest.dropFirst(prefix.count)) : rest
        let roomsList = list.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        rooms = Array(roomsList)
      }
    } else if message.contains("[SystemMembers]") {
      if let range = message.range(of: "\\[SystemMembers]\\s*(.*)$", options: .regularExpression) {
        let rest = String(message[range])
        let prefix = "[SystemMembers] "
        let list = rest.hasPrefix(prefix) ? String(rest.dropFirst(prefix.count)) : rest
        let membersList = list.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        members = Array(membersList)
      }
    } else if message.contains("[SystemJoin]") {
      if let range = message.range(of: "\\[SystemJoin]\\s*(\\S+)\\s*$", options: .regularExpression) {
        let roomPart = String(message[range])
        let parts = roomPart.split(separator: " ")
        if let last = parts.last {
          currentRoom = String(last)
          Task { await self.listRooms() }
        }
      }
    }
  }
}

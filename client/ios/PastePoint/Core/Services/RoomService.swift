//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Combine

@MainActor
final class RoomService: ObservableObject {
  @Published public var rooms: [String] = []
  @Published public var members: [String] = []
  @Published public var currentRoom: String = ""
  
  private var cancellables = Set<AnyCancellable>()
  private let wsService: WebSocketConnectionService
  
  init(wsService: WebSocketConnectionService) {
    self.wsService = wsService
    
    wsService.systemMessage
      .receive(on: DispatchQueue.main)
      .sink { [weak self] message in
        self?.handleSystemMessage(message)
      }
      .store(in: &cancellables)
    
    wsService.didReconnect
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        Task { await self?.listRooms() }
      }
      .store(in: &cancellables)
  }
  
  public func listRooms() async {
    await wsService.send("[UserCommand] /list")
  }
  
  public func joinOrCreateRoom(_ room: String) async {
    guard !room.isEmpty else {
      print("joinOrCreateRoom: room name is empty — skipped")
      return
    }
    guard room != currentRoom else {
      print("joinOrCreateRoom: already in room '\(room)' — skipped")
      return
    }
    print("Joining room: \(room)")
    await wsService.send("[UserCommand] /join \(room)")
    currentRoom = room
    await listRooms()
  }
  
  private func handleSystemMessage(_ message: String) {
    if message.contains("[SystemRooms]") {
      guard let range = message.range(of: "\\[SystemRooms]\\s*(.*)$", options: .regularExpression) else {
        print("handleSystemMessage: failed to parse [SystemRooms] message: \(message)")
        return
      }
      let rest   = String(message[range])
      let prefix = "[SystemRooms] "
      let list   = rest.hasPrefix(prefix) ? String(rest.dropFirst(prefix.count)) : rest
      rooms = list.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
      print("Rooms updated: \(rooms)")
    } else if message.contains("[SystemMembers]") {
      guard let range = message.range(of: "\\[SystemMembers]\\s*(.*)$", options: .regularExpression) else {
        print("handleSystemMessage: failed to parse [SystemMembers] message: \(message)")
        return
      }
      let rest   = String(message[range])
      let prefix = "[SystemMembers] "
      let list   = rest.hasPrefix(prefix) ? String(rest.dropFirst(prefix.count)) : rest
      members = list.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
      print("Members updated: \(members)")
    } else if message.contains("[SystemJoin]") {
      guard let range = message.range(of: "\\[SystemJoin]\\s*(\\S+)\\s*$", options: .regularExpression) else {
        print("handleSystemMessage: failed to parse [SystemJoin] message: \(message)")
        return
      }
      let parts = String(message[range]).split(separator: " ")
      guard let last = parts.last else {
        print("handleSystemMessage: [SystemJoin] had no room name in: \(message)")
        return
      }
      currentRoom = String(last)
      print("Joined room: \(currentRoom)")
      Task { await self.listRooms() }
    }
  }
}

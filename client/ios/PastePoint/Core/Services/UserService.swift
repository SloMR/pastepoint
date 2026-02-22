//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Combine

@MainActor
final class UserService: ObservableObject {
  @Published public var user: String = ""
  
  private let wsService: WebSocketConnectionService
  private var cancellables = Set<AnyCancellable>()
  private static let nameRegex = try? NSRegularExpression(pattern: "\\[SystemName]\\s*(.*?)$")
  
  init(wsService: WebSocketConnectionService) {
    self.wsService = wsService
    
    wsService.systemMessage
      .receive(on: DispatchQueue.main)
      .sink { [weak self] message in
        self?.handleSystemMessage(message)
      }
      .store(in: &cancellables)
    
    wsService.didConnect
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        Task { await self?.getUsername() }
      }
      .store(in: &cancellables)
  }
  
  public func getUsername() async {
    await wsService.send("[UserCommand] /name")
  }
  
  private func handleSystemMessage(_ message: String) {
    guard message.contains("[SystemName]") else { return }
    guard let regex = UserService.nameRegex else {
      print("handleSystemMessage: nameRegex failed to initialize")
      return
    }
    guard let match = regex.firstMatch(in: message, range: NSRange(message.startIndex..., in: message)) else {
      print("handleSystemMessage: no [SystemName] match in: \(message)")
      return
    }
    guard let range = Range(match.range(at: 1), in: message) else {
      print("handleSystemMessage: capture group out of range in: \(message)")
      return
    }
    user = String(message[range]).trimmingCharacters(in: .whitespaces)
    print("Username updated: \(user)")
  }
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Combine


final class UserService: ObservableObject {
  @Published var user: String = ""
  
  private let wsService: WebSocketConnectionService
  private var cancellables = Set<AnyCancellable>()
  
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
  
  func getUsername() async {
    await wsService.send("[UserCommand] /name")
  }
  
  private func handleSystemMessage(_ message: String) {
    guard message.contains("[SystemName]") else { return }
    let pattern = "\\[SystemName]\\s*(.*?)$"
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: message, range: NSRange(message.startIndex..., in: message)),
          let range = Range(match.range(at: 1), in: message) else { return }
    let userName = String(message[range]).trimmingCharacters(in: .whitespaces)
    user = userName
  }
}

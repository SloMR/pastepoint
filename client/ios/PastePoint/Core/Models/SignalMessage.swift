//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

enum SignalMessageType: String {
  case offer
  case answer
  case candidate
  case connectionRequest = "connection_request"
}

struct SignalMessage {
  let type: SignalMessageType
  let data: Any?
  let from: String
  let to: String
  let sequence: Int?

  init?(from dict: [String: Any]) {
    guard let typeRaw = dict["type"] as? String,
          let from = dict["from"] as? String,
          let to = dict["to"] as? String,
          let type = SignalMessageType(rawValue: typeRaw) else { return nil }
    self.type = type
    self.data = dict["data"]
    self.from = from
    self.to = to
    self.sequence = dict["sequence"] as? Int
  }

  init(type: SignalMessageType, data: Any, from: String, to: String, sequence: Int? = nil) {
    self.type = type
    self.data = data
    self.from = from
    self.to = to
    self.sequence = sequence
  }
}

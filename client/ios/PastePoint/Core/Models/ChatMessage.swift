//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

enum ChatMessageType {
    case text
    case attachment
}

struct ChatMessage {
    let from: String
    let text: String
    let type: ChatMessageType
    let timestamp: Date

    init(from: String, text: String, type: ChatMessageType = .text, timestamp: Date = Date()) {
        self.from = from
        self.text = text
        self.type = type
        self.timestamp = timestamp
    }
}

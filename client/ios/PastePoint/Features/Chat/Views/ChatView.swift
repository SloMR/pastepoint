//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct ChatView: View {
    @State var isPrivateRoom: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

                // Room header row
                ChatHeader(isPrivate: isPrivateRoom)

                // Chat bubbles (merged from ChatView)
                VStack(spacing: 16) {
                    MessageBubble(
                        alignment: .leading,
                        name: "Garry Schulist",
                        time: "9:04 PM",
                        text: "Hello",
                    )

                    MessageBubble(
                        alignment: .trailing,
                        name: "Gwen Kuphal",
                        time: "9:05 PM",
                        text: "Hi",
                    )
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 16)
            }
            .padding(.horizontal, 16)
        }
    }
}

#Preview {
    ChatView()
}

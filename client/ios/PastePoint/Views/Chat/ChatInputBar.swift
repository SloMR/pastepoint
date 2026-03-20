//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI

struct ChatInputBar: View {
  private let logger = Logger(label: "ChatInputBar")

  @State private var message = ""

  var body: some View {
    VStack(spacing: 10) {

      TextField("Type your message", text: $message)
        .textFieldStyle(.plain)
        .font(.body)
        .foregroundStyle(.textPrimary)

      HStack(alignment: .center) {

        // TODO: Implement attachment picker; add toast = .error("...") on failure
        Button {
          logger.info("Attachments Button Clicked")
        } label: {
          Image("link")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: 18, height: 18)
        }
        .foregroundStyle(.textSecondary)
        .buttonStyle(.plain)

        Spacer()

        // TODO: Implement message send via WebSocket; add toast = .error("Failed to send message") on failure
        Button {
          logger.info("Send Button Clicked")
        } label: {
          HStack(spacing: 8) {
            Text("Send")
              .font(.headline)
              .fontWeight(.bold)

            Image("send")
              .renderingMode(.template)
              .resizable()
              .scaledToFit()
              .frame(width: 16, height: 16)
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 14)
          .padding(.vertical, 8)
          .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .fill(.brand),
          )
        }
        .buttonStyle(.plain)
        .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .opacity(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.6 : 1)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(.inputBackground),
    )
    .frame(maxWidth: 360)
  }
}

#Preview {
  ChatInputBar()
}

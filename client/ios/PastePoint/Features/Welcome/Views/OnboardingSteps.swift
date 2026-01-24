//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct OnboardingSteps: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center, spacing: 12) {
        NumberBadge(number: 1)
        Text("Invite others on the same network to join this room")
          .font(.caption2)
          .foregroundStyle(.textPrimary)
      }

      HStack(alignment: .center, spacing: 12) {
        NumberBadge(number: 2)
        Text("Start the conversation by sending a message")
          .font(.caption2)
          .foregroundStyle(.textPrimary)
      }
    }
    .padding(.horizontal, 22)
    .frame(maxWidth: 350, alignment: .leading)
  }
}

#Preview {
    OnboardingSteps()
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct OnboardingSteps: View {
    let steps: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .center, spacing: 12) {
                    NumberBadge(number: index + 1)
                    Text(step)
                        .font(.caption2)
                        .foregroundStyle(.textPrimary)
                }
            }
        }
        .padding(.horizontal, 22)
        .frame(maxWidth: 350, alignment: .leading)
    }
}

#Preview {
    OnboardingSteps(steps: [
        "Invite others on the same network to join this room",
        "Start the conversation by sending a message",
    ])
}

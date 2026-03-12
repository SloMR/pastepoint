//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct WelcomeView: View {
    @EnvironmentObject private var services: AppServices

    private var isPrivate: Bool {
        services.wsService.currentSessionCode != nil
    }

    var body: some View {
        VStack(alignment: .center, spacing: 16) {
            Spacer()

            // Room icon
            Group {
                if isPrivate {
                    Image("lock.light")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                } else {
                    Image("users")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                }
            }
            .padding(16)
            .background(Circle().fill(.brand))

            VStack(spacing: 0) {
                Text(isPrivate ? "Private Room" : "Public Room")
                    .font(.title2)
                    .foregroundStyle(.textPrimary)
                    .fontWeight(.semibold)

                Text(
                    isPrivate
                        ? "Private session is ready. Share your session code with others to invite them."
                        : "You're in a public room – anyone on the same network can join automatically.",
                )
                .font(.caption2)
                .foregroundStyle(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            }

            VStack(spacing: 10) {
                Text("WHAT TO DO NEXT")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.textSecondary)

                if isPrivate {
                    OnboardingSteps(steps: [
                        "Share your session code with people you want to invite",
                        "Wait for members to join the session",
                        "Start chatting and sharing files!"
                    ])
                } else {
                    OnboardingSteps(steps: [
                        "Invite others on the same network to join this room",
                        "Start the conversation by sending a message"
                    ])
                }

                HStack(spacing: 8) {
                    Circle().fill(.brand.opacity(0.47)).frame(width: 8, height: 8)
                    Circle().fill(.brand.opacity(0.47)).frame(width: 8, height: 8)
                    Circle().fill(.brand.opacity(0.47)).frame(width: 8, height: 8)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
    }
}

#Preview {
    WelcomeView()
        .environmentObject(AppServices.shared)
}

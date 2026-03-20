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

  private let features: [(String, String)] = [
    ("lock", "End-to-end encrypted"),
    ("icloud.slash", "No cloud storage"),
    ("doc", "Any file type & size"),
    ("person.slash", "No account needed"),
    ("arrow.up.arrow.down", "Local network speed"),
    ("chevron.left.slash.chevron.right", "Free & open source"),
  ]

  var body: some View {
    ScrollView {
      VStack(alignment: .center, spacing: 20) {

        // Room icon
        Group {
          if isPrivate {
            Image("lock.light")
              .resizable()
              .scaledToFit()
              .frame(width: 28, height: 28)
          } else {
            Image("users")
              .resizable()
              .scaledToFit()
              .frame(width: 28, height: 28)
          }
        }
        .padding(18)
        .background(Circle().fill(.brand))

        // Title + subtitle
        VStack(spacing: 6) {
          Text(isPrivate ? "Private Room" : "Public Room")
            .font(.title2)
            .fontWeight(.bold)
            .foregroundStyle(.textPrimary)

          Text(
            isPrivate
              ? "Private session is ready. Share your session code with others to invite them."
              : "You're in a public room – anyone on the same network can join automatically.",
          )
          .font(.subheadline)
          .foregroundStyle(.textSecondary)
          .multilineTextAlignment(.center)
          .padding(.horizontal, 16)
        }

        // Steps
        VStack(spacing: 12) {
          Text("WHAT TO DO NEXT")
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(.textSecondary)
            .tracking(0.5)

          if isPrivate {
            WelcomeStepList(steps: [
              "Share your session code with people you want to invite",
              "Wait for members to join the session",
              "Start chatting and sharing files!",
            ])
          } else {
            WelcomeStepList(steps: [
              "Invite others on the same network to join this room",
              "Start the conversation by sending a message",
            ])
          }
        }
        .padding(.horizontal, 16)

        // Features grid
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
          ForEach(features, id: \.1) { icon, label in
            featureCell(icon: icon, label: label)
          }
        }
        .padding(.horizontal, 16)

        // Dots
        HStack(spacing: 8) {
          Circle().fill(.brand.opacity(0.47)).frame(width: 8, height: 8)
          Circle().fill(.brand.opacity(0.47)).frame(width: 8, height: 8)
          Circle().fill(.brand.opacity(0.47)).frame(width: 8, height: 8)
        }
        .padding(.bottom, 8)
      }
      .frame(maxWidth: .infinity)
      .padding(.top, 32)
    }
  }

  private func featureCell(icon: String, label: String) -> some View {
    HStack(spacing: 8) {
      Image(systemName: icon)
        .font(.system(size: 13))
        .foregroundStyle(.textPrimary)
        .frame(width: 20, alignment: .center)
      Text(label)
        .font(.caption)
        .foregroundStyle(.textPrimary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(AppColors.Background.stepCard, in: RoundedRectangle(cornerRadius: 10))
  }
}

#Preview {
  WelcomeView()
    .environmentObject(AppServices.preview)
}

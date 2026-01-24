//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct WelcomeView: View {
  var body: some View {
    VStack(alignment: .center, spacing: 16) {
      Spacer()
      
      // Room icon
      Image("users.light")
        .resizable()
        .scaledToFit()
        .frame(width: 24, height: 24)
        .padding(16)
        .background(
          Circle().fill(.brand)
        )
      
      VStack(spacing: 0) {
        Text("Public Room")
          .font(.title2)
          .foregroundStyle(.textPrimary)
          .fontWeight(.semibold)
        
        Text("You're in a public room – anyone on the same network can join automatically.")
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
        
        OnboardingSteps()
        
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
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct HeaderView: View {
  var body: some View {
    HStack {
      // Logo
      Image("pastepoint.light")
        .resizable()
        .scaledToFit()
        .frame(height: 32)

      Spacer()

      HStack(spacing: 10) {

        // Language
        Button("AR") {
          print("Language Button Clicked")
        }
        .foregroundStyle(.brand)
        .font(.headline)
        .frame(width: 36, height: 36)
        .overlay(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .stroke(.border, lineWidth: 1)
        )
        .buttonStyle(.plain)

        // Theme
        Button {
          print("Theme Switch Clicked")
        } label: {
          Image("moon")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: 18, height: 18)
            .foregroundStyle(.textPrimary)
            .frame(width: 36, height: 36)
            .overlay(
              RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)

        // Menu
        Button {
          print("Menu Button Clicked")
        } label: {
          Image(systemName: "line.3.horizontal")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.textPrimary)
            .frame(width: 36, height: 36)
            .overlay(
              RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 6)
    .padding(.bottom, 10)
    .background(AppColors.Background.background)
  }
}

#Preview {
    HeaderView()
}

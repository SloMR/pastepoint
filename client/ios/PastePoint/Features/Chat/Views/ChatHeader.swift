//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct ChatHeader: View {
    let isPrivate: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(isPrivate ? "lock" : "users")
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)

            Text(isPrivate ? "Private Room" : "Public Room")
                .font(.title2)
                .foregroundStyle(.textPrimary)
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 18)
        .padding(.bottom, 22)
    }
}

#Preview {
    ChatHeader(isPrivate: false)
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct ChatContainerView: View {
  @State private var hasMessages: Bool = false

  var body: some View {
    Group {
      if hasMessages {
        ChatView()
      } else {
        WelcomeView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AppColors.Background.background)
  }
}

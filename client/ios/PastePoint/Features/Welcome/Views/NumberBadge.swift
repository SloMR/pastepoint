//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct NumberBadge: View {
  let number: Int

  var body: some View {
    Text("\(number)")
      .font(.caption2)
      .fontWeight(.medium)
      .foregroundStyle(.white)
      .frame(width: 18, height: 18)
      .background(.brand)
      .clipShape(Circle())
  }
}

#Preview {
  NumberBadge(number: 1)
}

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import CoreImage.CIFilterBuiltins
import SwiftUI

struct QRCodeView: View {
  let text: String
  let size: CGFloat

  @State private var qrImage: UIImage?

  var body: some View {
    Group {
      if let qrImage {
        Image(uiImage: qrImage)
          .interpolation(.none)
          .resizable()
          .scaledToFit()
          .frame(width: size, height: size)
          .transition(.opacity)
      } else {
        ProgressView()
          .frame(width: size, height: size)
      }
    }
    .animation(.easeInOut(duration: 0.2), value: qrImage != nil)
    .task(id: text) { qrImage = await Self.generateQRCode(from: text) }
  }

  private nonisolated static let context = CIContext()

  @concurrent
  private static func generateQRCode(from text: String) async -> UIImage? {
    let filter = CIFilter.qrCodeGenerator()

    filter.message = Data(text.utf8)
    filter.correctionLevel = "L"

    guard
      let outputImage = filter.outputImage,
      let cgImage = context.createCGImage(outputImage, from: outputImage.extent)
    else { return nil }

    return UIImage(cgImage: cgImage)
  }
}

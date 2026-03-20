//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI
import Vision
import VisionKit

private struct QRCodeScannerRepresentable: UIViewControllerRepresentable {
  var onCodeScanned: (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .fast,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isHighlightingEnabled: true,
    )
    scanner.delegate = context.coordinator
    try? scanner.startScanning()
    return scanner
  }

  func updateUIViewController(_: DataScannerViewController, context _: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(onCodeScanned: onCodeScanned) }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    var onCodeScanned: (String) -> Void
    private var hasScanned = false

    init(onCodeScanned: @escaping (String) -> Void) {
      self.onCodeScanned = onCodeScanned
    }

    // Parses https://<host>/private/<code> and returns the code.
    // Falls back to the raw payload if the URL doesn't match the expected format.
    static func extractSessionCode(from payload: String) -> String {
      guard
        let url = URL(string: payload),
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
      else { return payload }

      let pathComponents = components.path
        .split(separator: "/")
        .map(String.init)

      guard
        pathComponents.count == 2,
        pathComponents[0] == "private",
        !pathComponents[1].isEmpty
      else { return payload }

      return pathComponents[1]
    }

    func dataScanner(
      _: DataScannerViewController,
      didAdd addedItems: [RecognizedItem],
      allItems _: [RecognizedItem],
    ) {
      guard !hasScanned else { return }
      guard
        case .barcode(let barcode) = addedItems.first,
        let payload = barcode.payloadStringValue
      else { return }
      hasScanned = true
      let code = Self.extractSessionCode(from: payload)
      DispatchQueue.main.async { self.onCodeScanned(code) }
    }
  }
}

struct SettingsScanQRCode: View {
  @Environment(\.dismiss) private var dismiss
  private let logger = Logger(label: "SettingsScanQRCode")

  var onCodeScanned: (String) -> Void

  var body: some View {
    if DataScannerViewController.isSupported {
      ZStack(alignment: .top) {
        QRCodeScannerRepresentable { code in
          logger.info("QR code scanned successfully")
          onCodeScanned(code)
          dismiss()
        }
        .ignoresSafeArea()

        VStack {
          HStack {
            Spacer()
            Button { dismiss() } label: {
              ZStack {
                Circle()
                  .fill(.ultraThinMaterial)
                  .frame(width: 36, height: 36)
                Image(systemName: "xmark")
                  .font(.system(size: 13, weight: .bold, design: .rounded))
                  .foregroundStyle(.primary)
              }
              .contentShape(Circle())
            }
            .buttonStyle(.plain)
          }
          .padding(.horizontal)
          .padding(.top, 56)

          Spacer()

          Text("Point your camera at a PastePoint QR code")
            .font(.subheadline)
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            .padding(.bottom, 56)
        }
      }
    } else {
      ZStack(alignment: .topTrailing) {
        ContentUnavailableView(
          "Scanner Unavailable",
          systemImage: "camera.slash",
          description: Text("QR scanning is not supported on this device."),
        )

        Button { dismiss() } label: {
          ZStack {
            Circle()
              .fill(Color(UIColor.tertiarySystemFill))
              .frame(width: 36, height: 36)
            Image(systemName: "xmark")
              .font(.system(size: 13, weight: .bold, design: .rounded))
              .foregroundStyle(Color(UIColor.secondaryLabel))
          }
          .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
        .padding(.top, 56)
      }
    }
  }
}

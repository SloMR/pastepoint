//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI
import Vision
import VisionKit

// MARK: - Scanner Representable

private struct QRCodeScannerRepresentable: UIViewControllerRepresentable {
  var onCodeScanned: (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .fast,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isHighlightingEnabled: false,
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

// MARK: - Dimming Overlay with Cutout

private struct ScannerDimmingOverlay: View {
  let cutoutSize: CGFloat

  var body: some View {
    GeometryReader { geo in
      let hole = CGRect(
        x: (geo.size.width - cutoutSize) / 2,
        y: (geo.size.height - cutoutSize) / 2,
        width: cutoutSize,
        height: cutoutSize,
      )
      Path { path in
        path.addRect(CGRect(origin: .zero, size: geo.size))
        path.addRoundedRect(in: hole, cornerSize: CGSize(width: 16, height: 16))
      }
      .fill(Color.black.opacity(0.55), style: FillStyle(eoFill: true))
    }
    .ignoresSafeArea()
  }
}

// MARK: - Corner Brackets Shape

private struct ViewfinderBracketsShape: Shape {
  let bracketLength: CGFloat = 28
  let cornerRadius: CGFloat = 4

  func path(in rect: CGRect) -> Path {
    var path = Path()
    let r = cornerRadius
    let l = bracketLength

    // Top-left
    path.move(to: CGPoint(x: rect.minX, y: rect.minY + l))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
    path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
    path.addLine(to: CGPoint(x: rect.minX + l, y: rect.minY))

    // Top-right
    path.move(to: CGPoint(x: rect.maxX - l, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
    path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: .degrees(270), endAngle: .degrees(0), clockwise: false)
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + l))

    // Bottom-right
    path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - l))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
    path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
    path.addLine(to: CGPoint(x: rect.maxX - l, y: rect.maxY))

    // Bottom-left
    path.move(to: CGPoint(x: rect.minX + l, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
    path.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - l))

    return path
  }
}

// MARK: - Main View

struct SettingsScanQRCode: View {
  @Environment(\.dismiss) private var dismiss
  private let logger = Logger(label: "SettingsScanQRCode")

  private let cutoutSize: CGFloat = 240
  @State private var bracketScale: CGFloat = 1.0

  var onCodeScanned: (String) -> Void

  var body: some View {
    if DataScannerViewController.isSupported {
      ZStack {
        // Camera feed
        QRCodeScannerRepresentable { code in
          UINotificationFeedbackGenerator().notificationOccurred(.success)
          logger.info("QR code scanned successfully")
          onCodeScanned(code)
          dismiss()
        }
        .ignoresSafeArea()

        // Dimming overlay with clear cutout
        ScannerDimmingOverlay(cutoutSize: cutoutSize)

        // Animated corner brackets
        ViewfinderBracketsShape()
          .stroke(AppColors.Brand.brand, style: StrokeStyle(lineWidth: 3, lineCap: .round))
          .frame(width: cutoutSize, height: cutoutSize)
          .scaleEffect(bracketScale)
          .animation(
            .easeInOut(duration: 1.8).repeatForever(autoreverses: true),
            value: bracketScale,
          )
          .onAppear { bracketScale = 1.04 }

        // UI chrome
        VStack(spacing: 0) {
          // Header with gradient fade
          HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
              Text("Scan QR Code")
                .font(.headline)
                .foregroundStyle(.white)
              Text("Join a private session")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.65))
            }
            Spacer()
            Button { dismiss() } label: {
              ZStack {
                Circle()
                  .fill(.ultraThinMaterial)
                  .frame(width: 36, height: 36)
                Image(systemName: "xmark")
                  .font(.system(size: 13, weight: .bold, design: .rounded))
                  .foregroundStyle(.white)
              }
              .contentShape(Circle())
            }
            .buttonStyle(.plain)
          }
          .padding(.horizontal, 24)
          .padding(.top, 56)
          .padding(.bottom, 24)
          .background(
            LinearGradient(
              colors: [.black.opacity(0.65), .clear],
              startPoint: .top,
              endPoint: .bottom,
            ),
          )

          Spacer()

          // Bottom instruction card
          HStack(spacing: 12) {
            Image(systemName: "qrcode.viewfinder")
              .font(.system(size: 22, weight: .medium))
              .foregroundStyle(AppColors.Brand.brand)
            Text("Point your camera at a PastePoint QR code")
              .font(.subheadline)
              .foregroundStyle(.white)
              .fixedSize(horizontal: false, vertical: true)
          }
          .padding(.horizontal, 20)
          .padding(.vertical, 16)
          .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
          .padding(.horizontal, 32)
          .padding(.bottom, 56)
          .background(
            LinearGradient(
              colors: [.clear, .black.opacity(0.5)],
              startPoint: .top,
              endPoint: .bottom,
            ),
          )
        }
      }
      .ignoresSafeArea()
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

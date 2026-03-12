//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SimpleToast
import SwiftUI

// MARK: - Toast Style

enum ToastStyle {
    case success
    case error
    case warning
    case info

    var icon: String {
        switch self {
        case .success: "checkmark"
        case .error: "xmark"
        case .warning: "exclamationmark"
        case .info: "info"
        }
    }

    var color: Color {
        switch self {
        case .success: AppColors.Status.success
        case .error: AppColors.Status.danger
        case .warning: AppColors.Status.warning
        case .info: AppColors.Status.info
        }
    }
}

// MARK: - Toast Item

struct ToastItem: Identifiable {
    let id = UUID()
    let message: String
    let style: ToastStyle

    static func success(_ message: String) -> Self { .init(message: message, style: .success) }
    static func error(_ message: String) -> Self { .init(message: message, style: .error) }
    static func warning(_ message: String) -> Self { .init(message: message, style: .warning) }
    static func info(_ message: String) -> Self { .init(message: message, style: .info) }
}

// MARK: - Toast View Modifier

@MainActor private let toastOptions = SimpleToastOptions(
    alignment: .top,
    hideAfter: 3,
    animation: .spring,
    modifierType: .slide,
    dismissOnTap: true,
)

private struct AppToastModifier: ViewModifier {
    @Binding var item: ToastItem?

    func body(content: Content) -> some View {
        content
            .simpleToast(item: $item, options: toastOptions) { toast in
                HStack(spacing: 10) {
                    // Colored icon circle
                    ZStack {
                        Circle()
                            .fill(toast.style.color)
                            .frame(width: 30, height: 30)

                        Image(systemName: toast.style.icon)
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }

                    // Message
                    Text(toast.message)
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 8)
                .padding(.trailing, 16)
                .padding(.vertical, 10)
                .background {
                    Capsule(style: .continuous)
                        .fill(.regularMaterial)
                        .overlay {
                            Capsule(style: .continuous)
                                .strokeBorder(
                                    LinearGradient(
                                        colors: [.white.opacity(0.25), .white.opacity(0.04)],
                                        startPoint: .top,
                                        endPoint: .bottom,
                                    ),
                                    lineWidth: 0.5,
                                )
                        }
                        .shadow(color: .black.opacity(0.14), radius: 22, x: 0, y: 10)
                        .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
    }
}

// MARK: - View Extension

extension View {
    func appToast(item: Binding<ToastItem?>) -> some View {
        modifier(AppToastModifier(item: item))
    }
}

// MARK: - Preview

private struct ToastPreview: View {
    @State private var toast: ToastItem?

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Button("Success") { toast = .success("Code copied to clipboard") }
                .buttonStyle(.borderedProminent)
                .tint(AppColors.Status.success)

            Button("Error") { toast = .error("Failed to start private session") }
                .buttonStyle(.borderedProminent)
                .tint(AppColors.Status.danger)

            Button("Warning") { toast = .warning("Connection lost") }
                .buttonStyle(.borderedProminent)
                .tint(AppColors.Status.warning)

            Button("Info") { toast = .info("Joined General") }
                .buttonStyle(.borderedProminent)
                .tint(AppColors.Status.info)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppColors.Background.background)
        .appToast(item: $toast)
    }
}

#Preview {
    ToastPreview()
}

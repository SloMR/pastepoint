//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI

struct SettingsJoinPrivate: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var services: AppServices

    private let logger = Logger(label: "SettingsJoinPrivate")

    var onSessionJoin: (() -> Void)?

    @State private var sessionCode: String = ""
    @State private var sheetHeight: CGFloat = 320

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {

                // Input
                VStack(alignment: .leading, spacing: 6) {
                    Text("Enter the Session Code")
                        .font(.subheadline)
                        .foregroundStyle(.textPrimary)

                    TextField("Session code", text: $sessionCode)
                        .textFieldStyle(.plain)
                        .font(.body)
                        .foregroundStyle(.textPrimary)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(AppColors.Background.input, in: RoundedRectangle(cornerRadius: 8))

                    Text("Enter the code to join a private chat.")
                        .font(.caption)
                        .foregroundStyle(.textSecondary)
                }

                // Buttons
                HStack(spacing: 12) {
                    Button {
                        logger.info("User joining private session with code: \(sessionCode)")
                        let code = sessionCode.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task {
                            await services.wsService.setupPrivateSession(code)
                            await services.wsService.connect()
                            await services.roomService.listRooms()
                            await services.userService.getUsername()
                            logger.info("Successfully joined private session")
                            dismiss()
                            onSessionJoin?()
                        }
                    } label: {
                        Text("Done")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundStyle(.white)
                            .background(AppColors.Brand.brand, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(sessionCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(sessionCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.6 : 1)

                    Button {
                        logger.info("Dismiss join private session")
                        dismiss()
                    } label: {
                        Text("Cancel")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundStyle(AppColors.Brand.brand)
                            .background(Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(AppColors.Brand.brand, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .fixedSize(horizontal: false, vertical: true)
            .background(
                GeometryReader { proxy in
                    Color.clear.task { sheetHeight = proxy.size.height + 56 }
                },
            )
            .navigationTitle("Join a Private Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if #available(iOS 26, *) {
                        Button(role: .close) {
                            dismiss()
                        }
                    } else {
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
                    }
                }
            }
        }
        .presentationDetents([.height(sheetHeight)])
        .presentationDragIndicator(.visible)
        .presentationBackground(AppColors.Background.background)
    }
}

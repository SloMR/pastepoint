//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI

struct SettingsJoinRoom: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var services: AppServices

    private let logger = Logger(label: "SettingsJoinRoom")

    var onRoomCreate: (() -> Void)?

    @State private var roomName: String = ""
    @State private var sheetHeight: CGFloat = 320

    private var sanitizedRoomName: String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_ "))
        let filtered = String(String.UnicodeScalarView(roomName.unicodeScalars.filter { allowed.contains($0) }))
        return String(filtered.trimmingCharacters(in: .whitespaces).prefix(64))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {

                // Input
                VStack(alignment: .leading, spacing: 6) {
                    Text("Enter the Room Name")
                        .font(.subheadline)
                        .foregroundStyle(.textPrimary)

                    TextField("Room name", text: $roomName)
                        .textFieldStyle(.plain)
                        .font(.body)
                        .foregroundStyle(.textPrimary)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(AppColors.Background.input, in: RoundedRectangle(cornerRadius: 8))

                    Text("Leave it empty if you want a random name.")
                        .font(.caption)
                        .foregroundStyle(.textSecondary)
                }

                // Buttons
                HStack(spacing: 12) {
                    Button {
                        logger.info("User joining room with name: \(sanitizedRoomName)")
                        Task {
                            await services.roomService.joinOrCreateRoom(sanitizedRoomName)
                            logger.info("Successfully joined room: \(sanitizedRoomName)")
                            dismiss()
                            onRoomCreate?()
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
                    .disabled(sanitizedRoomName.isEmpty)
                    .opacity(sanitizedRoomName.isEmpty ? 0.6 : 1)

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
            .navigationTitle("Create a Room")
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

//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Logging
import SwiftUI

struct SettingsPrivateSessionSection: View {
    @EnvironmentObject private var services: AppServices
    @Binding var toast: ToastItem?

    private let logger = Logger(label: "SettingsPrivateSessionSection")

    var body: some View {
        if let code = services.wsService.currentSessionCode {
            activeSessionView(code: code)
        } else {
            joinOrStartView
        }
    }

    private func activeSessionView(code: String) -> some View {
        VStack(alignment: .leading) {
            HStack(alignment: .center, spacing: 0) {
                Image("code")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)
                    .padding(.trailing, 5)

                Text("Code")
                    .font(.subheadline)
                    .foregroundColor(.textPrimary)
            }

            ZStack(alignment: .center) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(.inputBackground)
                    .padding(.horizontal)

                Text(code)
                    .font(.system(size: 18, weight: .medium, design: .monospaced))
                    .foregroundColor(.textPrimary)
                    .padding(.vertical, 14)
            }

            HStack(alignment: .center, spacing: 16) {
                Spacer()

                // Copy Button
                Button {
                    UIPasteboard.general.string = code
                    toast = .success("Code copied to clipboard")
                } label: {
                    Image("copy")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(AppColors.Brand.brand),
                        )
                }
                .buttonStyle(.plain)

                // QR Button
                // TODO: Present QR sheet for session code sharing; add toast = .error("Failed to generate QR") on failure
                Button {
                    // Show QR sheet
                } label: {
                    Image("qrcode")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(AppColors.Brand.brand),
                        )
                }
                .buttonStyle(.plain)

                Spacer()
            }
        }
        .padding(.top, 22)
        .padding(.horizontal)
    }

    private var joinOrStartView: some View {
        VStack(spacing: 8) {
            Button {
                Task {
                    do {
                        let code = try await services.sessionService.getNewSessionCode()
                        await services.wsService.setupPrivateSession(code)
                        await services.wsService.connect()
                        await services.roomService.listRooms()
                        await services.userService.getUsername()
                        toast = .success("Private session started")
                    } catch {
                        logger.error("Cannot get the session code \(error)")
                        toast = .error("Failed to start private session")
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image("plus")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                    Text("Start Private Chat")
                        .font(.headline)
                }
                .foregroundStyle(.brand)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.brand, lineWidth: 0.8),
                )
            }
            .buttonStyle(.plain)

            // TODO: Implement join-by-code flow (prompt for session code input);
            // add toast = .success("Joined private session") on success, toast = .error("Invalid code") on failure
            Button {
                logger.info("Join private chat tapped")
            } label: {
                HStack(spacing: 8) {
                    Text("Join Private Chat")
                        .font(.headline)
                }
                .foregroundStyle(.brand)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.brand, lineWidth: 0.8),
                )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
        .padding(.top, 22)
        .padding(.bottom, 44)
    }
}

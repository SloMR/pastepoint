//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct SettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @ObservedObject var roomService: RoomService
  @ObservedObject var userService: UserService
  @ObservedObject var wsService: WebSocketConnectionService
  @ObservedObject var sessionService: SessionService

  @State private var privacyURLToShow: IdentifiableURL?
  
  private var avatar: some View {
    Image("group")
      .resizable()
      .scaledToFit()
      .frame(width: 40, height: 40)
      .padding(.trailing, 12)
  }
  
  var body: some View {
    VStack(spacing: 0) {
      // MARK: - Header
      HStack(alignment: .center, spacing: 0) {
        avatar
        
        Text(userService.user)
          .font(.title3)
          .foregroundColor(.textPrimary)
        
        Spacer()
        
        Button { dismiss() } label: {
          Image(systemName: "xmark")
            .font(.system(size: 18, weight: .regular))
            .foregroundStyle(.textPrimary)
            .frame(width: 42, height: 42)
            .background(.ultraThinMaterial)
            .clipShape(Circle())
        }
      }
      .padding()
      
      // MARK: - Content
      ScrollView {
        VStack(spacing: 0) {
          // MARK: - Create New Room Button
          Button {
            print("Create new room tapped")
            Task {
              await roomService.joinOrJoinRoom("Testing from iOS") // TODO: Add UI for this one
            }
          } label: {
            HStack(spacing: 8) {
              Image("plus")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 24, height: 24)
              
              Text("Create New Room")
                .font(.headline)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(
              RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(.brand)
            )
          }
          .buttonStyle(.plain)
          .padding(.horizontal)
          .padding(.top, 22)
          .padding(.bottom, 44)
          
          // MARK: - Chat Rooms
          VStack {
            HStack(alignment: .center, spacing: 0) {
              Image("home")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 16, height: 16)
                .padding(.trailing, 5)
              
              Text("Chat Rooms")
                .font(.subheadline)
                .foregroundColor(.textPrimary)
              
              Spacer()
              
              Text("\(roomService.rooms.count) Rooms")
                .font(.caption2)
                .foregroundColor(.textPrimary)
            }
            .padding(.horizontal)
            
            ForEach(roomService.rooms, id: \.self) { room in
              HStack(alignment: .center, spacing: 0) {
                Button {
                  Task {
                    print("Joining room \(room)")
                    await roomService.joinOrJoinRoom(room)
                  }
                } label: {
                  Image("inactive.comment")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)
                    .padding(.trailing, 5)
                    .foregroundStyle(room == roomService.currentRoom ? .brand : .secondary)
                  
                  Text(room)
                    .font(.subheadline)
                    .foregroundColor(room == roomService.currentRoom ? .brand : .textPrimary)
                }

                Spacer()
              }
              .padding(.horizontal, 60)
              .padding(.bottom, 2)
            }
          }
          
          // MARK: - Private Session Section
          if let code = wsService.currentSessionCode {
            // In private session: show code and End Session
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
                } label: {
                  Image("copy")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(
                      RoundedRectangle(cornerRadius: 12)
                        .fill(AppColors.Brand.brand)
                    )
                }
                .buttonStyle(.plain)
                
                // QR Button
                Button {
                  // Show QR sheet
                } label: {
                  Image("qrcode")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(
                      RoundedRectangle(cornerRadius: 12)
                        .fill(AppColors.Brand.brand)
                    )
                }
                .buttonStyle(.plain)

                Spacer()
              }
            }
            .padding(.top, 22)
            .padding(.horizontal)

          } else {
            // Not in private session: show Create and Join
            VStack(spacing: 8) {
              Button {
                Task {
                  do {
                    let code = try await sessionService.getNewSessionCode()
                    await wsService.setupPrivateSession(code)
                    await wsService.connect()
                    await roomService.listRooms()
                    await userService.getUsername()
                  } catch {
                    print("Cannot get the session code \(error)")
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
                    .stroke(.brand, lineWidth: 0.8)
                )
              }
              .buttonStyle(.plain)

              Button {
                print("Join private chat tapped")
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
                    .stroke(.brand, lineWidth: 0.8)
                )
              }
              .buttonStyle(.plain)
            }
            .padding(.horizontal)
            .padding(.top, 22)
            .padding(.bottom, 44)
          }
          
          // MARK: - Members
          VStack {
            HStack(alignment: .center, spacing: 0) {
              Image("users")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 16, height: 16)
                .padding(.trailing, 5)
              
              Text("Members")
                .font(.subheadline)
                .foregroundColor(.textPrimary)
              
              Spacer()
              
              Text("\(roomService.members.filter { $0 != userService.user }.count) Online Now")
                .font(.caption2)
                .foregroundColor(.textPrimary)
            }
            .padding(.horizontal)
            
            Group {
              let others = roomService.members.filter { $0 != userService.user }
              if others.isEmpty {
                Text("No one is online right now")
                  .font(.subheadline)
                  .foregroundColor(.textPrimary)
                  .fontWeight(.bold)
              } else {
                ForEach(others, id: \.self) { member in
                  HStack(alignment: .center, spacing: 0) {
                    Circle().fill(.green).frame(width: 14, height: 14)
                      .padding(.trailing, 6)

                    Text(member)
                      .font(.subheadline)
                      .foregroundColor(.textPrimary)

                    Spacer()

                    Image("link")
                      .renderingMode(.template)
                      .resizable()
                      .scaledToFit()
                      .frame(width: 16, height: 16)
                      .padding(.trailing, 5)
                      .foregroundStyle(.textSecondary)
                  }
                }
              }
            }
            .padding(.horizontal)
            .padding(.top, 22)
          }
          .padding(.top, 12)
        }
      }
      
      Spacer()

      // MARK: - Leave Private Session
      if let code = wsService.currentSessionCode, !code.isEmpty {
        
        Button {
          wsService.disconnect(manual: true)
          Task {
            await wsService.connect(sessionCode: nil)
            await roomService.listRooms()
            await userService.getUsername()
          }
          dismiss()
        } label: {
          HStack(spacing: 8) {
            Image(systemName: "xmark")
              .font(.system(size: 14, weight: .regular))
              .frame(width: 32, height: 32)
            
            Text("Leave Session")
              .font(.headline)
          }
          .foregroundStyle(.red)
          .padding(.horizontal, 14)
          .padding(.vertical, 8)
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
      }
      
      // MARK: - Social Icons
      Divider()
        .padding()
      
      VStack(spacing: 0) {
        HStack(alignment: .center, spacing: 6) {
          Image("linkedin")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: 16, height: 16)
            .padding(.trailing, 5)
            .foregroundStyle(.brand)
          
          Image("github")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: 16, height: 16)
            .padding(.trailing, 5)
            .foregroundStyle(.brand)
          
          Image("x")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: 16, height: 16)
            .padding(.trailing, 5)
            .foregroundStyle(.brand)
          
          Image("instagram")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: 16, height: 16)
            .padding(.trailing, 5)
            .foregroundStyle(.brand)
        }
        
        // MARK: - Privacy & Terms
        Button {
          if let url = URL(string: "https://pastepoint.com/privacy") {
            privacyURLToShow = IdentifiableURL(url: url)
          }
        } label: {
          HStack(spacing: 2) {
            Text("Privacy & Terms")
              .font(.caption2)
              .foregroundColor(.brand)
            
            Image("privacy.and.terms")
              .renderingMode(.template)
              .resizable()
              .scaledToFit()
              .frame(width: 12, height: 12)
              .foregroundStyle(.brand)
          }
          .fontWeight(.bold)
        }
        .buttonStyle(.plain)
        .padding(.vertical, 6)
        
        // MARK: - App Version
        Text("Version \(Bundle.main.appVersion)")
          .font(.caption2)
          .foregroundColor(.textPrimary)
          .padding(.vertical, 4)
        
        // MARK: - Copyrights
        Text("© 2026 PastePoint. All rights reserved.")
          .font(.caption2)
          .foregroundColor(.textPrimary)
          .padding(.vertical, 4)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AppColors.Background.surface)
    .sheet(item: $privacyURLToShow) { identifiableURL in
      SafariView(url: identifiableURL.url)
    }
  }
}

#Preview {
  SettingsView(
    roomService: AppServices.shared.roomService,
    userService: AppServices.shared.userService,
    wsService: AppServices.shared.wsService,
    sessionService: AppServices.shared.sessionService
  )
}

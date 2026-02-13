//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import SwiftUI

struct SettingsView: View {
  @Environment(\.dismiss) private var dismiss
  
  @State private var numberOfRooms: Int = 1
  @State private var numberOfMembers: Int = 1
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
        
        Text("John Doe")
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
              
              Text("\(numberOfRooms) Rooms")
                .font(.caption2)
                .foregroundColor(.textPrimary)
            }
            .padding(.horizontal)
            
            HStack(alignment: .center, spacing: 0) {
              Image("inactive.comment")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 16, height: 16)
                .padding(.trailing, 5)
                .foregroundStyle(.brand)
              
              Text("main")
                .font(.subheadline)
                .foregroundColor(.brand)
              
              Spacer()
            }
            .padding(.horizontal, 60)
            .padding(.vertical, 8)
          }
          
          // MARK: - Start Private Chat Button
          Button {
            print("Start private chat tapped")
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
          .padding(.horizontal)
          .padding(.top, 44)
          .padding(.bottom, 8)
          
          // MARK: - Join Private Chat Button
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
          .padding(.horizontal)
          .padding(.bottom, 44)
          
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
              
              Text("\(numberOfMembers) Online Now")
                .font(.caption2)
                .foregroundColor(.textPrimary)
            }
            .padding(.horizontal)
            
            HStack(alignment: .center, spacing: 0) {
              if numberOfMembers < 1 {
                Text("No one is online right now")
                  .font(.subheadline)
                  .foregroundColor(.textPrimary)
                  .fontWeight(.bold)
              } else {
                Circle().fill(.green).frame(width: 14, height: 14)
                  .padding(.trailing, 6)
                
                Text("John Doe")
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
            .padding(.horizontal)
            .padding(.top, 22)
          }
          .padding(.top, 12)
        }
      }
      
      Spacer()
      
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
  SettingsView()
}

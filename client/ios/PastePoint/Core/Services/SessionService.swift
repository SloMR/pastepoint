//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import Combine

struct CreateSessionResponse: Decodable {
  let code: String
}

@MainActor
final class SessionService: ObservableObject {
  public func getNewSessionCode() async throws -> String {
    let urlString = "https://10.10.50.107:9000/create-session"
    guard let url = URL(string: urlString) else {
      throw SessionError.invalidURL
    }
    
#if DEBUG
    let session = URLSession(
      configuration: .default,
      delegate: InsecureTLSDelegate(),
      delegateQueue: nil
    )
    let (data, response) = try await session.data(from: url)
#else
    let (data, response) = try await URLSession.shared.data(from: url)
#endif
    
    guard let httpResponse = response as? HTTPURLResponse,
          (200...299).contains(httpResponse.statusCode) else {
      throw SessionError.serverError
    }
    
    let decoded = try JSONDecoder().decode(CreateSessionResponse.self, from: data)
    print("Private Session Code: \(decoded.code)")
    return decoded.code
  }
  
  static func sanitizeSessionCode(_ code: String) -> String {
    let allowed = CharacterSet.alphanumerics
    let filteredScalars = code.unicodeScalars.filter { allowed.contains($0) }
    return String(String.UnicodeScalarView(filteredScalars))
  }
  
  static func isValidSessionCode(_ code: String) -> Bool {
    let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count == 10 else { return false }
    return trimmed.allSatisfy { $0.isLetter || $0.isNumber }
  }
}

enum SessionError: LocalizedError {
  case invalidURL
  case serverError
  var errorDescription: String? {
    switch self {
    case .invalidURL: return "Invalid session URL"
    case .serverError: return "Failed to create session"
    }
  }
}


//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation
import SwiftUI
import Combine

#if DEBUG
final class InsecureTLSDelegate: NSObject, URLSessionDelegate {
  
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard let trust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }
    
    completionHandler(.useCredential, URLCredential(trust: trust))
  }
}
#endif

private let sessionCodeStorageKey = "session_code"

@MainActor
final class WebSocketConnectionService: ObservableObject {
  
  // MARK: - Properties
  
  @Published var message: String?
  @Published var systemMessage: String?
  @Published var signalMessage: SignalMessage?
  
  private var task: URLSessionWebSocketTask?
  private var receiveTask: Task<Void, Never>?
  private var pingTask: Task<Void, Never>?
  
  @Published private(set) var sessionCode: String?
  private var isConnecting = false
  private var manualDisconnect = false
  var currentSessionCode: String? { sessionCode }
  
  private var reconnectAttempts = 0
  private let maxReconnectAttempts = 5
  private var reconnectDelay: Double = 1
  private let maxReconnectDelay: Double = 30
  public var isConnected: Bool {
    task?.state == .running
  }
  
  // MARK: - Session Code
  
  private func getSessionCodeFromStorage() -> String? {
    UserDefaults.standard.string(forKey: sessionCodeStorageKey)
  }
  
  private func saveSessionCode(_ code: String?) {
    if let code = code {
      UserDefaults.standard.set(code, forKey: sessionCodeStorageKey)
    } else {
      UserDefaults.standard.removeObject(forKey: sessionCodeStorageKey)
    }
  }
  
  private func clearSessionCode() {
    sessionCode = nil
    UserDefaults.standard.removeObject(forKey: sessionCodeStorageKey)
  }
  
  public func setupPrivateSession(_ code: String) async {
    guard SessionService.isValidSessionCode(code) else {
      print("Private session code is not valid: \(code)")
      return
    }
    if (self.sessionCode != nil) {
      self.disconnect(manual: true)
    }
    let sanitizedCode = SessionService.sanitizeSessionCode(code)
    saveSessionCode(sanitizedCode)
  }
  
  // MARK: - Connect
  
  func connect(sessionCode code: String? = nil, isReconnectAttempt: Bool = false) async {
    if isConnecting {
      print("Already connecting — ignored")
      return
    }
    
    let effectiveCode = code ?? sessionCode ?? getSessionCodeFromStorage()
    if isConnected, sessionCode == effectiveCode {
      print("Already connected to same session")
      return
    }
    
    if isConnected {
      teardownConnection()
      try? await Task.sleep(for: .milliseconds(200)) // TODO: Remove this one
    }

    isConnecting = true
    manualDisconnect = false
    sessionCode = effectiveCode
    if let effectiveCode = effectiveCode {
      saveSessionCode(effectiveCode)
    }
    
    let urlString = "wss://10.10.50.107:9000/ws\(effectiveCode.map { "/\($0)" } ?? "")"
    guard let url = URL(string: urlString) else {
      print("Invalid WS URL")
      isConnecting = false
      return
    }
    
    print("Connecting \(urlString)")
    
#if DEBUG
    let session = URLSession(
      configuration: .default,
      delegate: InsecureTLSDelegate(),
      delegateQueue: nil
    )
#else
    let session = URLSession(configuration: .default)
#endif

    task = session.webSocketTask(with: url)
    task?.resume()
    
    await startReceiveLoop()
    await startPingLoop()
    
    if !isReconnectAttempt {
      reconnectAttempts = 0
      reconnectDelay = 1
    }
    isConnecting = false
  }
  
  // MARK: - Receive Loop
  
  private func startReceiveLoop() async {
    receiveTask?.cancel()
    
    receiveTask = Task {
      while !Task.isCancelled {
        do {
          let msg = try await task?.receive()
          
          switch msg {
          case .string(let text):
            handleIncoming(text)
            
          case .data(let data):
            print("Data recived \(data.count) bytes")
            
          case .some(let blob):
            print("Unknown data recived \(blob)")
            
          case .none:
            break
          }
          
        } catch {
          print("Receive failed \(error.localizedDescription)")
          guard !Task.isCancelled else { break }
          await scheduleReconnect()
          break
        }
      }
    }
  }
  
  // MARK: - Message Routing
  
  private func handleIncoming(_ text: String) {
    let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
    
    if message.hasPrefix("[SignalMessage]") {
      let json = message.replacingOccurrences(of: "[SignalMessage]", with: "").trimmingCharacters(in: .whitespaces)
      guard let dict = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
            let sig = SignalMessage(from: dict) else { return }
      signalMessage = sig
    } else if isSystemMessage(message: message) {
      systemMessage = message
    } else {
      self.message = message
    }
  }
  
  private func isSystemMessage(message msg: String) -> Bool {
    msg.contains("[SystemMessage]") ||
    msg.contains("[SystemJoin]") ||
    msg.contains("[SystemRooms]") ||
    msg.contains("[SystemMembers]") ||
    msg.contains("[SystemName]")
  }
  
  // MARK: - Send
  
  func send(_ text: String) async {
    guard isConnected else {
      print("Send failed — socket not open")
      return
    }
    
    try? await task?.send(.string(text))
  }
  
  func sendSignal(_ obj: Any) async {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let json = String(data: data, encoding: .utf8)
    else { return }
    
    await send("[SignalMessage] \(json)")
  }
  
  // MARK: - Ping Heartbeat
  
  private func startPingLoop() async {
    let oldTask = pingTask
    pingTask = nil
    oldTask?.cancel()
    if let oldTask {
      await oldTask.value
    }

    pingTask = Task {
      while isConnected {
        do {
          try await Task.sleep(for: .seconds(10))
          guard !Task.isCancelled else { break }
          print("Sending Ping...")
          task?.sendPing { error in
            if let error = error {
              print("Ping failed: \(error.localizedDescription)")
            } else {
              print("Pong received, connection is healthy")
            }
          }
        } catch {
          print("Ping failed: \(error.localizedDescription)")
          break
        }
      }
    }
  }
  
  // MARK: - Teardown
  
  private func teardownConnection() {
    receiveTask?.cancel()
    receiveTask = nil
    pingTask?.cancel()
    pingTask = nil
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
  }
  
  // MARK: - Reconnect
  
  private func scheduleReconnect() async {
    guard !manualDisconnect else { return }
    
    reconnectAttempts += 1
    
    if reconnectAttempts > maxReconnectAttempts {
      print("Max reconnect reached")
      return
    }
    
    let delay = min(reconnectDelay * pow(2, Double(reconnectAttempts-1)),
                    maxReconnectDelay)
    
    print("Reconnect in \(delay)s")
    
    try? await Task.sleep(for: .seconds(delay))
    await connect(sessionCode: sessionCode, isReconnectAttempt: true)
  }
  
  // MARK: - Disconnect
  
  func disconnect(manual: Bool = true) {
    print("Disconnecting from the WebSocket")
    manualDisconnect = manual
    if manual {
      clearSessionCode()
    }
    teardownConnection()
  }
}

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
  
  // MARK: - Connection State
  
  @Published private(set) var isConnected  = false
  @Published private(set) var isConnecting = false
  
  // MARK: - Message Subjects
  
  let message       = PassthroughSubject<String, Never>()
  let systemMessage = PassthroughSubject<String, Never>()
  let signalMessage = PassthroughSubject<SignalMessage, Never>()
  let didReconnect  = PassthroughSubject<Void, Never>()
  
  // MARK: - Properties
  
  private var task: URLSessionWebSocketTask?
  private var receiveTask: Task<Void, Never>?
  
  private var pingTask: Task<Void, Never>?
  private let pingInterval: Duration = .seconds(30)
  
  @Published private(set) var sessionCode: String?
  public var currentSessionCode: String? { sessionCode }
  
  private var manualDisconnect = false
  private var reconnectAttempts = 0
  private let maxReconnectAttempts = 5
  private let baseReconnectDelaySec: Double = 1
  private let maxReconnectDelaySec:  Double = 30
  
  // MARK: - Session Code
  
  private func getSessionCodeFromStorage() -> String? {
    UserDefaults.standard.string(forKey: sessionCodeStorageKey)
  }
  
  private func saveSessionCode(_ code: String?) {
    if let code {
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
    if sessionCode != nil {
      disconnect(manual: true)
    }
    saveSessionCode(SessionService.sanitizeSessionCode(code))
  }
  
  // MARK: - Connect
  
  func connect(sessionCode code: String? = nil, isReconnectAttempt: Bool = false) async {
    guard !isConnecting else {
      print("Already connecting — ignored")
      return
    }
    
    let effectiveCode = code ?? sessionCode ?? getSessionCodeFromStorage()
    
    if isConnected, sessionCode == effectiveCode {
      print("Already connected to same session")
      return
    }
    
    // Tear down any task before opening a new one.
    if task != nil {
      teardownConnection()
      try? await Task.sleep(for: .milliseconds(200)) // TODO: Remove this one
    }
    
    isConnecting = true
    manualDisconnect = false
    sessionCode = effectiveCode
    if let effectiveCode {
      saveSessionCode(effectiveCode)
    }
    
    // Reset the retry counter on every intentional (non-reconnect) connect so
    // that NWPathMonitor / foreground transitions always get a fresh 5-attempt window.
    if !isReconnectAttempt {
      reconnectAttempts = 0
    }
    
    let urlString = "wss://\(AppEnvironment.apiUrl)/ws\(effectiveCode.map { "/\($0)" } ?? "")"
    guard let url = URL(string: urlString) else {
      print("Invalid WS URL: \(urlString)")
      isConnecting = false
      return
    }
    
    print("Connecting to \(urlString)")
    
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
    
    isConnected = true
    isConnecting = false
    
    startReceiveLoop()
    startPingLoop()
    
    if isReconnectAttempt {
      didReconnect.send()
    }
  }
  
  // MARK: - Receive Loop
  
  private func startReceiveLoop() {
    receiveTask?.cancel()
    receiveTask = Task {
      while !Task.isCancelled {
        do {
          guard let msg = try await task?.receive() else { break }
          
          // Any successful receive confirms the connection is alive —
          // reset the retry counter so future drops get a fresh window.
          reconnectAttempts = 0
          
          switch msg {
          case .string(let text):
            handleIncoming(text)
          case .data(let data):
            print("Binary frame received: \(data.count) bytes (ignored)")
          @unknown default:
            break
          }
        } catch {
          guard !Task.isCancelled else { break }

          if isPermanentError(error) {
            print("Session code invalid or expired — falling back to public session")
            clearSessionCode()
            teardownConnection()
            await connect(sessionCode: nil, isReconnectAttempt: false)
            break
          }
          
          print("Receive error: \(error.localizedDescription)")
          await scheduleReconnect()
          break
        }
      }
    }
  }
  
  private func isPermanentError(_ error: Error) -> Bool {
    (error as? URLError)?.code == .badServerResponse
  }
  
  // MARK: - Message Routing
  
  private func handleIncoming(_ text: String) {
    let msg = text.trimmingCharacters(in: .whitespacesAndNewlines)
    
    if msg.hasPrefix("[SignalMessage]") {
      let json = msg
        .replacingOccurrences(of: "[SignalMessage]", with: "")
        .trimmingCharacters(in: .whitespaces)
      guard
        let dict = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
        let sig  = SignalMessage(from: dict)
      else { return }
      signalMessage.send(sig)
    } else if isSystemMessage(msg) {
      systemMessage.send(msg)
    } else {
      message.send(msg)
    }
  }
  
  private func isSystemMessage(_ msg: String) -> Bool {
    msg.contains("[SystemMessage]") ||
    msg.contains("[SystemJoin]")    ||
    msg.contains("[SystemRooms]")   ||
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
    guard
      let data = try? JSONSerialization.data(withJSONObject: obj),
      let json = String(data: data, encoding: .utf8)
    else { return }
    
    await send("[SignalMessage] \(json)")
  }
  
  // MARK: - Ping / Heartbeat
  
  private func startPingLoop() {
    pingTask?.cancel()

    pingTask = Task {
      while !Task.isCancelled, isConnected {
        do {
          try await Task.sleep(for: pingInterval)
          guard !Task.isCancelled, isConnected else { break }
          
          task?.sendPing { [weak self] error in
            guard let self else { return }
            if let error {
              print("Ping failed: \(error.localizedDescription) — triggering reconnect")

              // sendPing callback fires on an arbitrary queue; hop to MainActor.
              Task { @MainActor in
                guard self.isConnected, !self.isConnecting else { return }
                self.teardownConnection()
                await self.scheduleReconnect()
              }
            }
          }
        } catch {
          break
        }
      }
    }
  }
  
  // MARK: - Teardown
  
  private func teardownConnection() {
    isConnected  = false
    isConnecting = false

    receiveTask?.cancel()
    receiveTask = nil

    pingTask?.cancel()
    pingTask = nil

    task?.cancel(with: .goingAway, reason: nil)
    task = nil
  }
  
  // MARK: - Reconnect
  
  private func scheduleReconnect() async {
    isConnected = false
    guard !manualDisconnect, !isConnecting else { return }
    
    reconnectAttempts += 1
    guard reconnectAttempts <= maxReconnectAttempts else {
      print("Max reconnect attempts (\(maxReconnectAttempts)) reached — giving up")
      return
    }
    
    let delay = min(
      baseReconnectDelaySec * pow(2.0, Double(reconnectAttempts - 1)),
      maxReconnectDelaySec
    )
    print("Reconnecting in \(Int(delay))s (attempt \(reconnectAttempts)/\(maxReconnectAttempts))")
    
    try? await Task.sleep(for: .seconds(delay))
    guard !manualDisconnect else { return }
    
    await connect(sessionCode: sessionCode, isReconnectAttempt: true)
  }
  
  // MARK: - Disconnect
  
  func disconnect(manual: Bool = true) {
    print("Disconnecting (manual: \(manual))")
    manualDisconnect = manual
    if manual { clearSessionCode() }
    teardownConnection()
  }
}

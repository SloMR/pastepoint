//
//  Copyright © 2026 PastePoint. All rights reserved.
//  SPDX-License-Identifier: GPL-3.0-only
//

import Foundation

private extension JSONEncoder {
  nonisolated static let dataChannel: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }()
}

private extension JSONDecoder {
  nonisolated static let dataChannel: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }()
}

/// Keys of the wire envelope `{type, payload}`.
private nonisolated enum EnvelopeKey: String, CodingKey {
  case type
  case payload
}

/// Wire format; do not change raw values.
nonisolated enum DataChannelMessageType: String, Encodable {
  case chat
  case fileOffer = "file-offer"
  case fileAccept = "file-accept"
  case fileDecline = "file-decline"
  case fileCancelUpload = "file-cancel-upload"
  case fileCancelDownload = "file-cancel-download"
  case fileReceived = "file-received"

  /// Binary frames.
  case fileChunk = "file-chunk"
}

nonisolated enum DataChannelMessage {

  // MARK: Encoding

  /// The wire envelope: `{type:"chat", payload:{...}}`.
  private struct Envelope<Payload: Encodable>: Encodable {
    let type: DataChannelMessageType
    let payload: Payload
  }

  private static func encodeEnvelope<T: Encodable>(
    type: DataChannelMessageType,
    payload: T,
  ) throws -> Data {
    try JSONEncoder.dataChannel.encode(Envelope(type: type, payload: payload))
  }

  static func encodeChat(_ chat: ChatMessage) throws -> Data {
    try encodeEnvelope(type: .chat, payload: chat)
  }

  static func encodeFileOffer(_ filePayload: FileOfferPayload) throws -> Data {
    try encodeEnvelope(type: .fileOffer, payload: filePayload)
  }

  static func encodeFileAccept(_ filePayload: FileAcceptPayload) throws -> Data {
    try encodeEnvelope(type: .fileAccept, payload: filePayload)
  }

  static func encodeFileDecline(_ filePayload: FileDeclinePayload) throws -> Data {
    try encodeEnvelope(type: .fileDecline, payload: filePayload)
  }

  static func encodeFileCancelUpload(_ filePayload: FileCancelPayload) throws -> Data {
    try encodeEnvelope(type: .fileCancelUpload, payload: filePayload)
  }

  static func encodeFileCancelDownload(_ filePayload: FileCancelPayload) throws -> Data {
    try encodeEnvelope(type: .fileCancelDownload, payload: filePayload)
  }

  static func encodeFileReceived(_ filePayload: FileReceivedPayload) throws -> Data {
    try encodeEnvelope(type: .fileReceived, payload: filePayload)
  }

  // MARK: Decoding

  /// Decoded inbound envelope. One case per JSON message type, plus `.unknown` for any
  /// `type` the receiver doesn't recognize (including binary-only `file-chunk`).
  enum Decoded: Decodable, Sendable {
    case chat(ChatMessage)
    case fileOffer(FileOfferPayload)
    case fileAccept(FileAcceptPayload)
    case fileDecline(FileDeclinePayload)
    case fileCancelUpload(FileCancelPayload)
    case fileCancelDownload(FileCancelPayload)
    case fileReceived(FileReceivedPayload)
    case unknown(type: String)

    init(from decoder: any Decoder) throws {
      let envelope = try decoder.container(keyedBy: EnvelopeKey.self)
      let type = try envelope.decode(String.self, forKey: .type)

      switch DataChannelMessageType(rawValue: type) {
      case .chat:
        self = .chat(try envelope.decode(ChatMessage.self, forKey: .payload))
      case .fileOffer:
        self = .fileOffer(try envelope.decode(FileOfferPayload.self, forKey: .payload))
      case .fileAccept:
        self = .fileAccept(try envelope.decode(FileAcceptPayload.self, forKey: .payload))
      case .fileDecline:
        self = .fileDecline(try envelope.decode(FileDeclinePayload.self, forKey: .payload))
      case .fileCancelUpload:
        self = .fileCancelUpload(try envelope.decode(FileCancelPayload.self, forKey: .payload))
      case .fileCancelDownload:
        self = .fileCancelDownload(try envelope.decode(FileCancelPayload.self, forKey: .payload))
      case .fileReceived:
        self = .fileReceived(try envelope.decode(FileReceivedPayload.self, forKey: .payload))
      case .fileChunk, nil:
        self = .unknown(type: type)
      }
    }
  }

  static func decode(_ data: Data) throws -> Decoded {
    try JSONDecoder.dataChannel.decode(Decoded.self, from: data)
  }
}

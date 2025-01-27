// File transfer constants
export const CHUNK_SIZE = 32 * 1024; // 32 KB
export const MAX_BUFFERED_AMOUNT = 256 * 1024; // 256 KB
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 128 * 1024; // 128 KB

// WebRTC constants
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_DELAY = 2000;

export const OFFER_OPTIONS = {
  offerToReceiveAudio: false,
  offerToReceiveVideo: false,
};

export const RTC_SIGNALING_STATES = {
  CLOSED: 'closed',
  HAVE_LOCAL_OFFER: 'have-local-offer',
  HAVE_LOCAL_PRANSWER: 'have-local-pranswer',
  HAVE_REMOTE_OFFER: 'have-remote-offer',
  HAVE_REMOTE_PRANSWER: 'have-remote-pranswer',
  STABLE: 'stable',
} as const;

export type RTCSignalingState = (typeof RTC_SIGNALING_STATES)[keyof typeof RTC_SIGNALING_STATES];

export const ICE_SERVERS = [
  // Google STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },

  // Third-party/public STUN servers
  { urls: 'stun:stun.voipbuster.com' },
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.iptel.org' },
];

// WebRTC data channel constants
export const DATA_CHANNEL_OPTIONS = {
  ordered: true,
  maxPacketLifeTime: 3000,
};

// WebRTC signaling message types
export const SIGNAL_MESSAGE_TYPES = {
  OFFER: 'offer',
  ANSWER: 'answer',
  CANDIDATE: 'candidate',
  FILE_OFFER: 'file-offer',
  FILE_RESPONSE: 'file-response',
};

export enum SignalMessageType {
  OFFER = 'offer',
  ANSWER = 'answer',
  CANDIDATE = 'candidate',
}

// WebRTC file transfer message types
export const FILE_TRANSFER_MESSAGE_TYPES = {
  FILE_CHUNK: 'file-chunk',
  FILE_ACCEPT: 'file-accept',
  FILE_DECLINE: 'file-decline',
  FILE_OFFER: 'file-offer',
  FILE_CANCEL_UPLOAD: 'file-cancel-upload',
  FILE_CANCEL_DOWNLOAD: 'file-cancel-download',
};

// WebRTC data channel message types
export const DATA_CHANNEL_MESSAGE_TYPES = {
  CHAT: 'chat',
  FILE: 'file',
};

// Chat message interface
export interface ChatMessage {
  from: string;
  text: string;
  timestamp: Date;
}

// Logger service constants
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'TRACE';

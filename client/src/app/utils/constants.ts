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

export const ICE_SERVERS = [
  {
    urls: 'stun:stun.l.google.com:19302',
  },
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

// WebRTC file transfer message types
export const FILE_TRANSFER_MESSAGE_TYPES = {
  FILE_CHUNK: 'file-chunk',
  FILE_ACCEPT: 'file-accept',
  FILE_DECLINE: 'file-decline',
  FILE_OFFER: 'file-offer',
};

// WebRTC data channel message types
export const DATA_CHANNEL_MESSAGE_TYPES = {
  CHAT: 'chat',
  FILE: 'file',
};

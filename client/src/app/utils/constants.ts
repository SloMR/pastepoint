// File transfer constants
export const KB = 1024;
export const MB = 1024 * KB;

export const CHUNK_SIZE = 256 * KB;
export const MAX_BUFFERED_AMOUNT = 2 * MB;
export const BUFFERED_AMOUNT_LOW_THRESHOLD = MB;

// Local storage keys
export const SESSION_CODE_KEY = 'session_code';
export const LANGUAGE_PREFERENCE_KEY = 'language_preference';
export const APP_VERSION_KEY = 'app_version';
export const THEME_PREFERENCE_KEY = 'theme_preference';

// Inactivity timeout constants
export const IDLE_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
export const BACKGROUND_EXPIRY_THRESHOLD = 5 * 60 * 1000; // 5 minutes

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
  maxPacketLifeTime: 30000,
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

export interface SignalMessage {
  type: SignalMessageType;
  data: unknown;
  from: string;
  to: string;
  sequence?: number;
}

export interface DataChannelMessage {
  type: string;
  payload: unknown;
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

// File transfer interfaces
export type FileTransferStatus = 'pending' | 'accepted' | 'declined' | 'completed';

export interface FileUpload {
  fileId: string;
  file: File;
  currentOffset: number;
  isPaused: boolean;
  targetUser: string;
  progress: number;
}

export interface FileDownload {
  fileId: string;
  fileName: string;
  fileSize: number;
  fromUser: string;
  receivedSize: number;
  dataBuffer: Uint8Array[];
  progress: number;
  isAccepted: boolean;
}

// Metadata configuration interfaces
/**
 * Configuration interface for metadata settings
 */
export interface MetaConfig {
  title?: string;
  description?: string;
  keywords?: string;
  author?: string;
  canonical?: string;
  robots?: string;
  themeColor?: string;

  // Viewport configuration for responsive design
  viewport?: string;

  // Cache control headers
  cacheControl?: {
    pragma?: string;
    cacheControl?: string;
    expires?: string;
  };

  // Open Graph
  og?: {
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    image?: string;
    siteName?: string;
  };

  // Twitter Cards
  twitter?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
  };
}

/**
 * Interface for structured data (JSON-LD)
 */
export interface StructuredData {
  [key: string]: unknown;
}

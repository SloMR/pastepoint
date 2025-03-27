import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WebSocketConnectionService } from '../communication/websocket-connection.service';
import { UserService } from '../user-management/user.service';
import {
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  OFFER_OPTIONS,
  DATA_CHANNEL_OPTIONS,
  SIGNAL_MESSAGE_TYPES,
  DATA_CHANNEL_MESSAGE_TYPES,
  FILE_TRANSFER_MESSAGE_TYPES,
  ICE_SERVERS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY,
  ChatMessage,
  RTC_SIGNALING_STATES,
  SignalMessageType,
  DataChannelMessage,
  SignalMessage,
  MAX_BUFFERED_AMOUNT,
} from '../../../utils/constants';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class WebRTCService {
  public dataChannelOpen$ = new BehaviorSubject<boolean>(false);
  public chatMessages$ = new Subject<ChatMessage>();

  public fileOffers$ = new Subject<{
    fileName: string;
    fileSize: number;
    fromUser: string;
    fileId: string;
  }>();
  public fileResponses$ = new Subject<{ accepted: boolean; fromUser: string; fileId: string }>();
  public fileUploadCancelled$ = new Subject<{ fromUser: string; fileId: string }>();
  public fileDownloadCancelled$ = new Subject<{ fromUser: string; fileId: string }>();
  public bufferedAmountLow$ = new Subject<string>();
  public incomingFileChunk$ = new Subject<{
    fromUser: string;
    fileId: string;
    chunk: ArrayBuffer;
  }>();
  private pendingChunks = new Map<
    string, // fromUser
    { fileId: string; chunkSize: number }
  >();

  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private candidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private messageQueues = new Map<string, (DataChannelMessage | ArrayBuffer)[]>();
  private reconnectAttempts = new Map<string, number>();
  private connectionLocks = new Set<string>();
  private lastSequences = new Map<string, number>();

  constructor(
    private wsService: WebSocketConnectionService,
    private userService: UserService,
    private zone: NgZone,
    private toaster: ToastrService,
    public translate: TranslateService,
    private logger: NGXLogger
  ) {
    this.wsService.signalMessages$.subscribe((message) => {
      if (message) {
        this.logger.debug('WebRTCService', `Received signal message: ${JSON.stringify(message)}`);
        this.handleSignalMessage(message);
      }
    });
  }

  public initiateConnection(targetUser: string): void {
    if (this.peerConnections.has(targetUser) || this.connectionLocks.has(targetUser)) {
      this.logger.warn('initiateConnection', `PeerConnection with ${targetUser} already exists.`);
      return;
    }

    this.connectionLocks.add(targetUser);

    this.logger.info('initiateConnection', `Initiating connection with ${targetUser}`);
    const peerConnection = this.createPeerConnection(targetUser);

    try {
      const dataChannel = peerConnection.createDataChannel('data', DATA_CHANNEL_OPTIONS);
      this.setupDataChannel(dataChannel, targetUser);
      this.dataChannels.set(targetUser, dataChannel);

      const offerTimeout = setTimeout(() => {
        this.logger.error('initiateConnection', `Offer timeout with ${targetUser}`);
        this.reconnect(targetUser);
      }, 15000);

      peerConnection
        .createOffer(OFFER_OPTIONS)
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
          clearTimeout(offerTimeout);
          this.sendSignalMessage({
            type: SignalMessageType.OFFER,
            data: peerConnection.localDescription,
            to: targetUser,
            sequence: this.getNextSequence(targetUser),
          });
        })
        .catch((error) => {
          this.logger.error('initiateConnection', `Offer creation failed: ${error}`);
          this.reconnect(targetUser);
        })
        .finally(() => this.connectionLocks.delete(targetUser));
    } catch (error) {
      this.logger.error('initiateConnection', `Connection initiation failed: ${error}`);
      this.connectionLocks.delete(targetUser);
    }
  }

  private reconnect(targetUser: string) {
    this.logger.info('reconnect', `Reconnecting WebRTC with ${targetUser}...`);

    const peerConnection = this.peerConnections.get(targetUser);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(targetUser);
    }

    this.initiateConnection(targetUser);
    this.reconnectAttempts.set(targetUser, 0);
  }

  private createPeerConnection(targetUser: string): RTCPeerConnection {
    const configuration = {
      iceServers: ICE_SERVERS,
    };

    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const message: SignalMessage = {
          type: SignalMessageType.CANDIDATE,
          data: event.candidate,
          from: this.userService.user,
          to: targetUser,
        };
        this.wsService.sendSignalMessage(message);
      }
    };

    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      this.setupDataChannel(dataChannel, targetUser);
      this.dataChannels.set(targetUser, dataChannel);
    };

    peerConnection.onconnectionstatechange = () => {
      if (
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'disconnected'
      ) {
        this.handleDisconnection(targetUser);
      } else {
        this.logger.info(
          'createPeerConnection',
          `Connection state with ${targetUser}: ${peerConnection.connectionState}`
        );
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (
        peerConnection.iceConnectionState === 'disconnected' ||
        peerConnection.iceConnectionState === 'failed'
      ) {
        this.handleDisconnection(targetUser);
      } else {
        this.logger.info(
          'createPeerConnection',
          `ICE connection state with ${targetUser}: ${peerConnection.iceConnectionState}`
        );
      }
    };

    this.peerConnections.set(targetUser, peerConnection);
    this.candidateQueues.set(targetUser, []);

    return peerConnection;
  }

  private setupDataChannel(channel: RTCDataChannel, targetUser: string): void {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this.logger.info('setupDataChannel', `Data channel with ${targetUser} is open`);
      this.dataChannelOpen$.next(true);

      const queuedMessages = this.messageQueues.get(targetUser);
      if (queuedMessages && queuedMessages.length > 0) {
        queuedMessages.forEach((msg) => {
          if (typeof msg === 'object' && !(msg instanceof ArrayBuffer)) {
            channel.send(JSON.stringify(msg));
          } else {
            channel.send(msg);
          }
        });
        this.messageQueues.set(targetUser, []);
      } else {
        this.logger.info('setupDataChannel', `No queued messages for ${targetUser}`);
      }
    };

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, targetUser);
    };

    channel.onerror = (ev: Event) => {
      if ('error' in ev) {
        const rtcErrorEvent = ev as RTCErrorEvent;
        const errorMsg =
          rtcErrorEvent.error?.message ||
          rtcErrorEvent.error?.toString() ||
          'Unknown RTCErrorEvent';
        this.logger.error('setupDataChannel', `Data Channel Error with ${targetUser}: ${errorMsg}`);
      } else {
        this.logger.error(
          'setupDataChannel',
          `Data Channel Error with ${targetUser}: ${JSON.stringify(ev)}`
        );
      }
    };

    channel.onclose = () => {
      this.logger.info('setupDataChannel', `Data channel with ${targetUser} is closed`);
      this.dataChannelOpen$.next(false);

      this.dataChannels.delete(targetUser);
      const peerConnection = this.peerConnections.get(targetUser);
      if (peerConnection) {
        peerConnection.close();
        this.peerConnections.delete(targetUser);
      }
    };

    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    channel.onbufferedamountlow = () => {
      this.bufferedAmountLow$.next(targetUser);
    };
  }

  private handleDisconnection(targetUser: string) {
    const attempts = this.reconnectAttempts.get(targetUser) || 0;
    if (attempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(targetUser, attempts + 1);
      this.logger.warn(
        'handleDisconnection',
        `Attempt ${attempts + 1}: Reconnecting to ${targetUser} in ${
          RECONNECT_DELAY / 1000
        } seconds...`
      );

      setTimeout(() => {
        if (!this.peerConnections.has(targetUser)) {
          this.reconnect(targetUser);
        }
      }, RECONNECT_DELAY);
    } else {
      this.logger.error(
        'handleDisconnection',
        `Max reconnection attempts reached for ${targetUser}. Could not reconnect.`
      );
      this.toaster.warning(
        this.translate.instant('CONNECTION_LOST'),
        this.translate.instant('CONNECTION_LOST_DESC')
      );
      this.closePeerConnection(targetUser);
    }
  }

  private handleDataChannelMessage(data: any, targetUser: string): void {
    this.zone.run(() => {
      if (typeof data === 'string') {
        const message: DataChannelMessage = JSON.parse(data);
        switch (message.type) {
          case DATA_CHANNEL_MESSAGE_TYPES.CHAT: {
            let chatMsg = message.payload as ChatMessage;
            chatMsg.timestamp = new Date(chatMsg.timestamp);
            this.chatMessages$.next(chatMsg);
            break;
          }
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER:
            this.logger.info('handleDataChannelMessage', `Received file offer from ${targetUser}`);
            this.fileOffers$.next({
              fileId: message.payload.fileId,
              fileName: message.payload.fileName,
              fileSize: message.payload.fileSize,
              fromUser: targetUser,
            });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT:
            this.logger.info(
              'handleDataChannelMessage',
              `Received file acceptance from ${targetUser}`
            );
            this.fileResponses$.next({
              accepted: true,
              fromUser: targetUser,
              fileId: message.payload.fileId,
            });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_DECLINE:
            this.logger.info(
              'handleDataChannelMessage',
              `Received file decline from ${targetUser}`
            );
            this.fileResponses$.next({
              accepted: false,
              fromUser: targetUser,
              fileId: message.payload.fileId,
            });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_UPLOAD:
            this.logger.info(
              'handleDataChannelMessage',
              `Received uploading file cancellation from ${targetUser}`
            );
            this.fileUploadCancelled$.next({
              fromUser: targetUser,
              fileId: message.payload.fileId,
            });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_DOWNLOAD:
            this.logger.info(
              'handleDataChannelMessage',
              `Received downloading file cancellation from ${targetUser}`
            );
            this.fileDownloadCancelled$.next({
              fromUser: targetUser,
              fileId: message.payload.fileId,
            });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CHUNK: {
            const { fileId, chunkSize } = message.payload;
            this.logger.info(
              'handleDataChannelMessage',
              `Received chunk metadata from ${targetUser} (fileId=${fileId}, chunkSize=${chunkSize})`
            );

            this.pendingChunks.set(targetUser, { fileId, chunkSize });
            break;
          }
          default:
            this.logger.warn('handleDataChannelMessage', `Unknown message type: ${message.type}`);
        }
      } else if (data instanceof ArrayBuffer) {
        const chunkMeta = this.pendingChunks.get(targetUser);

        if (chunkMeta) {
          const { fileId, chunkSize } = chunkMeta;

          if (data.byteLength !== chunkSize) {
            this.logger.warn(
              'handleDataChannelMessage',
              `Got chunk of size ${data.byteLength}, expected ${chunkSize} (fileId=${fileId})`
            );
          }

          this.incomingFileChunk$.next({
            fromUser: targetUser,
            fileId: fileId,
            chunk: data,
          });

          this.pendingChunks.delete(targetUser);
        } else {
          this.logger.warn(
            'handleDataChannelMessage',
            `Raw ArrayBuffer from ${targetUser} but no fileId in pendingChunks.`
          );
        }
      } else {
        this.logger.warn(
          'handleDataChannelMessage',
          `Unknown data type from ${targetUser}: ${typeof data}`
        );
      }
    });
  }

  public sendData(message: DataChannelMessage, targetUser: string): void {
    const channel = this.dataChannels.get(targetUser);

    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    } else if (channel && channel.readyState === 'connecting') {
      this.logger.warn(
        'sendData',
        `Data channel with ${targetUser} is connecting. Message will be queued.`
      );

      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(message);
    } else {
      this.logger.error('sendData', `Data channel with ${targetUser} is not open`);

      if (channel) {
        this.dataChannels.delete(targetUser);
      }
      const peerConnection = this.peerConnections.get(targetUser);
      if (peerConnection) {
        peerConnection.close();
        this.peerConnections.delete(targetUser);
      }

      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(message);
      this.initiateConnection(targetUser);
    }
  }

  private isDataChannelReadyToSend(targetUser: string): boolean {
    const channel = this.dataChannels.get(targetUser);

    if (!channel) {
      this.logger.warn('isDataChannelReadyToSend', `No data channel exists for ${targetUser}`);
      return false;
    }

    if (channel.readyState !== 'open') {
      this.logger.warn(
        'isDataChannelReadyToSend',
        `Data channel with ${targetUser} is in state: ${channel.readyState}`
      );
      return false;
    }

    if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      this.logger.warn(
        'isDataChannelReadyToSend',
        `Data channel buffer for ${targetUser} is full: ${channel.bufferedAmount} bytes`
      );
      return false;
    }

    return true;
  }

  public sendRawData(data: ArrayBuffer, targetUser: string): boolean {
    if (!this.isDataChannelReadyToSend(targetUser)) {
      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(data);

      if (
        !this.dataChannels.has(targetUser) ||
        this.dataChannels.get(targetUser)?.readyState !== 'connecting'
      ) {
        this.initiateConnection(targetUser);
      }
      return false;
    }

    try {
      const channel = this.dataChannels.get(targetUser)!;
      channel.send(data);
      return true;
    } catch (error) {
      this.logger.error('sendRawData', `Error sending raw data: ${error}`);

      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(data);

      setTimeout(() => {
        if (!this.isConnected(targetUser)) {
          this.initiateConnection(targetUser);
        }
      }, 1000);

      return false;
    }
  }

  public getDataChannel(targetUser: string): RTCDataChannel | null {
    return this.dataChannels.get(targetUser) || null;
  }

  public isConnected(targetUser: string): boolean {
    const channel = this.dataChannels.get(targetUser);
    return channel?.readyState === 'open';
  }

  private handleSignalMessage(message: SignalMessage): void {
    if (message.to !== this.userService.user || message.from === message.to) {
      this.logger.warn(
        'handleSignalMessage',
        'Skipping self-to-self signal: ' + JSON.stringify(message)
      );
      return;
    }

    switch (message.type) {
      case SIGNAL_MESSAGE_TYPES.OFFER:
        this.handleOffer(message);
        break;
      case SIGNAL_MESSAGE_TYPES.ANSWER:
        this.handleAnswer(message);
        break;
      case SIGNAL_MESSAGE_TYPES.CANDIDATE:
        this.handleCandidate(message);
        break;
      default:
        this.logger.error('handleSignalMessage', `Unknown signal message type: ${message.type}`);
    }
  }

  private handleOffer(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.createPeerConnection(targetUser);

    peerConnection
      .setRemoteDescription(new RTCSessionDescription(message.data))
      .then(() => {
        return peerConnection.createAnswer();
      })
      .then((answer) => {
        return peerConnection.setLocalDescription(answer);
      })
      .then(() => {
        const response: SignalMessage = {
          type: SignalMessageType.ANSWER,
          data: peerConnection.localDescription,
          from: this.userService.user,
          to: targetUser,
        };
        this.wsService.sendSignalMessage(response);
        this.processCandidateQueue(targetUser);
      })
      .catch((error) => {
        this.logger.error('handleOffer', `Error handling offer: ${error}`);
      });
  }

  private handleAnswer(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.peerConnections.get(targetUser);

    if (!peerConnection) {
      this.logger.error('handleAnswer', `PeerConnection missing for ${targetUser}`);
      return this.reconnect(targetUser);
    }

    if (peerConnection.signalingState !== RTC_SIGNALING_STATES.HAVE_LOCAL_OFFER) {
      this.logger.warn(
        'handleAnswer',
        `Invalid state for answer: ${peerConnection.signalingState}`
      );
      return this.handleStateMismatch(targetUser);
    } else {
      this.logger.debug('handleAnswer', `Valid state for answer: ${peerConnection.signalingState}`);
    }

    if (this.isDuplicateMessage(targetUser, message.sequence)) {
      this.logger.warn('handleAnswer', `Duplicate answer from ${targetUser}`);
      return;
    }

    const newDescription = new RTCSessionDescription(message.data);
    peerConnection
      .setRemoteDescription(newDescription)
      .then(() => {
        this.logger.debug('handleAnswer', `Remote answer set for ${targetUser}`);
        this.processCandidateQueue(targetUser);

        if (peerConnection.signalingState !== RTC_SIGNALING_STATES.STABLE) {
          throw new Error(`Unexpected post-answer state: ${peerConnection.signalingState}`);
        } else {
          this.logger.debug('handleAnswer', `Connection established with ${targetUser}`);
        }
      })
      .catch((error) => {
        this.logger.error('handleAnswer', `Answer handling failed: ${error}`);
        if (error.toString().includes('InvalidStateError')) {
          this.reconnect(targetUser);
        } else {
          this.logger.error('handleAnswer', `Answer handling failed: ${error}`);
        }
      });
  }

  private handleStateMismatch(targetUser: string): void {
    this.logger.warn(
      'handleStateMismatch',
      `Resetting connection due to state mismatch with ${targetUser}`
    );
    this.closePeerConnection(targetUser);
    setTimeout(() => this.initiateConnection(targetUser), 500);
  }

  private isDuplicateMessage(targetUser: string, sequence?: number): boolean {
    if (!sequence) return false;
    const lastSeq = this.lastSequences.get(targetUser) || 0;
    if (sequence <= lastSeq) return true;
    this.lastSequences.set(targetUser, sequence);
    return false;
  }

  private getNextSequence(targetUser: string): number {
    const current = this.lastSequences.get(targetUser) || 0;
    const next = current + 1;
    this.lastSequences.set(targetUser, next);
    return next;
  }

  private sendSignalMessage(message: Omit<SignalMessage, 'from'>): void {
    this.wsService.sendSignalMessage({
      ...message,
      from: this.userService.user,
      sequence: this.getNextSequence(message.to),
    });
  }

  private handleCandidate(message: SignalMessage): void {
    const targetUser = message.from;
    const candidate = new RTCIceCandidate(message.data);
    const peerConnection = this.peerConnections.get(targetUser);

    if (peerConnection?.remoteDescription?.type) {
      peerConnection.addIceCandidate(candidate).catch((error) => {
        this.logger.error('handleCandidate', `Error adding received ICE candidate: ${error}`);
      });
    } else {
      const queue = this.candidateQueues.get(targetUser);
      if (queue) {
        queue.push(message.data);
      } else {
        this.logger.warn('handleCandidate', `No candidate queue for ${targetUser}`);
        this.candidateQueues.set(targetUser, [message.data]);
      }
    }
  }

  private processCandidateQueue(targetUser: string): void {
    const queue = this.candidateQueues.get(targetUser);
    const peerConnection = this.peerConnections.get(targetUser);

    if (queue && peerConnection) {
      queue.forEach((candidateInit) => {
        const candidate = new RTCIceCandidate(candidateInit);
        peerConnection.addIceCandidate(candidate).catch((error) => {
          this.logger.error('processCandidateQueue', `Error adding queued ICE candidate ${error}`);
        });
      });
      queue.length = 0;
    } else {
      this.logger.warn('processCandidateQueue', `No candidate queue for ${targetUser}`);
    }
  }

  private closePeerConnection(targetUser: string) {
    const peerConnection = this.peerConnections.get(targetUser);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(targetUser);
    }
    this.dataChannels.delete(targetUser);
    this.candidateQueues.delete(targetUser);
    this.messageQueues.delete(targetUser);
  }

  public closeAllConnections(): void {
    this.dataChannels.forEach((channel) => {
      channel.close();
    });
    this.peerConnections.forEach((peerConnection) => {
      peerConnection.close();
    });
    this.dataChannels.clear();
    this.peerConnections.clear();
    this.candidateQueues.clear();
    this.messageQueues.clear();
    this.reconnectAttempts.clear();
  }
}

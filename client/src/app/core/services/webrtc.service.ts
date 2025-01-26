import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebSocketConnectionService } from './websocket-connection.service';
import { UserService } from './user.service';
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
} from '../../utils/constants';
import { MatSnackBar } from '@angular/material/snack-bar';

interface SignalMessage {
  type: SignalMessageType;
  data: any;
  from: string;
  to: string;
}

enum SignalMessageType {
  OFFER = 'offer',
  ANSWER = 'answer',
  CANDIDATE = 'candidate',
}

interface DataChannelMessage {
  type: string;
  payload: any;
}

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
  }>();
  public fileResponses$ = new Subject<{ accepted: boolean; fromUser: string }>();
  public incomingData$ = new Subject<{ data: ArrayBuffer; fromUser: string }>();
  public fileUploadCancelled$ = new Subject<{ fromUser: string }>();
  public fileDownloadCancelled$ = new Subject<{ fromUser: string }>();
  public bufferedAmountLow$ = new Subject<string>();

  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private candidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private messageQueues = new Map<string, (DataChannelMessage | ArrayBuffer)[]>();

  private reconnectAttempts = new Map<string, number>();

  constructor(
    private logger: LoggerService,
    private wsService: WebSocketConnectionService,
    private userService: UserService,
    private zone: NgZone,
    private snackBar: MatSnackBar
  ) {
    this.wsService.signalMessages$.subscribe((message) => {
      if (message) {
        this.handleSignalMessage(message);
      }
    });
  }

  public initiateConnection(targetUser: string): void {
    if (this.peerConnections.has(targetUser)) {
      this.logger.warn(`PeerConnection with ${targetUser} already exists.`);
      return;
    }

    this.logger.info(`Initiating connection with ${targetUser}`);

    const peerConnection = this.createPeerConnection(targetUser);
    const dataChannel = peerConnection.createDataChannel('data', DATA_CHANNEL_OPTIONS);
    this.setupDataChannel(dataChannel, targetUser);
    this.dataChannels.set(targetUser, dataChannel);

    peerConnection
      .createOffer(OFFER_OPTIONS)
      .then((offer) => peerConnection.setLocalDescription(offer))
      .then(() => {
        const message: SignalMessage = {
          type: SignalMessageType.OFFER,
          data: peerConnection.localDescription,
          from: this.userService.user,
          to: targetUser,
        };
        this.wsService.sendSignalMessage(message);
      })
      .catch((error) => {
        this.logger.error(`Error during offer creation: ${error}`);
      });
  }

  private reconnect(targetUser: string) {
    this.logger.info(`Reconnecting WebRTC with ${targetUser}...`);

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
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (
        peerConnection.iceConnectionState === 'disconnected' ||
        peerConnection.iceConnectionState === 'failed'
      ) {
        this.handleDisconnection(targetUser);
      }
    };

    this.peerConnections.set(targetUser, peerConnection);
    this.candidateQueues.set(targetUser, []);

    return peerConnection;
  }

  private setupDataChannel(channel: RTCDataChannel, targetUser: string): void {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this.logger.info(`Data channel with ${targetUser} is open`);
      this.dataChannelOpen$.next(true);

      const queuedMessages = this.messageQueues.get(targetUser);
      if (queuedMessages && queuedMessages.length > 0) {
        queuedMessages.forEach((msg) => {
          if (typeof msg === 'object' && !(msg instanceof ArrayBuffer)) {
            channel.send(JSON.stringify(msg));
          } else if (msg instanceof ArrayBuffer) {
            channel.send(msg);
          }
        });
        this.messageQueues.set(targetUser, []);
      }
    };

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, targetUser);
    };

    channel.onerror = (error) => {
      this.logger.error(`Data Channel Error with ${targetUser}: ${error}`);
    };

    channel.onclose = () => {
      this.logger.info(`Data channel with ${targetUser} is closed`);
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
        `Max reconnection attempts reached for ${targetUser}. Could not reconnect.`
      );
      this.snackBar.open('Could not reconnect to the user. Please try again later.', 'Close', {
        duration: 5000,
      });
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
            this.logger.info(`Received file offer from ${targetUser}`);
            this.fileOffers$.next({
              fileName: message.payload.fileName,
              fileSize: message.payload.fileSize,
              fromUser: targetUser,
            });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT:
            this.logger.info(`Received file acceptance from ${targetUser}`);
            this.fileResponses$.next({ accepted: true, fromUser: targetUser });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_DECLINE:
            this.logger.info(`Received file decline from ${targetUser}`);
            this.fileResponses$.next({ accepted: false, fromUser: targetUser });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_UPLOAD:
            this.logger.info(`Received uploading file cancellation from ${targetUser}`);
            this.fileUploadCancelled$.next({ fromUser: targetUser });
            break;
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_DOWNLOAD:
            this.logger.info(`Received downloading file cancellation from ${targetUser}`);
            this.fileDownloadCancelled$.next({ fromUser: targetUser });
            break;
          default:
            this.logger.warn(`Unknown message type: ${message.type}`);
        }
      } else if (data instanceof ArrayBuffer) {
        this.zone.run(() => {
          this.incomingData$.next({ data, fromUser: targetUser });
        });
      } else {
        this.logger.warn(`Unknown data type received from ${targetUser}: ${data}`);
      }
    });
  }

  public sendData(message: DataChannelMessage, targetUser: string): void {
    const channel = this.dataChannels.get(targetUser);

    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    } else if (channel && channel.readyState === 'connecting') {
      this.logger.warn(`Data channel with ${targetUser} is connecting. Message will be queued.`);

      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(message);
    } else {
      this.logger.error(`Data channel with ${targetUser} is not open`);

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

  public sendRawData(data: ArrayBuffer, targetUser: string): void {
    const channel = this.dataChannels.get(targetUser);

    if (channel && channel.readyState === 'open') {
      channel.send(data);
    } else if (channel && channel.readyState === 'connecting') {
      this.logger.warn(`Data channel with ${targetUser} is connecting. Data will be queued.`);
      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(data);
    } else {
      this.logger.error(`Data channel with ${targetUser} is not open`);

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
      this.messageQueues.get(targetUser)!.push(data);
      this.initiateConnection(targetUser);
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
    if (message.to !== this.userService.user) {
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
        this.logger.error(`Unknown signal message type: ${message.type}`);
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
        this.logger.error(`Error handling offer: ${error}`);
      });
  }

  private handleAnswer(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.peerConnections.get(targetUser);

    if (!peerConnection) {
      this.logger.error(`PeerConnection does not exist for user: ${targetUser}`);
      return;
    }

    peerConnection
      .setRemoteDescription(new RTCSessionDescription(message.data))
      .then(() => {
        this.processCandidateQueue(targetUser);
      })
      .catch((error) => {
        this.logger.error(`Error setting remote description: ${error}`);
      });
  }

  private handleCandidate(message: SignalMessage): void {
    const targetUser = message.from;
    const candidate = new RTCIceCandidate(message.data);
    const peerConnection = this.peerConnections.get(targetUser);

    if (peerConnection?.remoteDescription?.type) {
      peerConnection.addIceCandidate(candidate).catch((error) => {
        this.logger.error(`Error adding received ICE candidate: ${error}`);
      });
    } else {
      const queue = this.candidateQueues.get(targetUser);
      if (queue) {
        queue.push(message.data);
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
          this.logger.error(`Error adding queued ICE candidate ${error}`);
        });
      });
      queue.length = 0;
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

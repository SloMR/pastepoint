import { Injectable } from '@angular/core';
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
} from '../../utils/constants';

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

  public chatMessages$ = new Subject<string>();
  public fileOffers$ = new Subject<{
    fileName: string;
    fileSize: number;
    fromUser: string;
  }>();
  public fileResponses$ = new Subject<{ accepted: boolean; fromUser: string }>();
  public incomingData$ = new Subject<ArrayBuffer>();
  public bufferedAmountLow$ = new Subject<void>();

  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private candidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private messageQueues = new Map<string, (DataChannelMessage | ArrayBuffer)[]>();

  constructor(
    private logger: LoggerService,
    private wsService: WebSocketConnectionService,
    private userService: UserService
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
      this.logger.log(
        `Connection state with ${targetUser} changed: ${peerConnection.connectionState}`
      );
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
      this.bufferedAmountLow$.next();
    };
  }

  private handleDataChannelMessage(data: any, targetUser: string): void {
    if (typeof data === 'string') {
      const message: DataChannelMessage = JSON.parse(data);
      switch (message.type) {
        case DATA_CHANNEL_MESSAGE_TYPES.CHAT:
          this.chatMessages$.next(message.payload);
          break;
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
        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
      }
    } else if (data instanceof ArrayBuffer) {
      this.incomingData$.next(data);
    } else {
      this.logger.warn(`Unknown data type received: ${data}`);
    }
  }

  public sendData(message: DataChannelMessage, targetUser: string): void {
    const channel = this.dataChannels.get(targetUser);

    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    } else if (channel && channel.readyState === 'connecting') {
      this.logger.warn(
        `Data channel with ${targetUser} is connecting. Message will be queued.`
      );

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
      peerConnection
        .addIceCandidate(candidate)
        .catch((error) => {
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
        peerConnection
          .addIceCandidate(candidate)
          .catch((error) => {
            this.logger.error(`Error adding queued ICE candidate ${error}`);
          });
      });
      queue.length = 0;
    }
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
  }
}

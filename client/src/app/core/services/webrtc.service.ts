import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebSocketConnectionService } from './websocket-connection.service';
import { UserService } from './user.service';

interface SignalMessage {
  type: 'offer' | 'answer' | 'candidate';
  data: any;
  from: string;
  to: string;
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
  public fileOffers$ = new Subject<{ fileName: string; fileSize: number; fromUser: string }>();
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
      this.logger.log(`PeerConnection with ${targetUser} already exists.`);
      return;
    }

    this.logger.log(`Initiating connection with ${targetUser}`);

    const peerConnection = this.createPeerConnection(targetUser);
    const dataChannel = peerConnection.createDataChannel('data');
    this.setupDataChannel(dataChannel, targetUser);
    this.dataChannels.set(targetUser, dataChannel);

    peerConnection
      .createOffer()
      .then((offer) => peerConnection.setLocalDescription(offer))
      .then(() => {
        const message: SignalMessage = {
          type: 'offer',
          data: peerConnection.localDescription,
          from: this.userService.user,
          to: targetUser,
        };
        this.wsService.sendSignalMessage(message);
      })
      .catch((error) => {
        console.error('Error during offer creation:', error);
      });
  }

  private createPeerConnection(targetUser: string): RTCPeerConnection {
    const configuration = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const message: SignalMessage = {
          type: 'candidate',
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
    channel.onopen = () => {
      this.logger.log(`Data channel with ${targetUser} is open`);
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
      console.error(`Data Channel Error with ${targetUser}:`, error);
    };

    channel.onclose = () => {
      this.logger.log(`Data channel with ${targetUser} is closed`);
      this.dataChannelOpen$.next(false);

      this.dataChannels.delete(targetUser);
      const peerConnection = this.peerConnections.get(targetUser);
      if (peerConnection) {
        peerConnection.close();
        this.peerConnections.delete(targetUser);
      }
    };

    channel.bufferedAmountLowThreshold = 128 * 1024; // 128 KB
    channel.onbufferedamountlow = () => {
      this.bufferedAmountLow$.next();
    };
  }

  private handleDataChannelMessage(data: any, targetUser: string): void {
    if (typeof data === 'string') {
      const message: DataChannelMessage = JSON.parse(data);
      switch (message.type) {
        case 'chat':
          this.chatMessages$.next(message.payload);
          break;
        case 'file-offer':
          this.logger.log(`Received file offer from ${targetUser}`);
          this.fileOffers$.next({
            fileName: message.payload.fileName,
            fileSize: message.payload.fileSize,
            fromUser: targetUser,
          });
          break;
        case 'file-accept':
          this.logger.log(`Received file acceptance from ${targetUser}`);
          this.fileResponses$.next({ accepted: true, fromUser: targetUser });
          break;
        case 'file-decline':
          this.logger.log(`Received file decline from ${targetUser}`);
          this.fileResponses$.next({ accepted: false, fromUser: targetUser });
          break;
        default:
          console.warn('Unknown message type:', message.type);
      }
    } else if (data instanceof ArrayBuffer) {
      this.incomingData$.next(data);
    }
  }

  public sendData(message: DataChannelMessage, targetUser: string): void {
    const channel = this.dataChannels.get(targetUser);

    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    } else if (channel && channel.readyState === 'connecting') {
      console.warn(`Data channel with ${targetUser} is connecting. Message will be queued.`);

      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(message);
    } else {
      console.error(`Data channel with ${targetUser} is not open`);

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
      console.warn(`Data channel with ${targetUser} is connecting. Data will be queued.`);
      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)!.push(data);
    } else {
      console.error(`Data channel with ${targetUser} is not open`);

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
      case 'offer':
        this.handleOffer(message);
        break;
      case 'answer':
        this.handleAnswer(message);
        break;
      case 'candidate':
        this.handleCandidate(message);
        break;
      default:
        console.error('Unknown signal message type:', message.type);
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
          type: 'answer',
          data: peerConnection.localDescription,
          from: this.userService.user,
          to: targetUser,
        };
        this.wsService.sendSignalMessage(response);
        this.processCandidateQueue(targetUser);
      })
      .catch((error) => {
        console.error('Error handling offer:', error);
      });
  }

  private handleAnswer(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.peerConnections.get(targetUser);

    if (!peerConnection) {
      console.error('PeerConnection does not exist for user:', targetUser);
      return;
    }

    peerConnection
      .setRemoteDescription(new RTCSessionDescription(message.data))
      .then(() => {
        this.processCandidateQueue(targetUser);
      })
      .catch((error) => {
        console.error('Error setting remote description:', error);
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
          console.error('Error adding received ICE candidate', error);
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
            console.error('Error adding queued ICE candidate', error);
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

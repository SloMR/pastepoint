import { Inject, Injectable } from '@angular/core';
import { WebSocketConnectionService } from './websocket-connection.service';
import { UserService } from '../user-management/user.service';
import {
  ICE_SERVERS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY,
  OFFER_OPTIONS,
  DATA_CHANNEL_OPTIONS,
  RTC_SIGNALING_STATES,
  SignalMessageType,
  SignalMessage,
} from '../../../utils/constants';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { WebRTCCommunicationService } from './webrtc-communication.service';
import { HotToastService } from '@ngneat/hot-toast';

@Injectable({
  providedIn: 'root',
})
export class WebRTCSignalingService {
  // =============== Properties ===============
  private peerConnections = new Map<string, RTCPeerConnection>();
  private reconnectAttempts = new Map<string, number>();
  private connectionLocks = new Set<string>();
  private lastSequences = new Map<string, number>();
  private candidateQueues = new Map<string, RTCIceCandidateInit[]>();

  constructor(
    private wsService: WebSocketConnectionService,
    private userService: UserService,
    private toaster: HotToastService,
    @Inject(TranslateService) private translate: TranslateService,
    private logger: NGXLogger,
    private communicationService: WebRTCCommunicationService
  ) {
    this.initializeSignalMessageHandler();
  }

  // =============== Public Methods ===============

  /**
   * Initiates a new WebRTC connection with the target user
   * @param targetUser The user to connect with
   */
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
      this.communicationService.setupDataChannel(dataChannel, targetUser);

      peerConnection
        .createOffer(OFFER_OPTIONS)
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
          this.sendSignalMessage({
            type: SignalMessageType.OFFER,
            data: peerConnection.localDescription,
            to: targetUser,
            sequence: this.getNextSequence(targetUser),
          });
        })
        .catch((error: unknown) => {
          this.logger.error('initiateConnection', `Offer creation failed: ${error}`);
          this.toaster.error(this.translate.instant('CONNECTION_LOST'));
          this.reconnect(targetUser);
        })
        .finally(() => this.connectionLocks.delete(targetUser));
    } catch (error) {
      this.logger.error('initiateConnection', `Connection initiation failed: ${error}`);
      this.toaster.error(this.translate.instant('CONNECTION_LOST'));
      this.connectionLocks.delete(targetUser);
    }
  }

  /**
   * Handles data channel close event
   * @param targetUser The user whose data channel was closed
   */
  public handleDataChannelClose(targetUser: string): void {
    this.closePeerConnection(targetUser, true);
  }

  /**
   * Handles data channel error event
   * @param targetUser The user whose data channel encountered an error
   */
  public handleDataChannelError(targetUser: string): void {
    this.closePeerConnection(targetUser, true);
  }

  /**
   * Handles data channel not open event
   * @param targetUser The user whose data channel is not open
   */
  public handleDataChannelNotOpen(targetUser: string): void {
    this.closePeerConnection(targetUser, true);
  }

  /**
   * Handles data channel reconnection event
   * @param targetUser The user to reconnect with
   */
  public handleDataChannelReconnect(targetUser: string): void {
    if (!this.peerConnections.has(targetUser)) {
      this.initiateConnection(targetUser);
    }
  }

  /**
   * Closes a peer connection with the target user
   * @param targetUser The user to disconnect from
   * @param force Whether to force close the connection
   */
  public closePeerConnection(targetUser: string, force = false) {
    const peerConnection = this.peerConnections.get(targetUser);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(targetUser);
    }
    if (force) {
      this.candidateQueues.delete(targetUser);
      this.communicationService.deleteDataChannel(targetUser);
      this.communicationService.deleteMessageQueue(targetUser);
    }
  }

  /**
   * Closes all peer connections
   */
  public closeAllConnections(): void {
    this.peerConnections.forEach((peerConnection) => {
      peerConnection.close();
    });
    this.peerConnections.clear();
    this.reconnectAttempts.clear();
    this.candidateQueues.clear();
  }

  /**
   * Gets the peer connection for a target user
   * @param targetUser The user to get the connection for
   */
  public getPeerConnection(targetUser: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(targetUser);
  }

  /**
   * Deletes a peer connection for a target user
   * @param targetUser The user to delete the connection for
   */
  public deletePeerConnection(targetUser: string): void {
    this.peerConnections.delete(targetUser);
  }

  // =============== Private Methods ===============

  /**
   * Initializes the signal message handler
   */
  private initializeSignalMessageHandler(): void {
    this.wsService.signalMessages$.subscribe((message: unknown) => {
      if (message) {
        this.logger.debug(
          'WebRTCConnectionService',
          `Received signal message: ${JSON.stringify(message)}`
        );
        this.handleSignalMessage(message as SignalMessage);
      }
    });
  }

  /**
   * Creates a new peer connection for the target user
   * @param targetUser The user to create the connection for
   */
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
      this.communicationService.setupDataChannel(dataChannel, targetUser);
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

  /**
   * Handles disconnection events and attempts reconnection
   * @param targetUser The user to handle disconnection for
   */
  private handleDisconnection(targetUser: string) {
    const attempts = this.reconnectAttempts.get(targetUser) ?? 0;
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
      this.toaster.warning(this.translate.instant('CONNECTION_LOST_DESC'));
      this.closePeerConnection(targetUser, true);
    }
  }

  /**
   * Handles incoming signal messages
   * @param message The signal message to handle
   */
  private handleSignalMessage(message: SignalMessage): void {
    if (message.to !== this.userService.user || message.from === message.to) {
      this.logger.warn(
        'handleSignalMessage',
        'Skipping self-to-self signal: ' + JSON.stringify(message)
      );
      return;
    }

    switch (message.type) {
      case SignalMessageType.OFFER:
        this.handleOffer(message);
        break;
      case SignalMessageType.ANSWER:
        this.handleAnswer(message);
        break;
      case SignalMessageType.CANDIDATE:
        this.handleCandidate(message);
        break;
      default:
        this.logger.error('handleSignalMessage', `Unknown signal message type: ${message.type}`);
    }
  }

  /**
   * Handles incoming offer messages
   * @param message The offer message to handle
   */
  private handleOffer(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.createPeerConnection(targetUser);

    peerConnection
      .setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit))
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

  /**
   * Handles incoming answer messages
   * @param message The answer message to handle
   */
  private handleAnswer(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.peerConnections.get(targetUser);

    if (!peerConnection) {
      this.logger.error('handleAnswer', `PeerConnection missing for ${targetUser}`);
      this.reconnect(targetUser);
      return;
    }

    if (peerConnection.signalingState !== RTC_SIGNALING_STATES.HAVE_LOCAL_OFFER) {
      this.logger.warn(
        'handleAnswer',
        `Invalid state for answer: ${peerConnection.signalingState}`
      );
      this.handleStateMismatch(targetUser);
      return;
    } else {
      this.logger.debug('handleAnswer', `Valid state for answer: ${peerConnection.signalingState}`);
    }

    if (this.isDuplicateMessage(targetUser, message.sequence)) {
      this.logger.warn('handleAnswer', `Duplicate answer from ${targetUser}`);
      return;
    }

    const newDescription = new RTCSessionDescription(message.data as RTCSessionDescriptionInit);
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
        this.logger.error('handleAnswer', `Error handling answer: ${error}`);
        this.handleStateMismatch(targetUser);
      });
  }

  /**
   * Handles state mismatch events
   * @param targetUser The user to handle state mismatch for
   */
  private handleStateMismatch(targetUser: string): void {
    this.logger.warn(
      'handleStateMismatch',
      `Resetting connection due to state mismatch with ${targetUser}`
    );
    this.closePeerConnection(targetUser, true);
    setTimeout(() => {
      this.initiateConnection(targetUser);
    }, 500);
  }

  /**
   * Handles incoming ICE candidate messages
   * @param message The candidate message to handle
   */
  private handleCandidate(message: SignalMessage): void {
    const targetUser = message.from;
    const peerConnection = this.peerConnections.get(targetUser);

    if (!peerConnection) {
      this.logger.warn(
        'handleCandidate',
        `No peer connection for ${targetUser}, ignoring candidate`
      );
      return;
    }

    const candidate = new RTCIceCandidate(message.data as RTCIceCandidateInit);

    if (peerConnection.remoteDescription) {
      peerConnection.addIceCandidate(candidate).catch((error) => {
        this.logger.error('handleCandidate', `Error adding ICE candidate: ${error}`);
      });
    } else {
      let queue = this.candidateQueues.get(targetUser);
      if (queue) {
        queue.push(message.data as RTCIceCandidateInit);
      } else {
        this.candidateQueues.set(targetUser, [message.data as RTCIceCandidateInit]);
      }
    }
  }

  /**
   * Processes queued ICE candidates
   * @param targetUser The user whose candidate queue to process
   */
  private processCandidateQueue(targetUser: string): void {
    const queue = this.candidateQueues.get(targetUser);
    const peerConnection = this.peerConnections.get(targetUser);

    if (queue && peerConnection) {
      queue.forEach((candidateInit: RTCIceCandidateInit) => {
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

  /**
   * Attempts to reconnect to a target user
   * @param targetUser The user to reconnect to
   */
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

  /**
   * Sends a signal message to the target user
   * @param message The message to send
   */
  private sendSignalMessage(message: Omit<SignalMessage, 'from'>): void {
    this.wsService.sendSignalMessage({
      ...message,
      from: this.userService.user,
      sequence: this.getNextSequence(message.to),
    });
  }

  // =============== Helper Methods ===============

  /**
   * Checks if a message is a duplicate
   * @param targetUser The user the message is from
   * @param sequence The message sequence number
   */
  private isDuplicateMessage(targetUser: string, sequence?: number): boolean {
    if (!sequence) return false;
    const lastSeq = this.lastSequences.get(targetUser) ?? 0;
    if (sequence <= lastSeq) return true;
    this.lastSequences.set(targetUser, sequence);
    return false;
  }

  /**
   * Gets the next sequence number for a target user
   * @param targetUser The user to get the sequence for
   */
  private getNextSequence(targetUser: string): number {
    const current = this.lastSequences.get(targetUser) ?? 0;
    const next = current + 1;
    this.lastSequences.set(targetUser, next);
    return next;
  }
}

import { Inject, Injectable } from '@angular/core';
import { WebSocketConnectionService } from './websocket-connection.service';
import { UserService } from '../user-management/user.service';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY,
  OFFER_OPTIONS,
  DATA_CHANNEL_OPTIONS,
  RTC_SIGNALING_STATES,
  SignalMessageType,
  SignalMessage,
  RTC_CONFIGURATION,
  ICE_GATHERING_TIMEOUT,
  CONNECTION_REQUEST_TIMEOUT,
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
  private connectionRequests = new Map<string, ReturnType<typeof setTimeout>>();

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
    if (targetUser === this.userService.user) {
      this.logger.warn(
        'initiateConnection',
        `Preventing self-connection attempt to: "${targetUser}"`
      );
      return;
    }

    if (this.connectionLocks.has(targetUser)) {
      this.logger.debug('initiateConnection', `Connection already in progress for ${targetUser}`);
      return;
    }

    const existingPeerConnection = this.peerConnections.get(targetUser);
    if (existingPeerConnection) {
      const connectionState = existingPeerConnection.connectionState;
      const iceState = existingPeerConnection.iceConnectionState;

      if (connectionState === 'connected' || connectionState === 'connecting') {
        this.logger.debug(
          'initiateConnection',
          `PeerConnection with ${targetUser} is ${connectionState}`
        );
        return;
      }

      if (
        connectionState === 'failed' ||
        connectionState === 'disconnected' ||
        iceState === 'failed' ||
        iceState === 'disconnected'
      ) {
        this.logger.debug('initiateConnection', `Cleaning up failed connection with ${targetUser}`);
        this.closePeerConnection(targetUser, true);
      } else {
        this.logger.warn(
          'initiateConnection',
          `PeerConnection with ${targetUser} exists in state ${connectionState}/${iceState}`
        );
        return;
      }
    }

    if (!this.shouldInitiateConnection(targetUser)) {
      this.logger.debug(
        'initiateConnection',
        `Requesting ${targetUser} to initiate connection (role: callee)`
      );
      this.sendConnectionRequest(targetUser);
      return;
    }

    // Clear any existing connection request timeout since we're initiating
    const requestTimeout = this.connectionRequests.get(targetUser);
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      this.connectionRequests.delete(targetUser);
      this.logger.debug(
        'initiateConnection',
        `Cleared connection request timeout for ${targetUser}`
      );
    }

    this.connectionLocks.add(targetUser);

    this.logger.info(
      'initiateConnection',
      `Initiating connection with ${targetUser} (role: caller)`
    );
    const peerConnection = this.createPeerConnection(targetUser);

    try {
      if (!peerConnection) {
        this.logger.error(
          'initiateConnection',
          `Failed to create peer connection for ${targetUser}`
        );
        throw new Error(`Failed to create peer connection for ${targetUser}`);
      }

      const dataChannel = peerConnection.createDataChannel('data', DATA_CHANNEL_OPTIONS);
      this.communicationService.setupDataChannel(dataChannel, targetUser);

      dataChannel.onopen = () => {
        this.connectionLocks.delete(targetUser);
      };
      dataChannel.onerror = () => {
        this.connectionLocks.delete(targetUser);
      };
      dataChannel.onclose = () => {
        this.connectionLocks.delete(targetUser);
      };

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
          this.connectionLocks.delete(targetUser);
          this.reconnect(targetUser);
        });
    } catch (error: unknown) {
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

    // Clear connection request timeout
    const requestTimeout = this.connectionRequests.get(targetUser);
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      this.connectionRequests.delete(targetUser);
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

    // Clear all connection request timeouts
    this.connectionRequests.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.connectionRequests.clear();
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
  private createPeerConnection(targetUser: string): RTCPeerConnection | undefined {
    if (this.userService.user === targetUser) {
      this.logger.warn('createPeerConnection', `Skipping connection creation with self`);
      return;
    }

    const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);

    let iceGatheringTimeout: ReturnType<typeof setTimeout> | null = null;
    let iceGatheringComplete = false;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }

        const message: SignalMessage = {
          type: SignalMessageType.CANDIDATE,
          data: event.candidate,
          from: this.userService.user,
          to: targetUser,
        };
        this.wsService.sendSignalMessage(message);
      } else {
        iceGatheringComplete = true;
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }
        this.logger.info('createPeerConnection', `ICE gathering complete for ${targetUser}`);
      }
    };

    iceGatheringTimeout = setTimeout(() => {
      if (!iceGatheringComplete) {
        this.logger.warn('createPeerConnection', `ICE gathering timeout for ${targetUser}`);
      }
    }, ICE_GATHERING_TIMEOUT);

    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      this.communicationService.setupDataChannel(dataChannel, targetUser);
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;

      if (state === 'connected') {
        // Clear ICE gathering timeout when connection is established
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }
        this.logger.info('createPeerConnection', `Successfully connected to ${targetUser}`);
      } else if (state === 'failed' || state === 'disconnected') {
        // Clear timeout on failure
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }
        this.handleDisconnection(targetUser);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const iceState = peerConnection.iceConnectionState;

      if (iceState === 'connected' || iceState === 'completed') {
        // Clear ICE gathering timeout when ICE connection is established
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }
      } else if (iceState === 'disconnected' || iceState === 'failed') {
        // Clear timeout on failure
        if (iceGatheringTimeout) {
          clearTimeout(iceGatheringTimeout);
          iceGatheringTimeout = null;
        }
        this.handleDisconnection(targetUser);
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

      // Use exponential backoff (starts at 2s, max 10s)
      const baseDelay = RECONNECT_DELAY;
      const maxDelay = 10000;
      const delay = Math.min(baseDelay * Math.pow(1.5, attempts), maxDelay);

      this.logger.warn(
        'handleDisconnection',
        `Attempt ${attempts + 1}: Reconnecting to ${targetUser} in ${delay / 1000} seconds...`
      );

      if (attempts === 0) {
        this.logger.info('handleDisconnection', `Starting reconnection attempts to ${targetUser}`);
      }

      setTimeout(() => {
        if (!this.peerConnections.has(targetUser)) {
          this.logger.debug(
            'handleDisconnection',
            `Attempting reconnection ${attempts + 1} to ${targetUser}`
          );
          this.reconnect(targetUser);
        } else {
          this.logger.debug(
            'handleDisconnection',
            `Connection already exists for ${targetUser}, skipping reconnect`
          );
        }
      }, delay);
    } else {
      this.logger.error(
        'handleDisconnection',
        `Max reconnection attempts reached for ${targetUser}. Could not reconnect.`
      );
      if (this.wsService.isConnected()) {
        this.toaster.error(
          this.translate.instant('CANNOT_CONNECT_TO_USER', { userName: targetUser })
        );
      }
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
      case SignalMessageType.CONNECTION_REQUEST:
        this.handleConnectionRequest(message);
        break;
      default:
        this.logger.error('handleSignalMessage', `Unknown signal message type: ${message.type}`);
    }
  }

  /**
   * Handles incoming connection request messages
   * @param message The connection request message to handle
   */
  private handleConnectionRequest(message: SignalMessage): void {
    const targetUser = message.from;
    this.logger.info('handleConnectionRequest', `Received connection request from ${targetUser}`);
    if (this.isDuplicateMessage(targetUser, message.sequence)) {
      this.logger.warn(
        'handleConnectionRequest',
        `Duplicate connection request from ${targetUser}`
      );
      return;
    }

    if (this.shouldInitiateConnection(targetUser)) {
      this.logger.debug(
        'handleConnectionRequest',
        `Initiating connection as requested by ${targetUser}`
      );
      this.initiateConnection(targetUser);
    } else {
      this.logger.debug(
        'handleConnectionRequest',
        `Not caller for ${targetUser}; ignoring request`
      );
    }
  }

  /**
   * Handles incoming offer messages with collision detection
   * @param message The offer message to handle
   */
  private handleOffer(message: SignalMessage): void {
    const targetUser = message.from;

    if (this.userService.user === targetUser) {
      this.logger.warn('handleOffer', `Skipping offer from self`);
      return;
    }

    const requestTimeout = this.connectionRequests.get(targetUser);
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      this.connectionRequests.delete(targetUser);
      this.logger.debug('handleOffer', `Cleared connection request timeout for ${targetUser}`);
    }

    // Check if we're already trying to initiate a connection (collision detection)
    if (this.connectionLocks.has(targetUser)) {
      this.logger.warn('handleOffer', `Collision detected with ${targetUser}, resolving by role`);

      // If we should be the caller, ignore this offer and let our offer proceed
      if (this.shouldInitiateConnection(targetUser)) {
        this.logger.debug(
          'handleOffer',
          `Ignoring offer from ${targetUser} (we are the designated caller)`
        );
        return;
      } else {
        // If we should be the callee, cancel our initiation and handle this offer
        this.logger.debug(
          'handleOffer',
          `Canceling our initiation for ${targetUser} (we are the designated callee)`
        );
        this.closePeerConnection(targetUser, false);
        this.connectionLocks.delete(targetUser);
      }
    }

    const peerConnection = this.createPeerConnection(targetUser);

    if (!peerConnection) {
      this.logger.error('handleOffer', `PeerConnection missing for ${targetUser}`);
      return;
    }

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
        if (this.wsService.isConnected()) {
          this.toaster.warning(
            this.translate.instant('CONNECTION_FAILED_WITH_USER', { userName: targetUser })
          );
        }
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
        if (this.wsService.isConnected()) {
          this.toaster.warning(
            this.translate.instant('CONNECTION_FAILED_WITH_USER', { userName: targetUser })
          );
        }
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
      peerConnection
        .addIceCandidate(candidate)
        .then(() => {
          this.logger.debug(
            'handleCandidate',
            `Successfully added ICE candidate from ${targetUser}`
          );
        })
        .catch((error) => {
          this.logger.error('handleCandidate', `Error adding ICE candidate: ${error}`);
          const attempts = this.reconnectAttempts.get(targetUser) ?? 0;
          if (attempts > 2) {
            this.logger.warn(
              'handleCandidate',
              `ICE candidate errors for ${targetUser}, attempts: ${attempts}`
            );
          }
        });
    } else {
      this.logger.debug(
        'handleCandidate',
        `Queueing ICE candidate from ${targetUser} (no remote description yet)`
      );
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
        peerConnection
          .addIceCandidate(candidate)
          .then(() => {
            this.logger.info(
              'processCandidateQueue',
              `Successfully added queued candidate from ${targetUser}`
            );
          })
          .catch((error) => {
            this.logger.error(
              'processCandidateQueue',
              `Error adding queued ICE candidate: ${error}`
            );
          });
      });
      queue.length = 0;
    } else {
      this.logger.debug(
        'processCandidateQueue',
        `No candidate queue or peer connection for ${targetUser}`
      );
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

  /**
   * Sends a connection request to the target user
   * @param targetUser The user to send the request to
   */
  private sendConnectionRequest(targetUser: string): void {
    const existingTimeout = this.connectionRequests.get(targetUser);
    if (existingTimeout) {
      this.logger.debug(
        'sendConnectionRequest',
        `Connection request already pending for ${targetUser}`
      );
      return;
    }

    const message: SignalMessage = {
      type: SignalMessageType.CONNECTION_REQUEST,
      data: null,
      from: this.userService.user,
      to: targetUser,
      sequence: this.getNextSequence(targetUser),
    };
    this.wsService.sendSignalMessage(message);
    this.logger.info('sendConnectionRequest', `Sent connection request to ${targetUser}`);

    const timeout = setTimeout(() => {
      this.logger.warn('sendConnectionRequest', `Connection request timeout for ${targetUser}`);
      this.connectionRequests.delete(targetUser);

      // Fallback: try to initiate connection ourselves if no response
      if (!this.peerConnections.has(targetUser)) {
        this.logger.debug(
          'sendConnectionRequest',
          `Fallback: initiating connection with ${targetUser} after timeout`
        );
        this.forceInitiateConnection(targetUser);
      }
    }, CONNECTION_REQUEST_TIMEOUT);

    this.connectionRequests.set(targetUser, timeout);
  }

  /**
   * Forces connection initiation (bypasses role checking)
   * @param targetUser The user to connect with
   */
  private forceInitiateConnection(targetUser: string): void {
    this.logger.info('forceInitiateConnection', `Forcing connection initiation with ${targetUser}`);

    if (this.userService.user === targetUser) {
      this.logger.warn('forceInitiateConnection', `Skipping connection initiation with self`);
      return;
    }

    const existingTimeout = this.connectionRequests.get(targetUser);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.connectionRequests.delete(targetUser);
    }

    // Temporarily bypass role checking and initiate connection
    this.connectionLocks.add(targetUser);
    const peerConnection = this.createPeerConnection(targetUser);

    if (!peerConnection) {
      this.logger.error('forceInitiateConnection', `PeerConnection missing for ${targetUser}`);
      return;
    }

    try {
      const dataChannel = peerConnection.createDataChannel('data', DATA_CHANNEL_OPTIONS);
      this.communicationService.setupDataChannel(dataChannel, targetUser);

      dataChannel.onopen = () => {
        this.connectionLocks.delete(targetUser);
      };
      dataChannel.onerror = () => {
        this.connectionLocks.delete(targetUser);
      };
      dataChannel.onclose = () => {
        this.connectionLocks.delete(targetUser);
      };

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
          this.logger.error('forceInitiateConnection', `Offer creation failed: ${error}`);
          this.connectionLocks.delete(targetUser);
        });
    } catch (error: unknown) {
      this.logger.error('forceInitiateConnection', `Connection initiation failed: ${error}`);
      this.connectionLocks.delete(targetUser);
    }
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

  /**
   * Determines if the current user should initiate the connection.
   * This prevents race conditions when both users try to initiate simultaneously.
   * @param targetUser The user to compare with.
   * @returns true if the current user should initiate, false if the target user should.
   */
  private shouldInitiateConnection(targetUser: string): boolean {
    const currentUserId = this.userService.user;
    const targetUserId = targetUser;

    // The user with the "smaller" ID (lexicographically) will always be the caller
    // ex: if currentUserId is "Austin Bob" and targetUserId is "Bob Austin",
    // currentUserId will be the caller because "Austin Bob" is lexicographically smaller than "Bob Austin".
    // This ensures consistent behavior across both clients
    return currentUserId.localeCompare(targetUserId) < 0;
  }
}

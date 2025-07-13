import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  DATA_CHANNEL_MESSAGE_TYPES,
  FILE_TRANSFER_MESSAGE_TYPES,
  MAX_BUFFERED_AMOUNT,
  ChatMessage,
  DataChannelMessage,
} from '../../../utils/constants';
import { NGXLogger } from 'ngx-logger';
import { HotToastService } from '@ngneat/hot-toast';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class WebRTCCommunicationService {
  // =============== Properties ===============

  // Public Subjects
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

  // Private Collections
  private dataChannels = new Map<string, RTCDataChannel>();
  private messageQueues = new Map<string, (DataChannelMessage | ArrayBuffer)[]>();
  private pendingChunks = new Map<
    string, // fromUser
    { fileId: string; chunkSize: number }
  >();

  constructor(
    private zone: NgZone,
    private logger: NGXLogger,
    private toaster: HotToastService,
    private translate: TranslateService
  ) {}

  // =============== Public Methods ===============

  /**
   * Sets up a new data channel for communication with a target user
   * @param channel The RTCDataChannel to set up
   * @param targetUser The user to communicate with
   */
  public setupDataChannel(channel: RTCDataChannel, targetUser: string): void {
    channel.binaryType = 'arraybuffer';
    this.dataChannels.set(targetUser, channel);

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
        const error = rtcErrorEvent.error;
        const errorMsg =
          (error && typeof error.message === 'string' && error.message) ||
          (typeof error === 'object' ? JSON.stringify(error) : String(error)) ||
          'Unknown RTCErrorEvent';
        this.logger.error('setupDataChannel', `Data Channel Error with ${targetUser}: ${errorMsg}`);
        this.toaster.warning(
          this.translate.instant('CONNECTION_UNSTABLE_WITH_USER', { userName: targetUser })
        );
      } else {
        this.logger.error(
          'setupDataChannel',
          `Data Channel Error with ${targetUser}: ${JSON.stringify(ev)}`
        );
        this.toaster.warning(
          this.translate.instant('CONNECTION_UNSTABLE_WITH_USER', { userName: targetUser })
        );
      }
    };

    channel.onclose = () => {
      this.logger.info('setupDataChannel', `Data channel with ${targetUser} is closed`);
      this.dataChannelOpen$.next(false);
      this.dataChannels.delete(targetUser);
    };

    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    channel.onbufferedamountlow = () => {
      this.bufferedAmountLow$.next(targetUser);
    };
  }

  /**
   * Sends a message through the data channel to a target user
   * @param message The message to send
   * @param targetUser The user to send the message to
   */
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

      const queue = this.messageQueues.get(targetUser);
      if (queue) {
        queue.push(message);
      } else {
        this.logger.warn('sendData', `Message queue missing for ${targetUser}`);
      }
    } else {
      this.logger.error('sendData', `Data channel with ${targetUser} is not open`);

      if (channel) {
        this.dataChannels.delete(targetUser);
      }

      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }

      const queue = this.messageQueues.get(targetUser);
      if (queue) {
        queue.push(message);
      } else {
        this.logger.warn('sendData', `Message queue missing for ${targetUser}`);
      }
    }
  }

  /**
   * Sends raw data through the data channel to a target user
   * @param data The raw data to send
   * @param targetUser The user to send the data to
   */
  public sendRawData(data: ArrayBuffer, targetUser: string): boolean {
    if (!this.isDataChannelReadyToSend(targetUser)) {
      if (!this.messageQueues.has(targetUser)) {
        this.messageQueues.set(targetUser, []);
      }
      this.messageQueues.get(targetUser)?.push(data);
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

      const queue = this.messageQueues.get(targetUser);
      if (queue) {
        queue.push(data);
      } else {
        this.logger.warn('sendRawData', `Message queue missing for ${targetUser}`);
      }

      return false;
    }
  }

  /**
   * Gets the data channel for a target user
   * @param targetUser The user to get the channel for
   */
  public getDataChannel(targetUser: string): RTCDataChannel | null {
    return this.dataChannels.get(targetUser) ?? null;
  }

  /**
   * Checks if there is an active connection with a target user
   * @param targetUser The user to check connection with
   */
  public isConnected(targetUser: string): boolean {
    const channel = this.dataChannels.get(targetUser);
    return channel?.readyState === 'open';
  }

  /**
   * Closes all data channel connections
   */
  public closeAllConnections(): void {
    this.dataChannels.forEach((channel) => {
      channel.close();
    });
    this.dataChannels.clear();
    this.messageQueues.clear();
  }

  /**
   * Deletes a data channel for a target user
   * @param targetUser The user to delete the channel for
   */
  public deleteDataChannel(targetUser: string): void {
    this.dataChannels.delete(targetUser);
  }

  /**
   * Deletes the message queue for a target user
   * @param targetUser The user to delete the queue for
   */
  public deleteMessageQueue(targetUser: string): void {
    this.messageQueues.delete(targetUser);
  }

  // =============== Private Methods ===============

  /**
   * Handles incoming data channel messages
   * @param data The received data
   * @param targetUser The user who sent the data
   */
  private handleDataChannelMessage(data: unknown, targetUser: string): void {
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
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER: {
            this.logger.info('handleDataChannelMessage', `Received file offer from ${targetUser}`);
            const fileOfferPayload = message.payload as {
              fileId: string;
              fileName: string;
              fileSize: number;
            };
            this.fileOffers$.next({
              fileId: fileOfferPayload.fileId,
              fileName: fileOfferPayload.fileName,
              fileSize: fileOfferPayload.fileSize,
              fromUser: targetUser,
            });
            break;
          }
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT: {
            this.logger.info(
              'handleDataChannelMessage',
              `Received file acceptance from ${targetUser}`
            );
            const fileAcceptPayload = message.payload as { fileId: string };
            this.fileResponses$.next({
              accepted: true,
              fromUser: targetUser,
              fileId: fileAcceptPayload.fileId,
            });
            break;
          }
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_DECLINE: {
            this.logger.info(
              'handleDataChannelMessage',
              `Received file decline from ${targetUser}`
            );
            const fileDeclinePayload = message.payload as { fileId: string };
            this.fileResponses$.next({
              accepted: false,
              fromUser: targetUser,
              fileId: fileDeclinePayload.fileId,
            });
            break;
          }
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_UPLOAD: {
            this.logger.info(
              'handleDataChannelMessage',
              `Received uploading file cancellation from ${targetUser}`
            );
            const fileCancelUploadPayload = message.payload as { fileId: string };
            this.fileUploadCancelled$.next({
              fromUser: targetUser,
              fileId: fileCancelUploadPayload.fileId,
            });
            break;
          }
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_DOWNLOAD: {
            this.logger.info(
              'handleDataChannelMessage',
              `Received downloading file cancellation from ${targetUser}`
            );
            const fileCancelDownloadPayload = message.payload as { fileId: string };
            this.fileDownloadCancelled$.next({
              fromUser: targetUser,
              fileId: fileCancelDownloadPayload.fileId,
            });
            break;
          }
          case FILE_TRANSFER_MESSAGE_TYPES.FILE_CHUNK: {
            const fileChunkPayload = message.payload as { fileId: string; chunkSize: number };
            const { fileId, chunkSize } = fileChunkPayload;
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

  // =============== Helper Methods ===============

  /**
   * Checks if a data channel is ready to send data
   * @param targetUser The user to check the channel for
   */
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
}

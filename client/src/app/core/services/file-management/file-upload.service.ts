import { Injectable, NgZone } from '@angular/core';
import {
  FileUpload,
  CHUNK_SIZE,
  MAX_BUFFERED_AMOUNT,
  MB,
  FILE_TRANSFER_MESSAGE_TYPES,
} from '../../../utils/constants';
import { FileTransferBaseService } from './file-transfer-base.service';
import { WebRTCService } from '../communication/webrtc.service';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { HotToastService } from '@ngneat/hot-toast';

@Injectable({
  providedIn: 'root',
})
export class FileUploadService extends FileTransferBaseService {
  // =============== Private Properties ===============
  private processingQueues = new Map<string, boolean>();
  private consecutiveErrorCounts = new Map<string, number>();
  private maxConsecutiveErrors = 5;

  // =============== Constructor ===============
  constructor(
    webrtcService: WebRTCService,
    toaster: HotToastService,
    translate: TranslateService,
    logger: NGXLogger,
    ngZone: NgZone
  ) {
    super(webrtcService, toaster, translate, logger, ngZone);
  }

  // =============== Public File Management Methods ===============
  /**
   * Prepares a file for sending by creating necessary transfer metadata
   */
  public async prepareFileForSending(file: File, targetUser: string): Promise<void> {
    let userMap = await this.getFileTransfers(targetUser);
    if (!userMap) {
      userMap = new Map<string, FileUpload>();
      await this.setFileTransfers(targetUser, userMap);
    }

    const fileId = this.generateFileId();
    const fileTransfer: FileUpload = {
      fileId,
      file,
      currentOffset: 0,
      isPaused: false,
      targetUser,
      progress: 0,
    };

    userMap.set(fileId, fileTransfer);
    await this.setFileTransfers(targetUser, userMap);
    await this.updateActiveUploads();
  }

  /**
   * Sends all file offers to a target user
   */
  public async sendAllFileOffers(targetUser: string): Promise<void> {
    const userMap = await this.getFileTransfers(targetUser);
    if (!userMap) {
      this.logger.error('sendAllFileOffers', `No file transfers found for user: ${targetUser}`);
      return;
    }

    this.logger.debug('sendAllFileOffers', `Found ${userMap.size} files to send to ${targetUser}`);
    for (const fileTransfer of userMap.values()) {
      const key = this.getOrCreateStatusKey(targetUser, fileTransfer.fileId);
      const status = await this.getFileTransferStatus(key);
      if (!status || status === 'pending') {
        await this.sendFileOffer(fileTransfer.fileId, targetUser);
      } else {
        this.logger.info(
          'sendAllFileOffers',
          `FileId=${fileTransfer.fileId} already sent or completed. Skipping.`
        );
      }
    }
  }

  /**
   * Starts sending a file after an offer has been accepted
   */
  public async startSendingFile(targetUser: string, fileId: string): Promise<void> {
    const transferId = this.getOrCreateStatusKey(targetUser, fileId);
    await this.setFileTransferStatus(transferId, 'accepted');

    const userMap = await this.getFileTransfers(targetUser);
    if (!userMap) {
      this.logger.error('startSendingFile', `No fileTransfers map for user: ${targetUser}`);
      return;
    }

    const fileTransfer = userMap.get(fileId);
    if (!fileTransfer) {
      this.logger.error('startSendingFile', `No fileId=${fileId} for ${targetUser}`);
      this.toaster.error(this.translate.instant('NO_FILE_TO_SEND'));
      return;
    }
    this.logger.info('startSendingFile', `Starting to send fileId=${fileId} to ${targetUser}`);

    const dataChannel = this.getDataChannel(targetUser);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      this.logger.error('startSendingFile', `Data channel not available/open for ${targetUser}`);
      return;
    }

    try {
      await this.sendNextChunk(fileTransfer);
    } catch (error) {
      this.logger.error('startSendingFile', `File transfer failed: ${error}`);
    }
  }

  /**
   * Declines a file offer request
   */
  public async declineFileOffer(targetUser: string, fileId: string): Promise<void> {
    const transferId = this.getOrCreateStatusKey(targetUser, fileId);
    await this.setFileTransferStatus(transferId, 'declined');

    const userMap = await this.getFileTransfers(targetUser);
    if (userMap) {
      userMap.delete(fileId);
      await this.setFileTransfers(targetUser, userMap);
    }
    await this.updateActiveUploads();
    await this.checkAllUsersResponded();
  }

  /**
   * Cancels an active file upload and notifies the recipient
   */
  public async cancelFileUpload(targetUser: string, fileId: string): Promise<void> {
    const userMap = await this.getFileTransfers(targetUser);
    if (userMap?.has(fileId)) {
      const fileTransfer = userMap.get(fileId);
      if (fileTransfer) {
        fileTransfer.isPaused = true;
        await this.setFileTransfers(targetUser, userMap);
      }

      userMap.delete(fileId);
      const key = this.getOrCreateStatusKey(targetUser, fileId);
      await this.deleteFileTransferStatus(key);
      await this.setFileTransfers(targetUser, userMap);
      await this.updateActiveUploads();

      const message = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_UPLOAD,
        payload: {
          fileId: fileId,
        },
      };
      this.sendData(message, targetUser);
    } else {
      this.logger.error(
        'cancelFileUpload',
        `No file transfer found for ${targetUser} and fileId=${fileId}`
      );
    }
  }

  /**
   * Resumes a paused file transfer when buffer is available
   */
  public async resumePausedTransfer(targetUser: string): Promise<void> {
    const userMap = await this.getFileTransfers(targetUser);
    if (!userMap) return;

    for (const fileTransfer of userMap.values()) {
      if (fileTransfer.isPaused && fileTransfer.currentOffset < fileTransfer.file.size) {
        const dataChannel = this.getDataChannel(fileTransfer.targetUser);
        if (dataChannel && dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
          this.logger.info(
            'resumePausedTransfer',
            `Buffered amount low for ${targetUser}, resuming fileId=${fileTransfer.fileId}`
          );
          fileTransfer.isPaused = false;
          await this.setFileTransfers(targetUser, userMap);
          this.sendNextChunk(fileTransfer).catch((error: unknown) => {
            this.logger.error('resumePausedTransfer', `Error resuming file transfer: ${error}`);
          });
        }
      } else {
        this.logger.info(
          'resumePausedTransfer',
          `FileId=${fileTransfer.fileId} is not paused or already completed.`
        );
      }
    }
  }

  // =============== Private Helper Methods ===============
  /**
   * Sends a file offer to a target user
   */
  private async sendFileOffer(fileId: string, targetUser: string): Promise<void> {
    const userMap = await this.getFileTransfers(targetUser);
    if (!userMap) {
      this.logger.error('sendFileOffer', 'No Map of files for ' + targetUser);
      return;
    }

    const fileTransfer = userMap.get(fileId);
    if (!fileTransfer) {
      this.logger.error('sendFileOffer', `No file with id=${fileId} to send to ${targetUser}`);
      this.toaster.error(this.translate.instant('NO_FILE_TO_SEND'));
      return;
    }

    this.logger.info('sendFileOffer', `Sending file offer to ${targetUser} (id=${fileId})`);
    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER,
      payload: {
        fileId: fileId,
        fileName: fileTransfer.file.name,
        fileSize: fileTransfer.file.size,
        fromUser: targetUser,
      },
    };

    const key = this.getOrCreateStatusKey(targetUser, fileId);
    await this.setFileTransferStatus(key, 'pending');
    this.sendData(message, targetUser);
  }

  /**
   * Checks if all users have responded to file offers
   */
  private async checkAllUsersResponded(): Promise<void> {
    const allStatuses = Array.from(await this.getFileTransferStatuses());
    this.logger.debug('checkAllUsersResponded', 'All statuses:', allStatuses);

    const allResponded = allStatuses.every(
      (status) => status === 'declined' || status === 'completed'
    );

    if (allResponded && allStatuses.length > 0) {
      this.logger.info('checkAllUsersResponded', 'All files have been completed/declined.');
      this.toaster.success(this.translate.instant('ALL_FILES_RESPONDED'));
      await this.clearFileTransfers();
      await this.updateActiveUploads();
    }
  }

  // =============== File Chunk Processing Methods ===============
  /**
   * Sends next chunk of the file being transferred
   */
  private async sendNextChunk(fileTransfer: FileUpload): Promise<void> {
    const transferId = this.getOrCreateStatusKey(fileTransfer.targetUser, fileTransfer.fileId);
    if (this.processingQueues.get(transferId)) {
      return;
    }

    this.processingQueues.set(transferId, true);

    try {
      while (fileTransfer.currentOffset < fileTransfer.file.size) {
        const userMap = await this.getFileTransfers(fileTransfer.targetUser);
        if (!userMap?.has(fileTransfer.fileId)) {
          this.logger.warn(
            'sendNextChunk',
            `File transfer for user=${fileTransfer.targetUser}, fileId=${fileTransfer.fileId} does not exist anymore`
          );
          break;
        }

        if (fileTransfer.isPaused) {
          this.logger.warn('sendNextChunk', `Upload is paused for fileId=${fileTransfer.fileId}`);
          break;
        }

        const dataChannel = this.getDataChannel(fileTransfer.targetUser);
        if (!dataChannel) {
          this.logger.error(
            'sendNextChunk',
            `Data channel is not available for ${fileTransfer.targetUser}`
          );

          this.initiateConnection(fileTransfer.targetUser);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const errorCount = this.consecutiveErrorCounts.get(transferId) ?? 0;
          if (errorCount > this.maxConsecutiveErrors) {
            break;
          }
          continue;
        }

        if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          this.logger.warn(
            'sendNextChunk',
            `Data channel buffer is full (${dataChannel.bufferedAmount} bytes) for ${fileTransfer.targetUser}. Pausing upload.`
          );
          fileTransfer.isPaused = true;
          break;
        }

        const start = fileTransfer.currentOffset;
        const end = Math.min(start + CHUNK_SIZE, fileTransfer.file.size);
        const blob = fileTransfer.file.slice(start, end);

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const chunkSent = await this.processFileChunk(arrayBuffer, fileTransfer, end);

          if (!chunkSent) {
            this.logger.warn('sendNextChunk', `Failed to send chunk, pausing for retry`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
        } catch (error) {
          this.logger.error('sendNextChunk', `Error preparing chunk: ${error}`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        if (fileTransfer.currentOffset >= fileTransfer.file.size) {
          this.logger.info(
            'sendNextChunk',
            `FileId=${fileTransfer.fileId} fully sent to ${fileTransfer.targetUser}`
          );

          fileTransfer.progress = 100;
          const key = this.getOrCreateStatusKey(fileTransfer.targetUser, fileTransfer.fileId);
          await this.setFileTransferStatus(key, 'completed');

          this.toaster.success(
            this.translate.instant('FILE_UPLOAD_COMPLETED', { fileName: fileTransfer.file.name })
          );

          userMap.delete(fileTransfer.fileId);
          await this.setFileTransfers(fileTransfer.targetUser, userMap);
          await this.updateActiveUploads();
          await this.checkAllUsersResponded();
          break;
        }

        if (fileTransfer.currentOffset % MB < CHUNK_SIZE) {
          const mbSent = (fileTransfer.currentOffset / MB).toFixed(2);
          this.logger.info(
            'sendNextChunk',
            `FileId=${fileTransfer.fileId} sent ${mbSent}MB to ${fileTransfer.targetUser}`
          );

          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }
    } finally {
      this.processingQueues.set(transferId, false);
    }
  }

  /**
   * Processes and sends a single file chunk
   */
  private async processFileChunk(
    arrayBuffer: ArrayBuffer,
    fileTransfer: FileUpload,
    end: number
  ): Promise<boolean> {
    const dataChannel = this.getDataChannel(fileTransfer.targetUser);
    if (!dataChannel) {
      this.logger.error('processFileChunk', `No data channel for ${fileTransfer.targetUser}`);
      return false;
    }

    if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      fileTransfer.isPaused = true;
      this.logger.info(
        'processFileChunk',
        `Pausing transfer to ${fileTransfer.targetUser} due to buffer size: ${dataChannel.bufferedAmount}`
      );
      return false;
    }

    const transferId = this.getOrCreateStatusKey(fileTransfer.targetUser, fileTransfer.fileId);
    try {
      const metaMessage = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CHUNK,
        payload: {
          fileId: fileTransfer.fileId,
          chunkSize: arrayBuffer.byteLength,
        },
      };

      this.sendData(metaMessage, fileTransfer.targetUser);
      await new Promise((resolve) => setTimeout(resolve, 5));

      const dataSent = this.sendRawData(arrayBuffer, fileTransfer.targetUser);
      if (!dataSent) {
        this.logger.warn(
          'processFileChunk',
          `Failed to send data chunk for ${fileTransfer.fileId}`
        );
        return false;
      }
      this.consecutiveErrorCounts.set(transferId, 0);

      const progress = (end / fileTransfer.file.size) * 100;
      fileTransfer.currentOffset = end;
      fileTransfer.progress = parseFloat(progress.toFixed(2));

      const userMap = await this.getFileTransfers(fileTransfer.targetUser);
      if (userMap) {
        userMap.set(fileTransfer.fileId, fileTransfer);
        await this.setFileTransfers(fileTransfer.targetUser, userMap);
      }
      await this.updateActiveUploads();

      return true;
    } catch (error) {
      const errorKey = this.getOrCreateStatusKey(fileTransfer.targetUser, fileTransfer.fileId);
      const currentErrors = this.consecutiveErrorCounts.get(errorKey) ?? 0;
      this.consecutiveErrorCounts.set(errorKey, currentErrors + 1);

      this.logger.error('processFileChunk', `Error sending chunk: ${error}`);

      if (currentErrors >= this.maxConsecutiveErrors) {
        this.logger.error(
          'processFileChunk',
          `Too many consecutive errors (${currentErrors}). Canceling transfer.`
        );
        await this.cancelFileUpload(fileTransfer.targetUser, fileTransfer.fileId);
      }

      return false;
    }
  }
}

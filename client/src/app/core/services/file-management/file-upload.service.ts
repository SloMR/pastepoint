import { Injectable, NgZone } from '@angular/core';
import {
  FileUpload,
  CHUNK_SIZE,
  MAX_BUFFERED_AMOUNT,
  MB,
  FILE_TRANSFER_MESSAGE_TYPES,
  FileTransferStatus,
} from '../../../utils/constants';
import { FileTransferBaseService } from './file-transfer-base.service';
import { WebRTCService } from '../communication/webrtc.service';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { HotToastService } from '@ngneat/hot-toast';
import { PreviewService } from '../../services/ui/preview.service';

@Injectable({
  providedIn: 'root',
})
export class FileUploadService extends FileTransferBaseService {
  // =============== Private Properties ===============
  private processingQueues = new Map<string, boolean>();
  private userSendingLocks = new Map<string, boolean>(); // Per-user lock to prevent concurrent sends
  private consecutiveErrorCounts = new Map<string, number>();
  private maxConsecutiveErrors = 5;

  // =============== Constructor ===============
  constructor(
    webrtcService: WebRTCService,
    toaster: HotToastService,
    translate: TranslateService,
    logger: NGXLogger,
    ngZone: NgZone,
    private previewService: PreviewService
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
      if (!status || status === FileTransferStatus.PENDING) {
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
    await this.setFileTransferStatus(transferId, FileTransferStatus.ACCEPTED);

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
    await this.setFileTransferStatus(transferId, FileTransferStatus.DECLINED);

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

    let previewDataUrl: string | undefined;
    let previewMime: string | undefined;
    try {
      const mime = fileTransfer.file.type || '';
      if (mime.startsWith('image/')) {
        previewDataUrl = await this.previewService.createImageThumbnail(fileTransfer.file);
        previewMime = 'image/png';
      } else if (mime === 'application/pdf') {
        previewDataUrl = await this.previewService.createPdfThumbnailFromFile(fileTransfer.file);
        if (previewDataUrl) {
          previewMime = 'image/png';
        }
      }
    } catch (e) {
      this.logger.warn('sendFileOffer', `Failed generating preview: ${String(e)}`);
    }

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER,
      payload: {
        fileId: fileId,
        fileName: fileTransfer.file.name,
        fileSize: fileTransfer.file.size,
        previewDataUrl,
        previewMime,
        fromUser: targetUser,
      },
    };

    const key = this.getOrCreateStatusKey(targetUser, fileId);
    await this.setFileTransferStatus(key, FileTransferStatus.PENDING);
    this.sendData(message, targetUser);
  }

  /**
   * Checks if all users have responded to file offers
   */
  private async checkAllUsersResponded(): Promise<void> {
    const allStatuses = Array.from(await this.getFileTransferStatuses());
    this.logger.debug('checkAllUsersResponded', 'All statuses:', allStatuses);

    const allResponded = allStatuses.every(
      (status) => status === FileTransferStatus.DECLINED || status === FileTransferStatus.COMPLETED
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

        // Use a lower threshold (50% of max) to be more conservative with multiple files
        const bufferThreshold = MAX_BUFFERED_AMOUNT * 0.5;
        if (dataChannel.bufferedAmount > bufferThreshold) {
          this.logger.warn(
            'sendNextChunk',
            `Data channel buffer is high (${dataChannel.bufferedAmount} bytes, threshold ${bufferThreshold}) for ${fileTransfer.targetUser}. Pausing upload.`
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
          await this.setFileTransferStatus(key, FileTransferStatus.COMPLETED);

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
    if (fileTransfer.isPaused) {
      this.logger.info(
        'processFileChunk',
        `Transfer paused for fileId=${fileTransfer.fileId}, skipping chunk`
      );
      return false;
    }

    const dataChannel = this.getDataChannel(fileTransfer.targetUser);
    if (!dataChannel) {
      this.logger.error('processFileChunk', `No data channel for ${fileTransfer.targetUser}`);
      return false;
    }

    // Use a lower threshold to be more conservative with multiple files
    const bufferThreshold = MAX_BUFFERED_AMOUNT * 0.5;
    if (dataChannel.bufferedAmount > bufferThreshold) {
      fileTransfer.isPaused = true;
      this.logger.info(
        'processFileChunk',
        `Pausing transfer to ${fileTransfer.targetUser} due to buffer size: ${dataChannel.bufferedAmount} (threshold: ${bufferThreshold})`
      );
      return false;
    }

    // Wait for any other file transfers to this user to complete their chunk send
    const maxWaitAttempts = 100; // Max 5 seconds wait (100 * 50ms)
    let waitAttempts = 0;
    while (this.userSendingLocks.get(fileTransfer.targetUser) && waitAttempts < maxWaitAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waitAttempts++;
    }

    if (waitAttempts >= maxWaitAttempts) {
      this.logger.warn(
        'processFileChunk',
        `Timeout waiting for user lock for ${fileTransfer.targetUser}`
      );
      return false;
    }

    // Acquire lock for this user
    this.userSendingLocks.set(fileTransfer.targetUser, true);

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
      // Increased delay to ensure metadata arrives before chunk, especially with multiple files
      await new Promise((resolve) => setTimeout(resolve, 20));

      const dataSent = this.sendRawData(arrayBuffer, fileTransfer.targetUser);
      if (!dataSent) {
        this.logger.warn(
          'processFileChunk',
          `Failed to send data chunk for ${fileTransfer.fileId}`
        );
        return false;
      }

      // Small delay after sending chunk to allow receiver to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      this.consecutiveErrorCounts.set(transferId, 0);

      const progress = (end / fileTransfer.file.size) * 100;
      fileTransfer.currentOffset = end;
      fileTransfer.progress = parseFloat(progress.toFixed(2));

      const userMap = await this.getFileTransfers(fileTransfer.targetUser);
      if (userMap) {
        // If the transfer was removed (e.g., cancelled) while this chunk was in-flight,
        // do not re-add it back to the map/UI.
        if (!userMap.has(fileTransfer.fileId)) {
          this.logger.warn(
            'processFileChunk',
            `Transfer no longer exists for fileId=${fileTransfer.fileId}; skipping update`
          );
          return false;
        }

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
    } finally {
      // Release lock for this user
      this.userSendingLocks.delete(fileTransfer.targetUser);
    }
  }
}

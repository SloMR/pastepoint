import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WebRTCService } from '../communication/webrtc.service';
import {
  CHUNK_SIZE,
  FILE_TRANSFER_MESSAGE_TYPES,
  FileDownload,
  FileStatus,
  FileUpload,
  MAX_BUFFERED_AMOUNT,
  MB,
} from '../../../utils/constants';
import { ToastrService } from 'ngx-toastr';
import { v4 as uuidv4 } from 'uuid';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class FileTransferService {
  public activeUploads$ = new BehaviorSubject<FileUpload[]>([]);
  public activeDownloads$ = new BehaviorSubject<FileDownload[]>([]);
  public incomingFileOffers$ = new BehaviorSubject<FileDownload[]>([]);

  private fileTransfers = new Map<string, Map<string, FileUpload>>();
  private incomingFileTransfers = new Map<string, Map<string, FileDownload>>();
  private fileTransferStatus = new Map<string, FileStatus>();
  private processingQueues = new Map<string, boolean>();
  private consecutiveErrorCounts = new Map<string, number>();
  private maxConsecutiveErrors = 5;

  constructor(
    private webrtcService: WebRTCService,
    private toaster: ToastrService,
    public translate: TranslateService,
    private logger: NGXLogger
  ) {
    this.webrtcService.incomingFileChunk$.subscribe(({ fromUser, fileId, chunk }) => {
      this.handleDataChunk(fileId, chunk, fromUser).then(() => {});
    });

    this.webrtcService.fileOffers$.subscribe((offer) => {
      this.logger.info(
        'constructor',
        `Received file offer from ${offer.fromUser} (fileId=${offer.fileId})`
      );
      this.receiveFileOffer(offer);
    });

    this.webrtcService.fileResponses$.subscribe((response) => {
      if (!response.fileId) {
        this.logger.error('constructor', 'File response without fileId – cannot proceed.');
        return;
      }

      const key = this.getOrCreateStatusKey(response.fromUser, response.fileId);

      if (response.accepted) {
        this.logger.info('constructor', `File ${response.fileId} accepted by ${response.fromUser}`);
        this.fileTransferStatus.set(key, 'accepted');
        this.startSendingFile(response.fromUser, response.fileId).then(() => {});
      } else {
        this.logger.warn('constructor', `File ${response.fileId} declined by ${response.fromUser}`);
        this.fileTransferStatus.set(key, 'declined');
        const userMap = this.fileTransfers.get(response.fromUser);
        if (userMap) {
          userMap.delete(response.fileId);
        }
        this.updateActiveUploads();
        this.checkAllUsersResponded();
      }
    });

    this.webrtcService.bufferedAmountLow$.subscribe((targetUser) => {
      this.resumePausedTransfer(targetUser);
    });

    this.webrtcService.fileUploadCancelled$.subscribe(({ fromUser, fileId }) => {
      this.handleFileUploadCancellation(fromUser, fileId);
    });

    this.webrtcService.fileDownloadCancelled$.subscribe(({ fromUser, fileId }) => {
      this.handleFileDownloadCancellation(fromUser, fileId);
    });
  }

  private generateFileId(): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    return `${uuid}-${timestamp}`;
  }

  private getOrCreateStatusKey(user: string, fileId: string) {
    return `${user}-${fileId}`;
  }

  public prepareFileForSending(file: File, targetUser: string): void {
    if (!this.fileTransfers.has(targetUser)) {
      this.fileTransfers.set(targetUser, new Map<string, FileUpload>());
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
    this.fileTransfers.get(targetUser)!.set(fileId, fileTransfer);

    this.updateActiveUploads();
  }

  private sendFileOffer(fileId: string, targetUser: string): void {
    const userMap = this.fileTransfers.get(targetUser);
    if (!userMap) {
      this.logger.error('sendFileOffer', 'No Map of files for ' + targetUser);
      return;
    }

    const fileTransfer = userMap.get(fileId);
    if (!fileTransfer) {
      this.logger.error('sendFileOffer', `No file with id=${fileId} to send to ${targetUser}`);
      this.toaster.error(this.translate.instant('NO_FILE_TO_SEND'), 'Error');
      return;
    }

    this.logger.info('sendFileOffer', `Sending file offer to ${targetUser} (id=${fileId})`);
    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER,
      payload: {
        fileId: fileId,
        fileName: fileTransfer.file.name,
        fileSize: fileTransfer.file.size,
      },
    };

    const key = this.getOrCreateStatusKey(targetUser, fileId);
    this.fileTransferStatus.set(key, 'pending');
    this.webrtcService.sendData(message, targetUser);
  }

  public sendAllFileOffers(targetUser: string): void {
    const userMap = this.fileTransfers.get(targetUser);
    if (!userMap) return;

    userMap.forEach((fileTransfer) => {
      const key = this.getOrCreateStatusKey(targetUser, fileTransfer.fileId);
      const status = this.fileTransferStatus.get(key);
      if (!status || status === 'pending') {
        this.sendFileOffer(fileTransfer.fileId, targetUser);
      } else {
        this.logger.info(
          'sendAllFileOffers',
          `FileId=${fileTransfer.fileId} already sent or completed. Skipping.`
        );
      }
    });
  }

  private receiveFileOffer(offer: {
    fileId: string;
    fileName: string;
    fileSize: number;
    fromUser: string;
  }): void {
    const { fromUser, fileId, fileName, fileSize } = offer;
    if (!this.incomingFileTransfers.has(fromUser)) {
      this.incomingFileTransfers.set(fromUser, new Map<string, FileDownload>());
    }

    const fileTransfers = this.incomingFileTransfers.get(fromUser);
    if (fileTransfers) {
      const fileDownload: FileDownload = {
        fileId,
        fileName,
        fileSize,
        fromUser,
        receivedSize: 0,
        dataBuffer: [],
        progress: 0,
        isAccepted: false,
      };

      fileTransfers.set(fileId, fileDownload);
      this.updateIncomingFileOffers();
    } else {
      this.logger.error('receiveFileOffer', `No file transfers map for user: ${fromUser}`);
      return;
    }
  }

  public startSavingFile(fromUser: string, fileId: string): void {
    const userMap = this.incomingFileTransfers.get(fromUser);
    if (!userMap) {
      this.logger.error('startSavingFile', `No incoming file map found from user: ${fromUser}`);
      return;
    }

    const fileDownload = userMap.get(fileId);
    if (!fileDownload) {
      this.logger.error('startSavingFile', `No file with id=${fileId} from ${fromUser} to accept`);
      return;
    }

    fileDownload.isAccepted = true;
    this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT,
      payload: {
        fileId: fileId,
      },
    };

    this.logger.info(
      'startSavingFile',
      `Sending file acceptance to ${fromUser} for fileId=${fileId}`
    );
    this.webrtcService.sendData(message, fromUser);
    this.updateActiveDownloads();
  }

  public declineFileOffer(fromUser: string, fileId: string): void {
    const userMap = this.incomingFileTransfers.get(fromUser);
    if (userMap) {
      userMap.delete(fileId);
    }
    this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_DECLINE,
      payload: {
        fileId: fileId,
      },
    };
    this.webrtcService.sendData(message, fromUser);
    this.toaster.info(
      this.translate.instant('FILE_TRANSFER_DECLINED'),
      this.translate.instant('DECLINED')
    );
  }

  private async handleDataChunk(fileId: string, chunk: ArrayBuffer, fromUser: string) {
    const userMap = this.incomingFileTransfers.get(fromUser);
    if (!userMap) {
      this.logger.warn(
        'handleDataChunk',
        `Discarding chunk - no incomingFileTransfers map found for user ${fromUser}`
      );
      return;
    }

    const fileDownload = userMap.get(fileId);
    if (!fileDownload || !fileDownload.isAccepted) {
      this.logger.warn(
        'handleDataChunk',
        `Discarding chunk - transfer not active or not accepted for fileId=${fileId}`
      );
      return;
    }

    fileDownload.dataBuffer.push(new Uint8Array(chunk));
    fileDownload.receivedSize += chunk.byteLength;

    const progress = (fileDownload.receivedSize / fileDownload.fileSize) * 100;
    fileDownload.progress = parseFloat(progress.toFixed(2));

    this.updateActiveDownloads();

    if (fileDownload.receivedSize >= fileDownload.fileSize) {
      this.logger.info('handleDataChunk', `File received successfully (fileId=${fileId})`);

      const totalLength = fileDownload.dataBuffer.reduce((acc, curr) => acc + curr.length, 0);
      const combinedArray = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of fileDownload.dataBuffer) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }

      const receivedBlob = new Blob([combinedArray]);
      const downloadUrl = URL.createObjectURL(receivedBlob);
      const fileName = fileDownload.fileName || 'downloaded_file';

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      userMap.delete(fileId);
      if (userMap.size === 0) {
        this.incomingFileTransfers.delete(fromUser);
      }
      this.updateActiveDownloads();
    } else {
      this.logger.info(
        'handleDataChunk',
        `FileId=${fileId} chunk received. Progress: ${fileDownload.progress.toFixed(2)}%`
      );
    }
  }

  private async startSendingFile(targetUser: string, fileId: string): Promise<void> {
    const userMap = this.fileTransfers.get(targetUser);
    if (!userMap) {
      this.logger.error('startSendingFile', `No fileTransfers map for user: ${targetUser}`);
      return;
    }

    const fileTransfer = userMap.get(fileId);
    if (!fileTransfer) {
      this.logger.error('startSendingFile', `No fileId=${fileId} for ${targetUser}`);
      this.toaster.error(this.translate.instant('NO_FILE_TO_SEND'), 'Error');
      return;
    }
    this.logger.info('startSendingFile', `Starting to send fileId=${fileId} to ${targetUser}`);

    const dataChannel = this.webrtcService.getDataChannel(targetUser);
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

  private async sendNextChunk(fileTransfer: FileUpload): Promise<void> {
    const transferId = `${fileTransfer.targetUser}-${fileTransfer.fileId}`;
    if (this.processingQueues.get(transferId)) {
      return;
    }

    this.processingQueues.set(transferId, true);

    try {
      while (fileTransfer.currentOffset < fileTransfer.file.size) {
        const userMap = this.fileTransfers.get(fileTransfer.targetUser);
        if (!userMap || !userMap.has(fileTransfer.fileId)) {
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

        const dataChannel = this.webrtcService.getDataChannel(fileTransfer.targetUser);
        if (!dataChannel) {
          this.logger.error(
            'sendNextChunk',
            `Data channel is not available for ${fileTransfer.targetUser}`
          );

          this.webrtcService.initiateConnection(fileTransfer.targetUser);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const errorCount = this.consecutiveErrorCounts.get(transferId) || 0;
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
          this.fileTransferStatus.set(key, 'completed');

          userMap.delete(fileTransfer.fileId);
          this.updateActiveUploads();
          this.checkAllUsersResponded();
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

  private async processFileChunk(
    arrayBuffer: ArrayBuffer,
    fileTransfer: FileUpload,
    end: number
  ): Promise<boolean> {
    const dataChannel = this.webrtcService.getDataChannel(fileTransfer.targetUser);
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

    try {
      const metaMessage = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CHUNK,
        payload: {
          fileId: fileTransfer.fileId,
          chunkSize: arrayBuffer.byteLength,
        },
      };

      this.webrtcService.sendData(metaMessage, fileTransfer.targetUser);
      await new Promise((resolve) => setTimeout(resolve, 5));

      const dataSent = this.webrtcService.sendRawData(arrayBuffer, fileTransfer.targetUser);
      if (!dataSent) {
        this.logger.warn(
          'processFileChunk',
          `Failed to send data chunk for ${fileTransfer.fileId}`
        );
        return false;
      }
      this.consecutiveErrorCounts.set(`${fileTransfer.targetUser}-${fileTransfer.fileId}`, 0);

      const progress = (end / fileTransfer.file.size) * 100;
      fileTransfer.currentOffset = end;
      fileTransfer.progress = parseFloat(progress.toFixed(2));
      this.updateActiveUploads();

      return true;
    } catch (error) {
      const errorKey = `${fileTransfer.targetUser}-${fileTransfer.fileId}`;
      const currentErrors = this.consecutiveErrorCounts.get(errorKey) || 0;
      this.consecutiveErrorCounts.set(errorKey, currentErrors + 1);

      this.logger.error('processFileChunk', `Error sending chunk: ${error}`);

      if (currentErrors >= this.maxConsecutiveErrors) {
        this.logger.error(
          'processFileChunk',
          `Too many consecutive errors (${currentErrors}). Canceling transfer.`
        );
        this.cancelUpload(fileTransfer.targetUser, fileTransfer.fileId);
      }

      return false;
    }
  }

  public cancelUpload(targetUser: string, fileId: string): void {
    const userMap = this.fileTransfers.get(targetUser);
    if (userMap && userMap.has(fileId)) {
      userMap.delete(fileId);
      const key = this.getOrCreateStatusKey(targetUser, fileId);
      this.fileTransferStatus.delete(key);
      this.updateActiveUploads();

      const message = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_UPLOAD,
        payload: {
          fileId: fileId,
        },
      };
      this.webrtcService.sendData(message, targetUser);
    }
  }

  public cancelDownload(fromUser: string, fileId: string): void {
    const userMap = this.incomingFileTransfers.get(fromUser);
    if (userMap && userMap.has(fileId)) {
      userMap.delete(fileId);
      const key = this.getOrCreateStatusKey(fromUser, fileId);
      this.fileTransferStatus.delete(key);
      this.updateActiveDownloads();

      const message = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_DOWNLOAD,
        payload: {
          fileId: fileId,
        },
      };
      this.webrtcService.sendData(message, fromUser);
      this.logger.info('cancelDownload', `Cancel download fromUser=${fromUser}, fileId=${fileId}`);
    }
  }

  private handleFileUploadCancellation(fromUser: string, fileId: string): void {
    this.logger.info(
      'handleFileUploadCancellation',
      `File upload from ${fromUser} (fileId=${fileId}) was cancelled`
    );

    const userMap = this.incomingFileTransfers.get(fromUser);
    if (userMap) {
      userMap.delete(fileId);
      if (userMap.size === 0) {
        this.incomingFileTransfers.delete(fromUser);
      }
    }

    this.updateIncomingFileOffers();
    this.updateActiveDownloads();

    this.toaster.info(
      this.translate.instant('FILE_UPLOAD_CANCELLED'),
      this.translate.instant('CANCELLED')
    );
  }

  private handleFileDownloadCancellation(fromUser: string, fileId: string): void {
    this.logger.info(
      'handleFileDownloadCancellation',
      `File download from ${fromUser} (fileId=${fileId}) was cancelled.`
    );

    const userMap = this.fileTransfers.get(fromUser);
    if (userMap) {
      userMap.delete(fileId);
      if (userMap.size === 0) {
        this.fileTransfers.delete(fromUser);
      }
    }

    this.updateIncomingFileOffers();
    this.updateActiveUploads();

    this.toaster.info(
      this.translate.instant('FILE_DOWNLOAD_CANCELLED'),
      this.translate.instant('CANCELLED')
    );
  }

  private updateActiveUploads(): void {
    const allUploads: FileUpload[] = [];
    this.fileTransfers.forEach((mapOfUploads) => {
      mapOfUploads.forEach((fileUpload) => {
        allUploads.push(fileUpload);
      });
    });
    this.activeUploads$.next(allUploads);
  }

  private updateActiveDownloads(): void {
    const allDownloads: FileDownload[] = [];
    this.incomingFileTransfers.forEach((mapOfDownloads) => {
      mapOfDownloads.forEach((fileDownload) => {
        if (fileDownload.isAccepted) {
          allDownloads.push(fileDownload);
        }
      });
    });
    this.activeDownloads$.next(allDownloads);
  }

  private updateIncomingFileOffers(): void {
    const allOffers: FileDownload[] = [];
    this.incomingFileTransfers.forEach((mapOfDownloads) => {
      mapOfDownloads.forEach((fileDownload) => {
        if (!fileDownload.isAccepted) {
          allOffers.push(fileDownload);
        }
      });
    });
    this.incomingFileOffers$.next(allOffers);
  }

  private resumePausedTransfer(targetUser: string): void {
    const userMap = this.fileTransfers.get(targetUser);
    if (!userMap) return;

    userMap.forEach((fileTransfer) => {
      if (fileTransfer.isPaused && fileTransfer.currentOffset < fileTransfer.file.size) {
        const dataChannel = this.webrtcService.getDataChannel(fileTransfer.targetUser);
        if (dataChannel && dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
          this.logger.info(
            'resumePausedTransfer',
            `Buffered amount low for ${targetUser}, resuming fileId=${fileTransfer.fileId}`
          );
          fileTransfer.isPaused = false;
          this.sendNextChunk(fileTransfer).catch((error) => {
            this.logger.error('resumePausedTransfer', `Error resuming file transfer: ${error}`);
          });
        }
      } else {
        this.logger.info(
          'resumePausedTransfer',
          `FileId=${fileTransfer.fileId} is not paused or already completed.`
        );
      }
    });
  }

  private checkAllUsersResponded(): void {
    const allStatuses = Array.from(this.fileTransferStatus.values());
    const allResponded = allStatuses.every(
      (status) => status === 'declined' || status === 'completed'
    );

    if (allResponded && allStatuses.length > 0) {
      this.logger.info('checkAllUsersResponded', 'All files have been completed/declined.');
      this.toaster.success(
        this.translate.instant('ALL_FILES_RESPONDED'),
        this.translate.instant('SUCCESS')
      );
      this.fileTransfers.clear();
      this.fileTransferStatus.clear();
      this.updateActiveUploads();
    }
  }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebRTCService } from './webrtc.service';
import {
  CHUNK_SIZE,
  FILE_TRANSFER_MESSAGE_TYPES,
  FileDownload,
  FileStatus,
  FileUpload,
  MAX_BUFFERED_AMOUNT,
} from '../../utils/constants';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root',
})
export class FileTransferService {
  private _logger: ReturnType<LoggerService['create']> | undefined;

  public activeUploads$ = new BehaviorSubject<FileUpload[]>([]);
  public activeDownloads$ = new BehaviorSubject<FileDownload[]>([]);
  public incomingFileOffers$ = new BehaviorSubject<FileDownload[]>([]);

  private fileTransfers = new Map<string, FileUpload>();
  private incomingFileTransfers = new Map<string, FileDownload>();
  private fileTransferStatus = new Map<string, FileStatus>();

  private get logger() {
    if (!this._logger) {
      this._logger = this.loggerService.create('FileTransferService');
    }
    return this._logger;
  }

  constructor(
    private loggerService: LoggerService,
    private webrtcService: WebRTCService,
    private toaster: ToastrService
  ) {
    this.webrtcService.incomingData$.subscribe(async ({ data, fromUser }) => {
      if (data instanceof ArrayBuffer) {
        await this.handleDataChunk(data, fromUser);
      }
    });

    this.webrtcService.fileOffers$.subscribe((offer) => {
      this.logger.info('constructor', `Received file offer from ${offer.fromUser}`);
      this.receiveFileOffer(offer);
    });

    this.webrtcService.fileResponses$.subscribe((response) => {
      if (response.accepted) {
        this.logger.info('constructor', `File accepted by ${response.fromUser}`);

        this.fileTransferStatus.set(response.fromUser, 'accepted');
        this.startSendingFile(response.fromUser).then(() => {});
      } else {
        this.logger.warn('constructor', `File declined by ${response.fromUser}`);

        this.fileTransferStatus.set(response.fromUser, 'declined');
        this.checkAllUsersResponded();
      }
    });

    this.webrtcService.bufferedAmountLow$.subscribe((targetUser) => {
      this.resumePausedTransfer(targetUser);
    });

    this.webrtcService.fileUploadCancelled$.subscribe(({ fromUser }) => {
      this.handleFileUploadCancellation(fromUser);
    });

    this.webrtcService.fileDownloadCancelled$.subscribe(({ fromUser }) => {
      this.handleFileDownloadCancellation(fromUser);
    });
  }

  public prepareFileForSending(file: File, targetUser: string): void {
    const fileTransfer: FileUpload = {
      file,
      currentOffset: 0,
      isPaused: false,
      targetUser,
      progress: 0,
    };

    this.fileTransfers.set(targetUser, fileTransfer);
    this.updateActiveUploads();
  }

  public sendFileOffer(targetUser: string): void {
    const fileTransfer = this.fileTransfers.get(targetUser);
    if (!fileTransfer) {
      this.logger.error('sendFileOffer', 'No file to send.');
      this.showError('No file to send.', 'Error');
      return;
    }
    this.logger.info('sendFileOffer', `Sending file offer to ${targetUser}`);

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER,
      payload: {
        fileName: fileTransfer.file.name,
        fileSize: fileTransfer.file.size,
      },
    };

    this.fileTransferStatus.set(targetUser, 'pending');
    this.webrtcService.sendData(message, targetUser);
  }

  public receiveFileOffer(offer: { fileName: string; fileSize: number; fromUser: string }): void {
    const fileDownload: FileDownload = {
      fileName: offer.fileName,
      fileSize: offer.fileSize,
      fromUser: offer.fromUser,
      receivedSize: 0,
      dataBuffer: [],
      progress: 0,
      isAccepted: false,
    };

    this.incomingFileTransfers.set(offer.fromUser, fileDownload);
    this.updateIncomingFileOffers();
  }

  public startSavingFile(fromUser: string): void {
    const fileDownload = this.incomingFileTransfers.get(fromUser);
    if (!fileDownload) {
      this.logger.error('startSavingFile', 'No incoming file to accept from ' + fromUser);
      return;
    }

    fileDownload.isAccepted = true;
    this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT,
      payload: {},
    };

    this.logger.info('startSavingFile', `Sending file acceptance to ${fromUser}`);
    this.webrtcService.sendData(message, fromUser);
    this.updateActiveDownloads();
  }

  public declineFileOffer(fromUser: string): void {
    this.incomingFileTransfers.delete(fromUser);
    this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_DECLINE,
      payload: {},
    };
    this.webrtcService.sendData(message, fromUser);
    this.showInfo('You declined the file transfer.', 'Declined');
  }

  private async handleDataChunk(data: ArrayBuffer, fromUser: string): Promise<void> {
    const fileDownload = this.incomingFileTransfers.get(fromUser);

    if (!fileDownload || !fileDownload.isAccepted) {
      this.logger.warn('handleDataChunk', 'Discarding leftover data chunk - transfer not active.');
      return;
    }

    fileDownload.dataBuffer.push(new Uint8Array(data));
    fileDownload.receivedSize += data.byteLength;

    const progress = (fileDownload.receivedSize / fileDownload.fileSize) * 100;
    fileDownload.progress = parseFloat(progress.toFixed(2));

    this.updateActiveDownloads();

    if (fileDownload.receivedSize >= fileDownload.fileSize) {
      this.logger.info('handleDataChunk', 'File received successfully');

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

      this.incomingFileTransfers.delete(fromUser);
      this.updateActiveDownloads();
    }
  }

  private async startSendingFile(targetUser: string): Promise<void> {
    const fileTransfer = this.fileTransfers.get(targetUser);
    if (!fileTransfer) {
      this.logger.error('startSendingFile', 'No file to send to ' + targetUser);
      return;
    }
    this.logger.info('startSendingFile', `Starting to send file to ${targetUser}`);

    const dataChannel = this.webrtcService.getDataChannel(targetUser);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      this.logger.error(
        'startSendingFile',
        `Data channel is not available or open for ${targetUser}`
      );
      return;
    }

    try {
      await this.sendNextChunk(fileTransfer);
    } catch (error) {
      this.logger.error('startSendingFile', `File transfer failed: ${error}`);
    }
  }

  private async sendNextChunk(fileTransfer: FileUpload): Promise<void> {
    while (fileTransfer.currentOffset < fileTransfer.file.size) {
      if (!this.fileTransfers.has(fileTransfer.targetUser)) {
        this.logger.warn(
          'sendNextChunk',
          `File transfer for ${fileTransfer.targetUser} does not exist`
        );
        break;
      }

      if (fileTransfer.isPaused) {
        this.logger.warn('sendNextChunk', `Upload is paused for ${fileTransfer.targetUser}`);
        break;
      }

      const dataChannel = this.webrtcService.getDataChannel(fileTransfer.targetUser);
      if (!dataChannel) {
        this.logger.error(
          'sendNextChunk',
          `Data channel is not available for ${fileTransfer.targetUser}`
        );
        break;
      }

      if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        this.logger.warn(
          'sendNextChunk',
          `Data channel buffer is full for ${fileTransfer.targetUser}. Pausing upload.`
        );
        fileTransfer.isPaused = true;
        break;
      }

      const start = fileTransfer.currentOffset;
      const end = Math.min(start + CHUNK_SIZE, fileTransfer.file.size);
      const blob = fileTransfer.file.slice(start, end);

      const arrayBuffer = await blob.arrayBuffer();

      await this.processFileChunk(arrayBuffer, fileTransfer, end);

      if (fileTransfer.currentOffset >= fileTransfer.file.size) {
        this.logger.info('sendNextChunk', `File sent successfully to ${fileTransfer.targetUser}`);

        fileTransfer.progress = 100;
        this.fileTransferStatus.set(fileTransfer.targetUser, 'completed');
        this.fileTransfers.delete(fileTransfer.targetUser);

        this.updateActiveUploads();
        this.checkAllUsersResponded();
        break;
      }
    }
  }

  private async processFileChunk(
    arrayBuffer: ArrayBuffer,
    fileTransfer: FileUpload,
    end: number
  ): Promise<void> {
    const dataChannel = this.webrtcService.getDataChannel(fileTransfer.targetUser);

    if (!dataChannel) {
      this.logger.error(
        'processFileChunk',
        `Data channel is not available for ${fileTransfer.targetUser}`
      );
      return;
    }

    while (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.webrtcService.sendRawData(arrayBuffer, fileTransfer.targetUser);
    fileTransfer.currentOffset = end;

    const progress = (fileTransfer.currentOffset / fileTransfer.file.size) * 100;
    fileTransfer.progress = parseFloat(progress.toFixed(2));

    this.updateActiveUploads();
  }

  public cancelUpload(targetUser: string): void {
    const upload = this.fileTransfers.get(targetUser);
    if (upload) {
      this.fileTransfers.delete(targetUser);
      this.fileTransferStatus.delete(targetUser);
      this.updateActiveUploads();

      const message = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_UPLOAD,
        payload: {},
      };

      this.webrtcService.sendData(message, targetUser);
    }
  }

  public cancelDownload(fromUser: string): void {
    const download = this.incomingFileTransfers.get(fromUser);
    if (download) {
      this.incomingFileTransfers.delete(fromUser);
      this.fileTransferStatus.delete(fromUser);
      this.updateActiveDownloads();

      const message = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_DOWNLOAD,
        payload: {},
      };

      this.webrtcService.sendData(message, fromUser);
      this.logger.info('cancelDownload', `Cancel download download fromUser: ${fromUser}`);
    }
  }

  private handleFileUploadCancellation(fromUser: string): void {
    this.logger.info('handleFileUploadCancellation', `File upload from ${fromUser} was cancelled.`);

    this.incomingFileTransfers.delete(fromUser);
    this.updateIncomingFileOffers();
    this.updateActiveDownloads();

    this.showInfo(`File upload from ${fromUser} was cancelled by the sender.`, 'Cancelled');
  }

  private handleFileDownloadCancellation(fromUser: string): void {
    this.logger.info(
      'handleFileDownloadCancellation',
      `File download from ${fromUser} was cancelled.`
    );

    this.fileTransfers.delete(fromUser);
    this.updateIncomingFileOffers();
    this.updateActiveUploads();

    this.showInfo(`File download from ${fromUser} was cancelled by the sender.`, 'Cancelled');
  }

  private updateActiveUploads(): void {
    this.activeUploads$.next(Array.from(this.fileTransfers.values()));
  }

  private updateActiveDownloads(): void {
    const downloads = Array.from(this.incomingFileTransfers.values()).filter(
      (transfer) => transfer.isAccepted
    );
    this.activeDownloads$.next(downloads);
  }

  private updateIncomingFileOffers(): void {
    const offers = Array.from(this.incomingFileTransfers.values()).filter(
      (transfer) => !transfer.isAccepted
    );
    this.incomingFileOffers$.next(offers);
  }

  private resumePausedTransfer(targetUser: string): void {
    const fileTransfer = this.fileTransfers.get(targetUser);
    if (
      fileTransfer &&
      fileTransfer.isPaused &&
      fileTransfer.currentOffset < fileTransfer.file.size
    ) {
      const dataChannel = this.webrtcService.getDataChannel(fileTransfer.targetUser);

      if (dataChannel && dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
        this.logger.info(
          'resumePausedTransfer',
          `Buffered amount low for ${fileTransfer.targetUser}, resuming transfer.`
        );

        fileTransfer.isPaused = false;
        this.sendNextChunk(fileTransfer).catch((error) => {
          this.logger.error(
            'resumePausedTransfer',
            `Error resuming file transfer to ${fileTransfer.targetUser}: ${error}`
          );
        });
      }
    }
  }

  private checkAllUsersResponded(): void {
    const allResponded = Array.from(this.fileTransferStatus.values()).every(
      (status) => status === 'declined' || status === 'completed'
    );

    if (allResponded) {
      this.logger.info(
        'checkAllUsersResponded',
        'All users have responded and file transfers completed.'
      );
      this.showSuccess('All users responded. File transfers done.', 'Success');
      this.fileTransfers.clear();
      this.fileTransferStatus.clear();
      this.updateActiveUploads();
    }
  }

  // ~~~~~~~~~~~~~~~~~~ UTILITY UI ALERTS ~~~~~~~~~~~~~~~~~~~~~~~~~~
  // TODO: Move to new service.
  private showInfo(message: string, title: string): void {
    this.toaster.info(title, message);
  }

  private showError(message: string, title: string): void {
    this.toaster.error(message, title);
  }

  private showSuccess(message: string, title: string): void {
    this.toaster.success(title, message);
  }
}

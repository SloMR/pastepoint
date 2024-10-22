import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebRTCService } from './webrtc.service';
import {
  CHUNK_SIZE,
  FILE_TRANSFER_MESSAGE_TYPES,
  MAX_BUFFERED_AMOUNT,
} from '../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class FileTransferService {
  public uploadProgress$ = new BehaviorSubject<number>(0);
  public downloadProgress$ = new BehaviorSubject<number>(0);
  public incomingFile$ = new BehaviorSubject<{
    fileName: string;
    fileSize: number;
    fromUser: string;
  } | null>(null);

  private fileToSend: File | null = null;
  private targetUser = '';
  private receivedSize = 0;
  private receivedDataBuffer: Uint32Array[] = [];
  private isPaused = false;
  private incomingFileSize = 0;
  private isReceivingFile = false;
  private currentOffset = 0;

  private fileTransferStatus = new Map<string, 'pending' | 'accepted' | 'declined'>();

  constructor(
    private logger: LoggerService,
    private webrtcService: WebRTCService
  ) {
    this.webrtcService.incomingData$.subscribe(async (data) => {
      if (data instanceof ArrayBuffer) {
        await this.handleDataChunk(data);
      }
    });

    this.webrtcService.fileOffers$.subscribe((offer) => {
      this.logger.info(`Received file offer from ${offer.fromUser}`);
      this.incomingFile$.next({
        fileName: offer.fileName,
        fileSize: offer.fileSize,
        fromUser: offer.fromUser,
      });
    });

    this.webrtcService.fileResponses$.subscribe((response) => {
      if (response.accepted) {
        this.logger.info(`File accepted by ${response.fromUser}`);
        this.fileTransferStatus.set(response.fromUser, 'accepted');
        this.startSendingFile(response.fromUser);
      } else {
        this.logger.warn(`File declined by ${response.fromUser}`);
        this.fileTransferStatus.set(response.fromUser, 'declined');
        alert('The receiver declined the file transfer.');
      }
    });

    this.webrtcService.bufferedAmountLow$.subscribe(() => {
      if (this.isPaused) {
        this.isPaused = false;
        this.logger.info('Buffered amount low, resuming file transfer.');
        this.sendNextChunk(this.targetUser).then(() => {
          this.logger.info('File transfer completed.');
          this.checkAllUsersResponded();
        });
      }
    });
  }

  public prepareFileForSending(file: File, targetUser: string): void {
    this.fileToSend = file;
    this.targetUser = targetUser;
  }

  public sendFileOffer(targetUser: string): void {
    if (!this.fileToSend) {
      this.logger.error('No file to send.');
      return;
    }
    this.logger.info(`Sending file offer to ${targetUser}`);
    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER,
      payload: {
        fileName: this.fileToSend.name,
        fileSize: this.fileToSend.size,
      },
    };
    this.fileTransferStatus.set(targetUser, 'pending');
    this.webrtcService.sendData(message, targetUser);
  }

  public startSavingFile(): void {
    if (!this.incomingFile$.value) {
      this.logger.error('No incoming file to accept.');
      return;
    }

    const { fromUser, fileSize } = this.incomingFile$.value;
    this.incomingFileSize = fileSize;
    this.isReceivingFile = true;

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT,
      payload: {},
    };

    this.logger.info(`Sending file acceptance to ${fromUser}`);

    this.webrtcService.sendData(message, fromUser);
    this.receivedSize = 0;
    this.receivedDataBuffer = [];
  }

  private async handleDataChunk(data: ArrayBuffer): Promise<void> {
    if (!this.isReceivingFile) {
      this.logger.error('Received data chunk when not expecting a file transfer. Ignoring.');
      return;
    }

    this.receivedDataBuffer.push(new Uint32Array(data));
    this.receivedSize += data.byteLength;
    const fileSize = this.incomingFileSize;

    if (!fileSize) {
      this.logger.error('Invalid file size.');
      return;
    }

    const progress = (this.receivedSize / fileSize) * 100;
    if (isFinite(progress)) {
      this.downloadProgress$.next(parseFloat(progress.toFixed(2)));
    } else {
      this.logger.error('Progress is non-finite');
      return;
    }

    if (this.receivedSize >= fileSize) {
      this.logger.info('File received successfully');

      const totalLength = this.receivedDataBuffer.reduce((acc, curr) => acc + curr.length, 0);
      const combinedArray = new Uint32Array(totalLength);
      let offset = 0;
      for (const chunk of this.receivedDataBuffer) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }

      const receivedBlob = new Blob([combinedArray]);
      const downloadUrl = URL.createObjectURL(receivedBlob);
      const fileName = this.incomingFile$.value?.fileName || 'downloaded_file';

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      this.downloadProgress$.next(100);
      this.resetProgressAfterDelay();
      this.incomingFile$.next(null);
      this.receivedDataBuffer = [];
      this.receivedSize = 0;
      this.incomingFileSize = 0;
      this.isReceivingFile = false;
    }
  }

  private async startSendingFile(targetUser: string): Promise<void> {
    if (!this.fileToSend) {
      this.logger.error('No file to send.');
      return;
    }

    this.logger.info(`Starting to send file to ${targetUser}`);

    const dataChannel = this.webrtcService.getDataChannel(targetUser);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      this.logger.error(`Data channel is not available or open for ${targetUser}`);
      return;
    }

    this.currentOffset = 0;
    try {
      await this.sendNextChunk(targetUser);
      this.logger.info('File transfer completed.');
      this.checkAllUsersResponded();
    } catch (error) {
      this.logger.error(`File transfer failed: ${error}`);
    }
  }

  private async sendNextChunk(targetUser: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.isPaused || !this.fileToSend) {
        this.logger.warn(
          `Upload is paused: ${this.isPaused} or no file to send: ${this.fileToSend}`
        );
        resolve();
        return;
      }

      const { fileToSend } = this;
      const dataChannel = this.webrtcService.getDataChannel(targetUser);
      if (!dataChannel) {
        this.logger.error(`Data channel is not available for ${targetUser}`);
        reject(new Error(`Data channel is not available for ${targetUser}`));
        return;
      }

      if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        this.logger.warn('Data channel buffer is full. Pausing upload.');
        this.isPaused = true;
        resolve();
        return;
      }

      const start = this.currentOffset;
      const end = Math.min(start + CHUNK_SIZE, fileToSend.size);
      const blob = fileToSend.slice(start, end);

      const fileReader = new FileReader();
      fileReader.onload = (e) => {
        if (e.target?.result) {
          const arrayBuffer = e.target.result as ArrayBuffer;

          // Handle async logic outside of the Promise executor
          this.processFileChunk(arrayBuffer, targetUser, end).then(resolve).catch(reject); // Handle potential errors
        }
      };

      fileReader.onerror = (error) => {
        this.logger.error(`Error reading file chunk: ${error}`);
        reject(error);
      };

      fileReader.readAsArrayBuffer(blob);
    });
  }

  private async processFileChunk(
    arrayBuffer: ArrayBuffer,
    targetUser: string,
    end: number
  ): Promise<void> {
    const dataChannel = this.webrtcService.getDataChannel(targetUser);

    if (!dataChannel || this.fileToSend === null) {
      this.logger.error(`Data channel is not available for ${targetUser}`);
      return;
    }

    while (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.webrtcService.sendRawData(arrayBuffer, targetUser);
    this.currentOffset = end;

    const progress = (this.currentOffset / this.fileToSend.size) * 100;
    if (isFinite(progress)) {
      this.uploadProgress$.next(parseFloat(progress.toFixed(2)));
    } else {
      this.logger.error('Upload progress is non-finite');
    }

    if (this.currentOffset < this.fileToSend.size) {
      await this.sendNextChunk(targetUser);
    } else {
      this.logger.info(`File sent successfully to ${targetUser}`);
      this.uploadProgress$.next(100);
      this.resetProgressAfterDelay();
    }
  }

  private resetProgressAfterDelay(): void {
    setTimeout(() => {
      this.uploadProgress$.next(0);
      this.downloadProgress$.next(0);
    }, 2000);
  }

  private checkAllUsersResponded(): void {
    const allResponded = Array.from(this.fileTransferStatus.values()).every(
      (status) => status !== 'pending'
    );

    if (allResponded) {
      this.logger.info('All users have responded.');
      this.fileToSend = null;
      this.fileTransferStatus.clear();
    }
  }
}

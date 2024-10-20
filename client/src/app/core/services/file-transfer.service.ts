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
  private receivedDataBuffer: Uint8Array[] = [];
  private isPaused = false;
  private incomingFileSize = 0;
  private isReceivingFile = false;
  private currentOffset = 0;

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
      this.logger.log(`Received file offer from ${offer.fromUser}`);
      this.incomingFile$.next({
        fileName: offer.fileName,
        fileSize: offer.fileSize,
        fromUser: offer.fromUser,
      });
    });

    this.webrtcService.fileResponses$.subscribe((response) => {
      if (response.accepted) {
        this.logger.log(`File accepted by ${response.fromUser}`);
        this.startSendingFile(response.fromUser);
      } else {
        this.logger.log(`File declined by ${response.fromUser}`);
        alert('The receiver declined the file transfer.');
      }
    });

    this.webrtcService.bufferedAmountLow$.subscribe(() => {
      if (this.isPaused) {
        this.isPaused = false;
        this.sendNextChunk(this.targetUser);
      }
    });
  }

  public prepareFileForSending(file: File, targetUser: string): void {
    this.fileToSend = file;
    this.targetUser = targetUser;
  }

  public sendFileOffer(targetUser: string): void {
    if (!this.fileToSend) {
      console.error('No file to send.');
      return;
    }
    this.logger.log(`Sending file offer to ${targetUser}`);
    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_OFFER,
      payload: {
        fileName: this.fileToSend.name,
        fileSize: this.fileToSend.size,
      },
    };
    this.webrtcService.sendData(message, targetUser);
  }

  public startSavingFile(): void {
    if (!this.incomingFile$.value) {
      console.error('No incoming file to accept.');
      return;
    }

    const { fromUser, fileSize } = this.incomingFile$.value;
    this.incomingFileSize = fileSize;
    this.isReceivingFile = true;

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT,
      payload: {},
    };

    this.logger.log(`Sending file acceptance to ${fromUser}`);

    this.webrtcService.sendData(message, fromUser);
    this.receivedSize = 0;
    this.receivedDataBuffer = [];
  }

  private async handleDataChunk(data: ArrayBuffer): Promise<void> {
    if (!this.isReceivingFile) {
      this.logger.log(
        'Received data chunk when not expecting a file transfer. Ignoring.'
      );
      return;
    }

    this.receivedDataBuffer.push(new Uint8Array(data));
    this.receivedSize += data.byteLength;
    const fileSize = this.incomingFileSize;

    if (!fileSize) {
      console.error('Invalid file size.');
      return;
    }

    const progress = (this.receivedSize / fileSize) * 100;
    if (isFinite(progress)) {
      this.downloadProgress$.next(parseFloat(progress.toFixed(2)));
    } else {
      console.error('Progress is non-finite');
      return;
    }

    if (this.receivedSize >= fileSize) {
      this.logger.log('File received successfully');

      const totalLength = this.receivedDataBuffer.reduce(
        (acc, curr) => acc + curr.length,
        0
      );
      const combinedArray = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of this.receivedDataBuffer) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }

      const receivedBlob = new Blob([combinedArray]);
      const downloadUrl = URL.createObjectURL(receivedBlob);
      const fileName =
        this.incomingFile$.value?.fileName || 'downloaded_file';

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

  private startSendingFile(targetUser: string): void {
    if (!this.fileToSend) {
      console.error('No file to send.');
      return;
    }
    this.logger.log(`Starting to send file to ${targetUser}`);
    this.currentOffset = 0;
    this.sendNextChunk(targetUser);
  }

  private async sendNextChunk(targetUser: string): Promise<void> {
    if (this.isPaused || !this.fileToSend) return;
    const { fileToSend } = this;
    const dataChannel = this.webrtcService.getDataChannel(targetUser);
    if (!dataChannel) {
      console.error(`Data channel is not available for ${targetUser}`);
      return;
    }

    if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      this.isPaused = true;
      return;
    }

    const start = this.currentOffset;
    const end = Math.min(start + CHUNK_SIZE, fileToSend.size);
    const blob = fileToSend.slice(start, end);

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      if (e.target?.result) {
        const arrayBuffer = e.target.result as ArrayBuffer;
        while (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        this.webrtcService.sendRawData(arrayBuffer, targetUser);
        this.currentOffset = end;

        const progress = (this.currentOffset / fileToSend.size) * 100;

        if (isFinite(progress)) {
          this.uploadProgress$.next(parseFloat(progress.toFixed(2)));
        } else {
          console.error('Upload progress is non-finite');
        }

        if (this.currentOffset < fileToSend.size) {
          this.sendNextChunk(targetUser);
        } else {
          this.logger.log('File sent successfully');
          this.uploadProgress$.next(100);
          this.resetProgressAfterDelay();
          this.fileToSend = null;
          this.currentOffset = 0;
        }
      }
    };

    fileReader.onerror = (error) => {
      console.error('Error reading file chunk:', error);
    };

    fileReader.readAsArrayBuffer(blob);
  }

  private resetProgressAfterDelay(): void {
    setTimeout(() => {
      this.uploadProgress$.next(0);
      this.downloadProgress$.next(0);
    }, 2000);
  }
}

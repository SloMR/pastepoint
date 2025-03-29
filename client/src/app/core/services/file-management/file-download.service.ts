import { Injectable } from '@angular/core';
import { FILE_TRANSFER_MESSAGE_TYPES } from '../../../utils/constants';
import { FileTransferBaseService } from './file-transfer-base.service';
import { WebRTCService } from '../communication/webrtc.service';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class FileDownloadService extends FileTransferBaseService {
  constructor(
    webrtcService: WebRTCService,
    toaster: ToastrService,
    translate: TranslateService,
    logger: NGXLogger
  ) {
    super(webrtcService, toaster, translate, logger);
  }

  public async handleDataChunk(
    fileId: string,
    chunk: ArrayBuffer,
    fromUser: string
  ): Promise<void> {
    const userMap = await this.getIncomingFileTransfers(fromUser);
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

    await this.updateActiveDownloads();

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
        await this.deleteIncomingFileTransfers(fromUser);
      }

      await this.updateActiveDownloads();
    } else {
      this.logger.info(
        'handleDataChunk',
        `FileId=${fileId} chunk received. Progress: ${fileDownload.progress.toFixed(2)}%`
      );
    }
  }

  public async cancelFileDownload(fromUser: string, fileId: string): Promise<void> {
    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (userMap && userMap.has(fileId)) {
      userMap.delete(fileId);
      const key = this.getOrCreateStatusKey(fromUser, fileId);
      await this.deleteFileTransferStatus(key);
      await this.updateActiveDownloads();

      const message = {
        type: FILE_TRANSFER_MESSAGE_TYPES.FILE_CANCEL_DOWNLOAD,
        payload: {
          fileId: fileId,
        },
      };
      this.sendData(message, fromUser);
      this.logger.info('cancelDownload', `Cancel download fromUser=${fromUser}, fileId=${fileId}`);
    }
  }

  public async handleFileUploadCancellation(fromUser: string, fileId: string): Promise<void> {
    this.logger.debug(
      'handleFileUploadCancellation',
      `File upload from ${fromUser} (fileId=${fileId}) was cancelled`
    );

    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (userMap) {
      userMap.delete(fileId);
      if (userMap.size === 0) {
        await this.deleteIncomingFileTransfers(fromUser);
      }
    }

    await this.updateIncomingFileOffers();
    await this.updateActiveDownloads();

    this.toaster.info(
      this.translate.instant('FILE_UPLOAD_CANCELLED'),
      this.translate.instant('CANCELLED')
    );
  }

  public async handleFileDownloadCancellation(fromUser: string, fileId: string): Promise<void> {
    this.logger.debug(
      'handleFileDownloadCancellation',
      `File download from ${fromUser} (fileId=${fileId}) was cancelled.`
    );

    const userMap = await this.getFileTransfers(fromUser);
    if (userMap) {
      userMap.delete(fileId);
      if (userMap.size === 0) {
        await this.deleteFileTransfers(fromUser);
      }
    }

    await this.updateIncomingFileOffers();
    await this.updateActiveDownloads();

    this.toaster.info(
      this.translate.instant('FILE_DOWNLOAD_CANCELLED'),
      this.translate.instant('CANCELLED')
    );
  }
}

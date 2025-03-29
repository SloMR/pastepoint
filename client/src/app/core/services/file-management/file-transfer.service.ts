import { Injectable } from '@angular/core';
import { WebRTCService } from '../communication/webrtc.service';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { IFileTransferService } from '../../interfaces/file-transfer.interface';
import { FileUploadService } from './file-upload.service';
import { FileDownloadService } from './file-download.service';
import { FileOfferService } from './file-offer.service';

@Injectable({
  providedIn: 'root',
})
export class FileTransferService implements IFileTransferService {
  constructor(
    private webrtcService: WebRTCService,
    public translate: TranslateService,
    private logger: NGXLogger,
    private fileUploadService: FileUploadService,
    private fileDownloadService: FileDownloadService,
    private fileOfferService: FileOfferService
  ) {
    this.webrtcService.incomingFileChunk$.subscribe(({ fromUser, fileId, chunk }) => {
      this.fileDownloadService.handleDataChunk(fileId, chunk, fromUser).then(() => {
        this.logger.info('FileTransferService', `File ${fileId} received from ${fromUser}`);
      });
    });

    this.webrtcService.fileOffers$.subscribe((offer) => {
      this.logger.info(
        'constructor',
        `Received file offer from ${offer.fromUser} (fileId=${offer.fileId})`
      );
      this.fileOfferService.receiveFileOffer(offer);
    });

    this.webrtcService.fileResponses$.subscribe((response) => {
      if (!response.fileId) {
        this.logger.error('constructor', 'File response without fileId – cannot proceed.');
        return;
      }

      if (response.accepted) {
        this.logger.info('constructor', `File ${response.fileId} accepted by ${response.fromUser}`);
        this.fileUploadService.startSendingFile(response.fromUser, response.fileId).then(() => {}); // set key
      } else {
        this.logger.warn('constructor', `File ${response.fileId} declined by ${response.fromUser}`);
        this.fileUploadService.declineFileOffer(response.fromUser, response.fileId).then(() => {});
      }
    });

    this.webrtcService.bufferedAmountLow$.subscribe((targetUser) => {
      this.fileUploadService.resumePausedTransfer(targetUser);
    });

    this.webrtcService.fileUploadCancelled$.subscribe(({ fromUser, fileId }) => {
      this.fileDownloadService.handleFileUploadCancellation(fromUser, fileId);
    });

    this.webrtcService.fileDownloadCancelled$.subscribe(({ fromUser, fileId }) => {
      this.fileDownloadService.handleFileDownloadCancellation(fromUser, fileId);
    });
  }

  public get activeUploads$() {
    return this.fileUploadService.activeUploads$;
  }

  public get activeDownloads$() {
    return this.fileDownloadService.activeDownloads$;
  }

  public get incomingFileOffers$() {
    return this.fileOfferService.incomingFileOffers$;
  }

  public prepareFileForSending(file: File, targetUser: string): void {
    this.fileUploadService.prepareFileForSending(file, targetUser);
  }

  public sendAllFileOffers(targetUser: string): void {
    this.fileUploadService.sendAllFileOffers(targetUser);
  }

  public acceptFileOffer(fromUser: string, fileId: string): void {
    this.fileOfferService.acceptFileOffer(fromUser, fileId);
  }

  public declineFileOffer(fromUser: string, fileId: string): void {
    this.fileOfferService.declineFileOffer(fromUser, fileId);
  }

  public cancelFileUpload(targetUser: string, fileId: string): void {
    this.fileUploadService.cancelFileUpload(targetUser, fileId);
  }

  public cancelFileDownload(fromUser: string, fileId: string): void {
    this.fileDownloadService.cancelFileDownload(fromUser, fileId);
  }
}

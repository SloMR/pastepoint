import { Injectable } from '@angular/core';
import { WebRTCService } from '../communication/webrtc.service';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { IFileTransferService } from '../../interfaces/file-transfer.interface';
import { FileUploadService } from './file-upload.service';
import { FileDownloadService } from './file-download.service';
import { FileOfferService } from './file-offer.service';
import { FileTransferBaseService } from './file-transfer-base.service';

@Injectable({
  providedIn: 'root',
})
export class FileTransferService implements IFileTransferService {
  // =============== Constructor ===============
  constructor(
    private webrtcService: WebRTCService,
    public translate: TranslateService,
    private logger: NGXLogger,
    private fileUploadService: FileUploadService,
    private fileDownloadService: FileDownloadService,
    private fileOfferService: FileOfferService
  ) {
    this.webrtcService.incomingFileChunk$.subscribe(async ({ fromUser, fileId, chunk }) => {
      await this.fileDownloadService.handleDataChunk(fileId, chunk, fromUser);
      this.logger.debug('FileTransferService', `File download ${fileId} received from ${fromUser}`);
    });

    this.webrtcService.fileOffers$.subscribe(async (offer) => {
      this.logger.debug(
        'constructor',
        `Received file offer from ${offer.fromUser} (fileId=${offer.fileId})`
      );
      await this.fileOfferService.receiveFileOffer(offer);
      this.logger.debug('FileTransferService', `File offer received from ${offer.fromUser}`);
    });

    this.webrtcService.fileResponses$.subscribe(async (response) => {
      if (!response.fileId) {
        this.logger.error('constructor', 'File response without fileId – cannot proceed.');
        return;
      }

      if (response.accepted) {
        this.logger.info('constructor', `File ${response.fileId} accepted by ${response.fromUser}`);
        await this.fileUploadService.startSendingFile(response.fromUser, response.fileId);
        this.logger.debug(
          'FileTransferService',
          `File ${response.fileId} started sending to ${response.fromUser}`
        );
      } else {
        this.logger.warn('constructor', `File ${response.fileId} declined by ${response.fromUser}`);
        await this.fileUploadService.declineFileOffer(response.fromUser, response.fileId);
        this.logger.debug(
          'FileTransferService',
          `File ${response.fileId} declined by ${response.fromUser}`
        );
      }
    });

    this.webrtcService.bufferedAmountLow$.subscribe((targetUser) => {
      this.fileUploadService.resumePausedTransfer(targetUser);
      this.logger.debug('FileTransferService', `Paused transfer resumed for ${targetUser}`);
    });

    this.webrtcService.fileUploadCancelled$.subscribe(async ({ fromUser, fileId }) => {
      await this.fileDownloadService.handleFileUploadCancellation(fromUser, fileId);
      this.logger.debug('FileTransferService', `File upload ${fileId} cancelled by ${fromUser}`);
    });

    this.webrtcService.fileDownloadCancelled$.subscribe(async ({ fromUser, fileId }) => {
      await this.fileDownloadService.handleFileDownloadCancellation(fromUser, fileId);
      this.logger.debug('FileTransferService', `File download ${fileId} cancelled by ${fromUser}`);
    });
  }

  // =============== Properties ===============
  /**
   * Get active file uploads in progress
   */
  public get activeUploads$() {
    return FileTransferBaseService.activeUploads$;
  }

  /**
   * Get active file downloads in progress
   */
  public get activeDownloads$() {
    return FileTransferBaseService.activeDownloads$;
  }

  /**
   * Get incoming file offers awaiting user response
   */
  public get incomingFileOffers$() {
    return FileTransferBaseService.incomingFileOffers$;
  }

  // =============== Upload Methods ===============
  /**
   * Prepares a file for sending to a target user
   */
  public async prepareFileForSending(file: File, targetUser: string): Promise<void> {
    await this.fileUploadService.prepareFileForSending(file, targetUser);
    this.logger.debug('FileTransferService', `File upload prepared for sending to ${targetUser}`);
  }

  /**
   * Sends all prepared file offers to a target user
   */
  public async sendAllFileOffers(targetUser: string): Promise<void> {
    await this.fileUploadService.sendAllFileOffers(targetUser);
    this.logger.debug('FileTransferService', `All file offers sent to ${targetUser}`);
  }

  /**
   * Cancels an ongoing file upload to a target user
   */
  public async cancelFileUpload(targetUser: string, fileId: string): Promise<void> {
    await this.fileUploadService.cancelFileUpload(targetUser, fileId);
    this.logger.debug('cancelFileUpload', `File upload ${fileId} cancelled by ${targetUser}`);
  }

  // =============== Download Methods ===============
  /**
   * Cancels an ongoing file download from a user
   */
  public async cancelFileDownload(fromUser: string, fileId: string): Promise<void> {
    await this.fileDownloadService.cancelFileDownload(fromUser, fileId);
    this.logger.debug('FileTransferService', `File download ${fileId} cancelled by ${fromUser}`);
  }

  // =============== File Offer Methods ===============
  /**
   * Accepts a file offer from a user
   */
  public async acceptFileOffer(fromUser: string, fileId: string): Promise<void> {
    await this.fileOfferService.acceptFileOffer(fromUser, fileId);
    this.logger.debug('FileTransferService', `File offer ${fileId} accepted by ${fromUser}`);
  }

  /**
   * Declines a file offer from a user
   */
  public async declineFileOffer(fromUser: string, fileId: string): Promise<void> {
    await this.fileOfferService.declineFileOffer(fromUser, fileId);
    this.logger.debug('FileTransferService', `File offer ${fileId} declined by ${fromUser}`);
  }
}

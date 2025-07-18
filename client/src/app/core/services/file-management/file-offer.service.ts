import { Injectable, NgZone } from '@angular/core';
import { FileDownload, FILE_TRANSFER_MESSAGE_TYPES } from '../../../utils/constants';
import { FileTransferBaseService } from './file-transfer-base.service';
import { WebRTCService } from '../communication/webrtc.service';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { HotToastService } from '@ngneat/hot-toast';

@Injectable({
  providedIn: 'root',
})
export class FileOfferService extends FileTransferBaseService {
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

  // =============== File Offer Methods ===============
  /**
   * Receives and processes a file offer from another user
   */
  public async receiveFileOffer(offer: {
    fileId: string;
    fileName: string;
    fileSize: number;
    fromUser: string;
  }): Promise<void> {
    const { fromUser, fileId, fileName, fileSize } = offer;
    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (!userMap) {
      await this.setIncomingFileTransfers(fromUser, new Map<string, FileDownload>());
    }

    const fileTransfers = await this.getIncomingFileTransfers(fromUser);
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
      await this.setIncomingFileTransfers(fromUser, fileTransfers);
      await this.updateIncomingFileOffers();
    } else {
      this.logger.error('receiveFileOffer', `No file transfers map for user: ${fromUser}`);
      return;
    }
  }

  /**
   * Accepts a file offer and notifies the sender
   */
  public async acceptFileOffer(fromUser: string, fileId: string): Promise<void> {
    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (!userMap) {
      this.logger.error('acceptFileOffer', `No incoming file map found from user: ${fromUser}`);
      return;
    }

    const fileDownload = userMap.get(fileId);
    if (!fileDownload) {
      this.logger.error('acceptFileOffer', `No file with id=${fileId} from ${fromUser} to accept`);
      return;
    }

    fileDownload.isAccepted = true;
    await this.setIncomingFileTransfers(fromUser, userMap);
    await this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT,
      payload: {
        fileId: fileId,
      },
    };

    this.logger.debug(
      'acceptFileOffer',
      `Sending file acceptance to ${fromUser} for fileId=${fileId}`
    );
    this.sendData(message, fromUser);
    await this.updateActiveDownloads();
  }

  /**
   * Declines a file offer and notifies the sender
   */
  public async declineFileOffer(fromUser: string, fileId: string): Promise<void> {
    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (userMap) {
      userMap.delete(fileId);
      if (userMap.size === 0) {
        await this.deleteIncomingFileTransfers(fromUser);
      }
    }
    await this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_DECLINE,
      payload: {
        fileId: fileId,
      },
    };
    this.sendData(message, fromUser);
    this.toaster.info(this.translate.instant('FILE_TRANSFER_DECLINED'));
  }
}

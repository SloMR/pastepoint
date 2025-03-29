import { Injectable } from '@angular/core';
import { FileDownload, FILE_TRANSFER_MESSAGE_TYPES } from '../../../utils/constants';
import { FileTransferBaseService } from './file-transfer-base.service';
import { WebRTCService } from '../communication/webrtc.service';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class FileOfferService extends FileTransferBaseService {
  constructor(
    webrtcService: WebRTCService,
    toaster: ToastrService,
    translate: TranslateService,
    logger: NGXLogger
  ) {
    super(webrtcService, toaster, translate, logger);
  }

  public receiveFileOffer(offer: {
    fileId: string;
    fileName: string;
    fileSize: number;
    fromUser: string;
  }): void {
    const { fromUser, fileId, fileName, fileSize } = offer;
    if (!FileTransferBaseService.incomingFileTransfers.has(fromUser)) {
      FileTransferBaseService.incomingFileTransfers.set(fromUser, new Map<string, FileDownload>());
    }

    const fileTransfers = FileTransferBaseService.incomingFileTransfers.get(fromUser);
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

  public acceptFileOffer(fromUser: string, fileId: string): void {
    const userMap = FileTransferBaseService.incomingFileTransfers.get(fromUser);
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
    this.updateIncomingFileOffers();

    const message = {
      type: FILE_TRANSFER_MESSAGE_TYPES.FILE_ACCEPT,
      payload: {
        fileId: fileId,
      },
    };

    this.logger.info(
      'acceptFileOffer',
      `Sending file acceptance to ${fromUser} for fileId=${fileId}`
    );
    this.sendData(message, fromUser);
    this.updateActiveDownloads();
  }

  public declineFileOffer(fromUser: string, fileId: string): void {
    const userMap = FileTransferBaseService.incomingFileTransfers.get(fromUser);
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
    this.sendData(message, fromUser);
    this.toaster.info(
      this.translate.instant('FILE_TRANSFER_DECLINED'),
      this.translate.instant('DECLINED')
    );
  }
}

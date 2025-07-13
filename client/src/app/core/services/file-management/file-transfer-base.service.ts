import { Inject, Injectable } from '@angular/core';
import { WebRTCService } from '../communication/webrtc.service';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { v4 as uuidv4 } from 'uuid';
import { FileDownload, FileUpload, FileTransferStatus } from '../../../utils/constants';
import { BehaviorSubject } from 'rxjs';
import { Mutex } from 'async-mutex';
import { DataChannelMessage } from '../../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class FileTransferBaseService {
  // =============== Static Properties ===============
  // Make BehaviorSubjects static so they're shared across all services
  public static activeUploads$ = new BehaviorSubject<FileUpload[]>([]);
  private static fileTransfers = new Map<string, Map<string, FileUpload>>();
  private static fileTransferStatus = new Map<string, FileTransferStatus>();

  public static activeDownloads$ = new BehaviorSubject<FileDownload[]>([]);
  public static incomingFileOffers$ = new BehaviorSubject<FileDownload[]>([]);
  private static incomingFileTransfers = new Map<string, Map<string, FileDownload>>();

  // =============== Mutex Locks ===============
  // Mutex instances for each shared resource
  private static fileTransfersMutex = new Mutex();
  private static fileTransferStatusMutex = new Mutex();
  private static incomingFileTransfersMutex = new Mutex();
  private static activeUploadsMutex = new Mutex();
  private static activeDownloadsMutex = new Mutex();
  private static incomingFileOffersMutex = new Mutex();

  // =============== Constructor ===============
  constructor(
    protected webrtcService: WebRTCService,
    protected toaster: ToastrService,
    @Inject(TranslateService) protected translate: TranslateService,
    protected logger: NGXLogger
  ) {}

  // =============== Utility Methods ===============
  /**
   * Generates a unique file ID using UUID and timestamp
   */
  protected generateFileId(): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    return `${uuid}-${timestamp}`;
  }

  /**
   * Creates a unique status key for a file transfer
   */
  protected getOrCreateStatusKey(user: string, fileId: string): string {
    return `${user}-${fileId}`;
  }

  // =============== WebRTC Communication Methods ===============
  /**
   * Sends a message to a target user
   */
  protected sendData(message: DataChannelMessage, targetUser: string): void {
    this.webrtcService.sendData(message, targetUser);
  }

  /**
   * Gets the data channel for a target user
   */
  protected getDataChannel(targetUser: string): RTCDataChannel | null {
    return this.webrtcService.getDataChannel(targetUser);
  }

  /**
   * Sends raw binary data to a target user
   */
  protected sendRawData(data: ArrayBuffer, targetUser: string): boolean {
    return this.webrtcService.sendRawData(data, targetUser);
  }

  /**
   * Initiates WebRTC connection with a target user
   */
  protected initiateConnection(targetUser: string): void {
    this.webrtcService.initiateConnection(targetUser);
  }

  // =============== State Update Methods ===============
  /**
   * Updates the active uploads list
   */
  protected async updateActiveUploads(): Promise<void> {
    const allUploads: FileUpload[] = [];

    await FileTransferBaseService.fileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.fileTransfers.forEach((mapOfUploads) => {
        mapOfUploads.forEach((fileUpload) => {
          allUploads.push(fileUpload);
        });
      });
    });

    await FileTransferBaseService.activeUploadsMutex.runExclusive(() => {
      FileTransferBaseService.activeUploads$.next(allUploads);
    });

    this.logger.debug('updateActiveUploads', `Updated active uploads, count: ${allUploads.length}`);
  }

  /**
   * Updates the active downloads list
   */
  protected async updateActiveDownloads(): Promise<void> {
    const allDownloads: FileDownload[] = [];

    await FileTransferBaseService.incomingFileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.incomingFileTransfers.forEach((mapOfDownloads) => {
        mapOfDownloads.forEach((fileDownload) => {
          if (fileDownload.isAccepted) {
            allDownloads.push(fileDownload);
          }
        });
      });
    });

    await FileTransferBaseService.activeDownloadsMutex.runExclusive(() => {
      FileTransferBaseService.activeDownloads$.next(allDownloads);
    });

    this.logger.debug(
      'updateActiveDownloads',
      `Updated active downloads, count: ${allDownloads.length}`
    );
  }

  /**
   * Updates the incoming file offers list
   */
  protected async updateIncomingFileOffers(): Promise<void> {
    const allOffers: FileDownload[] = [];

    await FileTransferBaseService.incomingFileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.incomingFileTransfers.forEach((mapOfDownloads) => {
        mapOfDownloads.forEach((fileDownload) => {
          if (!fileDownload.isAccepted) {
            allOffers.push(fileDownload);
          }
        });
      });
    });

    await FileTransferBaseService.incomingFileOffersMutex.runExclusive(() => {
      FileTransferBaseService.incomingFileOffers$.next(allOffers);
    });

    this.logger.debug(
      'updateIncomingFileOffers',
      `Updated incoming offers, count: ${allOffers.length}`
    );
  }

  // =============== File Transfers Data Access Methods ===============
  /**
   * Gets file transfer data for a specific user
   */
  protected async getFileTransfers(user: string): Promise<Map<string, FileUpload> | undefined> {
    return await FileTransferBaseService.fileTransfersMutex.runExclusive(() => {
      return FileTransferBaseService.fileTransfers.get(user);
    });
  }

  /**
   * Sets file transfer data for a specific user
   */
  protected async setFileTransfers(
    user: string,
    transfers: Map<string, FileUpload>
  ): Promise<void> {
    await FileTransferBaseService.fileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.fileTransfers.set(user, transfers);
    });
  }

  /**
   * Gets file transfer status for a specific key
   */
  protected async getFileTransferStatus(key: string): Promise<FileTransferStatus | undefined> {
    return await FileTransferBaseService.fileTransferStatusMutex.runExclusive(() => {
      return FileTransferBaseService.fileTransferStatus.get(key);
    });
  }

  /**
   * Sets file transfer status for a specific key
   */
  protected async setFileTransferStatus(key: string, status: FileTransferStatus): Promise<void> {
    await FileTransferBaseService.fileTransferStatusMutex.runExclusive(() => {
      FileTransferBaseService.fileTransferStatus.set(key, status);
    });
  }

  /**
   * Gets incoming file transfers for a specific user
   */
  protected async getIncomingFileTransfers(
    user: string
  ): Promise<Map<string, FileDownload> | undefined> {
    return await FileTransferBaseService.incomingFileTransfersMutex.runExclusive(() => {
      return FileTransferBaseService.incomingFileTransfers.get(user);
    });
  }

  /**
   * Sets incoming file transfers for a specific user
   */
  protected async setIncomingFileTransfers(
    user: string,
    transfers: Map<string, FileDownload>
  ): Promise<void> {
    await FileTransferBaseService.incomingFileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.incomingFileTransfers.set(user, transfers);
    });
  }

  // =============== Delete Methods ===============
  /**
   * Deletes incoming file transfers for a specific user
   */
  protected async deleteIncomingFileTransfers(user: string): Promise<void> {
    await FileTransferBaseService.incomingFileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.incomingFileTransfers.delete(user);
    });
  }

  /**
   * Deletes file transfers for a specific user
   */
  protected async deleteFileTransfers(user: string): Promise<void> {
    await FileTransferBaseService.fileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.fileTransfers.delete(user);
    });
  }

  /**
   * Deletes file transfer status for a specific key
   */
  protected async deleteFileTransferStatus(key: string): Promise<void> {
    await FileTransferBaseService.fileTransferStatusMutex.runExclusive(() => {
      FileTransferBaseService.fileTransferStatus.delete(key);
    });
  }

  /**
   * Gets all file transfer statuses
   */
  protected async getFileTransferStatuses(): Promise<string[]> {
    return await FileTransferBaseService.fileTransferStatusMutex.runExclusive(() => {
      return Array.from(FileTransferBaseService.fileTransferStatus.values());
    });
  }

  /**
   * Clears all file transfers data
   */
  protected async clearFileTransfers(): Promise<void> {
    await FileTransferBaseService.fileTransfersMutex.runExclusive(() => {
      FileTransferBaseService.fileTransfers.clear();
    });
    await FileTransferBaseService.fileTransferStatusMutex.runExclusive(() => {
      FileTransferBaseService.fileTransferStatus.clear();
    });
  }
}

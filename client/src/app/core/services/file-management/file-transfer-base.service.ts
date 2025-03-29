import { Injectable } from '@angular/core';
import { WebRTCService } from '../communication/webrtc.service';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { v4 as uuidv4 } from 'uuid';
import { FileDownload, FileUpload } from '../../../utils/constants';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FileTransferBaseService {
  public activeUploads$ = new BehaviorSubject<FileUpload[]>([]);
  protected static fileTransfers = new Map<string, Map<string, FileUpload>>();
  protected static fileTransferStatus = new Map<string, string>();

  public activeDownloads$ = new BehaviorSubject<FileDownload[]>([]);
  public incomingFileOffers$ = new BehaviorSubject<FileDownload[]>([]);
  protected static incomingFileTransfers = new Map<string, Map<string, FileDownload>>();

  constructor(
    protected webrtcService: WebRTCService,
    protected toaster: ToastrService,
    public translate: TranslateService,
    protected logger: NGXLogger
  ) {}

  protected generateFileId(): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    return `${uuid}-${timestamp}`;
  }

  protected getOrCreateStatusKey(user: string, fileId: string): string {
    return `${user}-${fileId}`;
  }

  protected sendData(message: any, targetUser: string): void {
    this.webrtcService.sendData(message, targetUser);
  }

  protected getDataChannel(targetUser: string): RTCDataChannel | null {
    return this.webrtcService.getDataChannel(targetUser);
  }

  protected sendRawData(data: ArrayBuffer, targetUser: string): boolean {
    return this.webrtcService.sendRawData(data, targetUser);
  }

  protected initiateConnection(targetUser: string): void {
    this.webrtcService.initiateConnection(targetUser);
  }

  protected updateActiveUploads(): void {
    const allUploads: FileUpload[] = [];
    FileTransferBaseService.fileTransfers.forEach((mapOfUploads) => {
      mapOfUploads.forEach((fileUpload) => {
        allUploads.push(fileUpload);
      });
    });
    this.activeUploads$.next(allUploads);
  }

  protected updateActiveDownloads(): void {
    const allDownloads: FileDownload[] = [];
    FileTransferBaseService.incomingFileTransfers.forEach((mapOfDownloads) => {
      mapOfDownloads.forEach((fileDownload) => {
        if (fileDownload.isAccepted) {
          allDownloads.push(fileDownload);
        }
      });
    });
    this.activeDownloads$.next(allDownloads);
  }

  protected updateIncomingFileOffers(): void {
    const allOffers: FileDownload[] = [];
    FileTransferBaseService.incomingFileTransfers.forEach((mapOfDownloads) => {
      mapOfDownloads.forEach((fileDownload) => {
        if (!fileDownload.isAccepted) {
          allOffers.push(fileDownload);
        }
      });
    });
    this.incomingFileOffers$.next(allOffers);
  }
}

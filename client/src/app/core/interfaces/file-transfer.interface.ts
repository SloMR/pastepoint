import { BehaviorSubject } from 'rxjs';
import { FileDownload, FileUpload } from '../../utils/constants';

export interface IFileTransferService {
  activeUploads$: BehaviorSubject<FileUpload[]>;
  activeDownloads$: BehaviorSubject<FileDownload[]>;
  incomingFileOffers$: BehaviorSubject<FileDownload[]>;

  prepareFileForSending(file: File, targetUser: string): void;
  sendAllFileOffers(targetUser: string): void;
  cancelFileUpload(targetUser: string, fileId: string): void;
  cancelFileDownload(fromUser: string, fileId: string): void;
  acceptFileOffer(fromUser: string, fileId: string): void;
  declineFileOffer(fromUser: string, fileId: string): void;
}

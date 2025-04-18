import { BehaviorSubject } from 'rxjs';
import { FileDownload, FileUpload } from '../../utils/constants';

export interface IFileTransferService {
  activeUploads$: BehaviorSubject<FileUpload[]>;
  activeDownloads$: BehaviorSubject<FileDownload[]>;
  incomingFileOffers$: BehaviorSubject<FileDownload[]>;

  prepareFileForSending(file: File, targetUser: string): Promise<void>;
  sendAllFileOffers(targetUser: string): Promise<void>;
  cancelFileUpload(targetUser: string, fileId: string): Promise<void>;
  cancelFileDownload(fromUser: string, fileId: string): Promise<void>;
  acceptFileOffer(fromUser: string, fileId: string): Promise<void>;
  declineFileOffer(fromUser: string, fileId: string): Promise<void>;
}

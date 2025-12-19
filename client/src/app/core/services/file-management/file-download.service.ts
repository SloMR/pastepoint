import { Injectable, NgZone } from '@angular/core';
import { FILE_TRANSFER_MESSAGE_TYPES, FileDownload } from '../../../utils/constants';
import { FileTransferBaseService } from './file-transfer-base.service';
import { WebRTCService } from '../communication/webrtc.service';
import { TranslateService } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { HotToastService } from '@ngneat/hot-toast';
import { PreviewService } from '../../services/ui/preview.service';
import { calculateBufferHash } from '../../../utils/chunk-protocol';

@Injectable({
  providedIn: 'root',
})
export class FileDownloadService extends FileTransferBaseService {
  // =============== Constructor ===============
  constructor(
    webrtcService: WebRTCService,
    toaster: HotToastService,
    translate: TranslateService,
    logger: NGXLogger,
    ngZone: NgZone,
    private previewService: PreviewService
  ) {
    super(webrtcService, toaster, translate, logger, ngZone);
  }

  // =============== Data Handling Methods ===============
  /**
   * Handles incoming file data chunks and assembles the file.
   * Uses chunk index for ordered assembly, preventing corruption from out-of-order delivery.
   * Validates chunk integrity via CRC32 checksum.
   */
  public async handleDataChunk(
    fileId: string,
    chunk: ArrayBuffer,
    fromUser: string,
    chunkIndex: number,
    totalChunks: number,
    isValid: boolean = true
  ): Promise<void> {
    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (!userMap) {
      this.logger.warn(
        'handleDataChunk',
        `Discarding chunk - no incomingFileTransfers map for ${fromUser}`
      );
      return;
    }

    const fileDownload = userMap.get(fileId);
    if (!fileDownload) {
      this.logger.error(
        'handleDataChunk',
        `Chunk ${chunkIndex}/${totalChunks} - fileId ${fileId.substring(0, 8)}... NOT FOUND in map`
      );
      return;
    }

    if (!fileDownload.isAccepted) {
      this.logger.error(
        'handleDataChunk',
        `Chunk ${chunkIndex}/${totalChunks} - fileId ${fileId.substring(0, 8)}... NOT YET ACCEPTED`
      );
      return;
    }

    // Verify chunk integrity (CRC32 checksum)
    if (!isValid) {
      this.logger.error(
        'handleDataChunk',
        `Chunk ${chunkIndex} for ${fileId} failed CRC32 validation - data corrupted!`
      );
      this.toaster.error(
        this.translate.instant('CHUNK_INTEGRITY_ERROR', {
          chunkIndex: chunkIndex + 1,
          totalChunks,
        })
      );
      return;
    }

    // Initialize totalChunks if not set
    if (fileDownload.totalChunks === 0) {
      fileDownload.totalChunks = totalChunks;
    }

    // Check for duplicate chunk
    if (fileDownload.receivedChunks.has(chunkIndex)) {
      this.logger.warn('handleDataChunk', `Duplicate chunk ${chunkIndex} for ${fileId}, ignoring`);
      return;
    }

    // Store chunk by index for ordered assembly
    fileDownload.receivedChunks.set(chunkIndex, new Uint8Array(chunk));
    fileDownload.receivedSize += chunk.byteLength;

    const progress = (fileDownload.receivedChunks.size / totalChunks) * 100;
    fileDownload.progress = parseFloat(progress.toFixed(2));

    // Log first chunk processed
    if (chunkIndex === 0) {
      this.logger.info(
        'handleDataChunk',
        `First chunk processed for ${fileId.substring(0, 8)}... (${chunk.byteLength} bytes)`
      );
    }

    await this.updateActiveDownloads();

    // Check if all chunks received
    if (fileDownload.receivedChunks.size >= totalChunks) {
      this.logger.info('handleDataChunk', `All chunks received for fileId=${fileId}`);
      await this.assembleAndDownloadFile(fileDownload, userMap, fromUser);
    } else {
      this.logger.debug(
        'handleDataChunk',
        `${fileId}: ${fileDownload.receivedChunks.size}/${totalChunks} chunks`
      );
    }
  }

  /**
   * Assembles chunks in order, verifies file integrity, and triggers download
   */
  private async assembleAndDownloadFile(
    fileDownload: FileDownload,
    userMap: Map<string, FileDownload>,
    fromUser: string
  ): Promise<void> {
    // Assemble chunks in order
    const totalLength = Array.from(fileDownload.receivedChunks.values()).reduce(
      (acc, chunk) => acc + chunk.length,
      0
    );
    const combinedArray = new Uint8Array(totalLength);

    let offset = 0;
    let missingChunks = 0;
    for (let i = 0; i < fileDownload.totalChunks; i++) {
      const chunk = fileDownload.receivedChunks.get(i);
      if (chunk) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      } else {
        this.logger.error(
          'assembleAndDownloadFile',
          `Missing chunk ${i} for ${fileDownload.fileId}`
        );
        missingChunks++;
      }
    }

    if (missingChunks > 0) {
      this.logger.error(
        'assembleAndDownloadFile',
        `${missingChunks} chunks missing, file may be corrupted`
      );
      this.toaster.error(this.translate.instant('FILE_INCOMPLETE_ERROR', { count: missingChunks }));
    }

    // Verify full file integrity via SHA-256 hash
    if (fileDownload.expectedHash) {
      try {
        const actualHash = await calculateBufferHash(combinedArray.buffer);
        if (actualHash !== fileDownload.expectedHash) {
          this.logger.error(
            'assembleAndDownloadFile',
            `Hash mismatch for ${fileDownload.fileId}! Expected: ${fileDownload.expectedHash.substring(0, 16)}..., Got: ${actualHash.substring(0, 16)}...`
          );
          this.toaster.error(this.translate.instant('FILE_INTEGRITY_ERROR'));
          // Still allow download but warn user
        } else {
          this.logger.info(
            'assembleAndDownloadFile',
            `File integrity verified for ${fileDownload.fileId} ✓`
          );
        }
      } catch (e) {
        this.logger.warn('assembleAndDownloadFile', `Failed to verify file hash: ${e}`);
      }
    }

    const lowerName = (fileDownload.fileName || '').toLowerCase();
    const ext = lowerName.split('.').pop() || '';
    let blobType = '';
    if (ext === 'pdf') {
      blobType = 'application/pdf';
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      blobType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    }

    const receivedBlob = new Blob([combinedArray], { type: blobType || undefined });
    const downloadUrl = URL.createObjectURL(receivedBlob);
    const fileName = fileDownload.fileName || 'downloaded_file';

    // Update preview after completion
    try {
      if (blobType === 'application/pdf') {
        if (!fileDownload.previewDataUrl) {
          const thumb = await this.previewService.createPdfThumbnailFromBytes(combinedArray);
          if (thumb) {
            fileDownload.previewDataUrl = thumb;
            fileDownload.previewMime = 'image/png';
          }
        } else {
          fileDownload.previewMime = 'image/png';
        }
      } else if (blobType.startsWith('image/')) {
        fileDownload.previewMime = blobType;
        fileDownload.previewDataUrl = downloadUrl;
      }
      await this.updateActiveDownloads();
      await this.updateIncomingFileOffers();
    } catch {
      this.logger.warn(
        'assembleAndDownloadFile',
        `Failed to generate preview for ${fileDownload.fileId}`
      );
    }

    // Trigger download
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    this.toaster.success(this.translate.instant('FILE_DOWNLOAD_COMPLETED', { fileName }));

    // Cleanup
    userMap.delete(fileDownload.fileId);
    if (userMap.size === 0) {
      await this.deleteIncomingFileTransfers(fromUser);
    }

    await this.updateActiveDownloads();
  }

  // =============== Cancellation Methods ===============
  /**
   * Cancels an active file download and notifies the sender
   */
  public async cancelFileDownload(fromUser: string, fileId: string): Promise<void> {
    const userMap = await this.getIncomingFileTransfers(fromUser);
    if (userMap?.has(fileId)) {
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

  /**
   * Handles file upload cancellation from the sender
   */
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

    this.toaster.info(this.translate.instant('FILE_UPLOAD_CANCELLED'));
  }

  /**
   * Handles file download cancellation notification
   */
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

    this.toaster.info(this.translate.instant('FILE_DOWNLOAD_CANCELLED'));
  }
}

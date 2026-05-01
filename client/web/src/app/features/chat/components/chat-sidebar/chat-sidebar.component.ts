import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';

import { FileDownload, FileUpload } from '../../../../utils/constants';

@Component({
  selector: 'app-chat-sidebar',
  imports: [CommonModule, DecimalPipe, NgOptimizedImage, RouterLink, TranslateModule],
  templateUrl: './chat-sidebar.component.html',
  styleUrl: './chat-sidebar.component.css',
})
export class ChatSidebarComponent {
  @Input() rooms: string[] = [];
  @Input() members: string[] = [];
  @Input() currentRoom = '';
  @Input() sessionCode = '';
  @Input() activeUploads: FileUpload[] = [];
  @Input() activeDownloads: FileDownload[] = [];
  @Input() memberConnectionStatus: Map<string, boolean> = new Map();
  @Input() isRTL = false;
  @Input() isDarkMode = false;
  @Input() isMenuOpen = false;
  @Input() skipDrawerAnim = false;
  @Input() currentUser: string | null = null;
  @Input() appVersion = '';

  @Output() isMenuOpenChange = new EventEmitter<boolean>();

  @Output() joinRoomRequested = new EventEmitter<string>();
  @Output() createRoomRequested = new EventEmitter<void>();
  @Output() copySessionCodeRequested = new EventEmitter<void>();
  @Output() qrCodeRequested = new EventEmitter<void>();
  @Output() createPrivateSessionRequested = new EventEmitter<void>();
  @Output() joinPrivateSessionRequested = new EventEmitter<void>();
  @Output() endSessionRequested = new EventEmitter<void>();
  @Output() filePickerRequested = new EventEmitter<string>();
  @Output() cancelUploadRequested = new EventEmitter<FileUpload>();
  @Output() cancelDownloadRequested = new EventEmitter<FileDownload>();

  private logger = inject(NGXLogger);

  protected isConnectedToMember(member: string): boolean {
    return this.memberConnectionStatus.get(member) ?? false;
  }

  protected ProgressValue(progress: number, type: 'upload' | 'download', fileId: string): number {
    const clampedProgress = Math.min(100, Math.max(0, progress));

    if (progress !== clampedProgress) {
      this.logger.warn(
        'ProgressValue',
        `Progress out of range for ${type} ${fileId}: ${progress} -> ${clampedProgress}`
      );
    }

    if (clampedProgress % 10 < 2) {
      this.logger.debug(
        'ProgressValue',
        `${type.charAt(0).toUpperCase() + type.slice(1)} progress ${fileId}: ${clampedProgress.toFixed(2)}%`
      );
    }

    return clampedProgress;
  }

  protected getProgressBarWidth(
    progress: number,
    type: 'upload' | 'download' = 'upload',
    fileId: string = 'unknown'
  ): string {
    const safeProgress = this.ProgressValue(progress, type, fileId);
    return `${safeProgress}%`;
  }

  protected truncateFilename(filename: string, maxLength: number = 30): string {
    if (filename.length <= maxLength) {
      return filename;
    }

    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return filename.slice(0, maxLength) + '...';
    }

    const extension = filename.slice(lastDotIndex);
    const baseName = filename.slice(0, lastDotIndex);
    const availableLength = maxLength - extension.length - 3;

    if (availableLength <= 0) {
      return filename.slice(0, maxLength) + '...';
    }

    return baseName.slice(0, availableLength) + '...' + extension;
  }
}

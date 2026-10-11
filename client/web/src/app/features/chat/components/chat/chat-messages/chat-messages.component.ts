import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { ChatMessage, ChatMessageType, FileTransferStatus } from '../../../../../utils/constants';
import { FileSizePipe } from '../../../../../utils/file-size.pipe';
import { LinkifyPipe } from '../../../../../utils/linkify.pipe';
import { middleTruncateFilename as middleTruncateFilenameUtil } from '../../../../../utils/filename.util';
import { avatarFor } from '../../../../../utils/avatar.util';
import { MessageActionsComponent } from '../message-actions/message-actions.component';
import { BlurredPreviewComponent } from '../blurred-preview/blurred-preview.component';

@Component({
  selector: 'app-chat-messages',
  imports: [
    CommonModule,
    DatePipe,
    FileSizePipe,
    LinkifyPipe,
    TranslatePipe,
    MessageActionsComponent,
    BlurredPreviewComponent,
  ],
  providers: [FileSizePipe],
  templateUrl: './chat-messages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chat-messages.component.css',
})
export class ChatMessagesComponent {
  @Input() messages: ChatMessage[] = [];
  @Input() isRTL = false;
  @Input() isDarkMode = false;
  @Input() currentUser: string | null = null;

  @Output() acceptFile = new EventEmitter<ChatMessage>();
  @Output() declineFile = new EventEmitter<ChatMessage>();
  @Output() blockRequested = new EventEmitter<string>();
  @Output() reportRequested = new EventEmitter<ChatMessage>();
  @Output() copyRequested = new EventEmitter<ChatMessage>();

  @ViewChild('messageContainer') messageContainer!: ElementRef;

  protected readonly ChatMessageType = ChatMessageType;
  protected readonly FileTransferStatus = FileTransferStatus;
  private readonly revealedPreviews = new Set<string>();

  protected isPreviewRevealed(msg: ChatMessage): boolean {
    const id = msg.fileTransfer?.fileId;
    return id ? this.revealedPreviews.has(id) : false;
  }

  protected revealPreview(msg: ChatMessage): void {
    const id = msg.fileTransfer?.fileId;
    if (id) {
      this.revealedPreviews.add(id);
    }
  }

  trackMessage(index: number, message: ChatMessage): string {
    if (message.type === ChatMessageType.ATTACHMENT && message.fileTransfer?.fileId) {
      return `att-${message.fileTransfer.fileId}`;
    }

    const ts =
      message.timestamp instanceof Date ? message.timestamp.getTime() : `${message.timestamp}`;
    return `${message.from}-${ts}`;
  }

  isMyMessage(msg: ChatMessage): boolean {
    return msg.isMine === true;
  }

  protected avatarFor(msg: ChatMessage): string {
    return avatarFor(msg.from, this.isMyMessage(msg));
  }

  protected middleTruncateFilename(filename: string, maxLength = 30): string {
    return middleTruncateFilenameUtil(filename, maxLength);
  }
}

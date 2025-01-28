import {
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  AfterViewInit,
  ViewChild,
  ElementRef,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  DatePipe,
  DecimalPipe,
  isPlatformBrowser,
  NgForOf,
  NgIf,
  NgOptimizedImage,
  NgStyle,
  SlicePipe,
  UpperCasePipe,
} from '@angular/common';

import { ThemeService } from '../../core/services/theme.service';
import { ChatService } from '../../core/services/chat.service';
import { RoomService } from '../../core/services/room.service';
import { FileTransferService } from '../../core/services/file-transfer.service';
import { WebRTCService } from '../../core/services/webrtc.service';
import { LoggerService } from '../../core/services/logger.service';
import { WebSocketConnectionService } from '../../core/services/websocket-connection.service';
import { UserService } from '../../core/services/user.service';
import { take } from 'rxjs/operators';
import { FormsModule, NgForm } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FlowbiteService } from '../../core/services/flowbite.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatMessage } from '../../utils/constants';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';

@Component({
  selector: 'app-chat',
  imports: [
    NgIf,
    NgForOf,
    FormsModule,
    UpperCasePipe,
    DatePipe,
    SlicePipe,
    DecimalPipe,
    PickerComponent,
    TranslateModule,
    NgStyle,
    NgOptimizedImage,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  private _logger: ReturnType<LoggerService['create']> | undefined;

  message = '';
  newRoomName = '';

  messages: ChatMessage[] = [];
  rooms: string[] = [];
  members: string[] = [];

  currentRoom = 'main';
  isDarkMode = false;
  isMenuOpen = false;
  isEmojiPickerVisible = false;

  activeUploads: any[] = [];
  activeDownloads: any[] = [];
  incomingFiles: any[] = [];

  private subscriptions: Subscription[] = [];
  private emojiPickerTimeout: any;
  public isHoveringOverPicker: boolean = false;

  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('messageInput', { static: true }) messageInput!: ElementRef;

  private get logger() {
    if (!this._logger) {
      this._logger = this.loggerService.create('ChatService');
    }
    return this._logger;
  }

  constructor(
    private loggerService: LoggerService,
    public userService: UserService,
    private chatService: ChatService,
    private roomService: RoomService,
    private fileTransferService: FileTransferService,
    private webrtcService: WebRTCService,
    private wsConnectionService: WebSocketConnectionService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private flowbiteService: FlowbiteService,
    public translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.translate.setDefaultLang('en');

    const browserLang = this.translate.getBrowserLang() || 'en';
    const languageToUse = browserLang.match(/en|ar/) ? browserLang : 'en';
    this.translate.use(languageToUse);
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.flowbiteService.loadFlowbite(() => {
      this.logger.debug('ngOnInit', `Flowbite loaded`);
    });

    this.subscriptions.push(
      this.userService.user$.subscribe((username: any) => {
        if (username) {
          this.logger.info('ngOnInit', `Username is set to: ${username}`);
          this.initializeChat();
        }
      })
    );

    const themePreference = localStorage.getItem('themePreference');
    this.isDarkMode = themePreference === 'dark';
    this.applyTheme(this.isDarkMode);
  }

  switchLanguage(language: string) {
    this.translate.use(language);
  }

  onEnterKey(event: KeyboardEvent, messageForm: NgForm): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage(messageForm);
    }
  }

  private initializeChat() {
    this.subscriptions.push(
      this.chatService.messages$.subscribe((messages: ChatMessage[]) => {
        this.messages = [...messages];
        this.cdr.detectChanges();
        this.scrollToBottom();
      })
    );

    this.subscriptions.push(
      this.roomService.rooms$.subscribe((rooms: string[]) => {
        this.rooms = rooms;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.roomService.members$.subscribe((members: string[]) => {
        this.members = members;
        this.cdr.detectChanges();
        this.initiateConnectionsWithMembers();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.activeUploads$.subscribe((uploads: any[]) => {
        this.activeUploads = uploads;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.activeDownloads$.subscribe((downloads: any[]) => {
        this.activeDownloads = downloads;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.incomingFileOffers$.subscribe((incomingFiles: any[]) => {
        this.incomingFiles = incomingFiles;
        this.cdr.detectChanges();
      })
    );
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.connect();
    this.cdr.detectChanges();
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.focus();
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.setThemePreference(this.isDarkMode);
    this.applyTheme(this.isDarkMode);
    this.cdr.detectChanges();
  }

  private applyTheme(isDarkMode: boolean): void {
    if (typeof document !== 'undefined') {
      const htmlElement = document.documentElement;
      if (isDarkMode) {
        htmlElement.classList.add('dark');
        htmlElement.setAttribute('data-theme', 'dark');
      } else {
        htmlElement.classList.remove('dark');
        htmlElement.setAttribute('data-theme', 'light');
      }
    }
  }

  connect(): void {
    this.wsConnectionService
      .connect()
      .then(() => {
        this.roomService.listRooms();
        this.chatService.getUsername();
      })
      .catch((error) => {
        this.logger.error('connect', `WebSocket connection failed: ${error}`);
      });
  }

  sendMessage(messageForm: NgForm): void {
    if (this.message && this.message.trim()) {
      const tempMessage: ChatMessage = {
        from: this.userService.user,
        text: this.message,
        timestamp: new Date(),
      };
      this.messages = [...this.messages, tempMessage];

      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      otherMembers.forEach((member) => {
        this.chatService.sendMessage(this.message, member);
      });

      this.message = '';
      messageForm.resetForm();
      this.scrollToBottom();
    }
  }

  sendAttachments(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const filesToSend = Array.from(input.files);

      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      if (otherMembers.length === 0) {
        this.snackBar.open('No other users available to send the file.', 'Close', {
          duration: 5000,
        });
        return;
      }
      filesToSend.forEach((fileToSend) => {
        otherMembers.forEach((member) => {
          this.fileTransferService.prepareFileForSending(fileToSend, member);
          if (!this.webrtcService.isConnected(member)) {
            this.webrtcService.initiateConnection(member);
          }

          this.webrtcService.dataChannelOpen$.pipe(take(1)).subscribe((isOpen: any) => {
            if (isOpen) {
              this.fileTransferService.sendFileOffer(member);
            }
          });
        });
      });
      input.value = '';
    }
  }

  public acceptIncomingFile(fileDownload: any): void {
    this.fileTransferService.startSavingFile(fileDownload.fromUser);
  }

  public declineIncomingFile(fileDownload: any): void {
    this.fileTransferService.declineFileOffer(fileDownload.fromUser);
  }

  joinRoom(room: string): void {
    if (room !== this.currentRoom) {
      this.roomService.joinRoom(room);
      this.currentRoom = room;
      this.isMenuOpen = false;
    }
  }

  createRoom(): void {
    if (this.newRoomName.trim() && this.newRoomName !== this.currentRoom) {
      this.joinRoom(this.newRoomName.trim());
      this.newRoomName = '';
    }
  }

  isMyMessage(msg: ChatMessage): boolean {
    return msg.from === this.userService.user;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.webrtcService.closeAllConnections();
    clearTimeout(this.emojiPickerTimeout);
  }

  private initiateConnectionsWithMembers(): void {
    this.logger.info('initiateConnectionsWithMembers', 'Initiating connections with other members');
    const otherMembers = this.members.filter((m) => m !== this.userService.user);
    otherMembers.forEach((member) => {
      this.webrtcService.initiateConnection(member);
    });
  }

  public pauseUpload(transfer: any): void {
    this.fileTransferService.pauseTransfer(transfer.targetUser);
  }

  public resumeUpload(transfer: any): void {
    this.fileTransferService.resumeTransfer(transfer.targetUser);
  }

  public cancelUpload(upload: any): void {
    this.fileTransferService.cancelUpload(upload.targetUser);
  }

  public cancelDownload(download: any): void {
    this.fileTransferService.cancelDownload(download.fromUser);
  }

  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.messageContainer.nativeElement.scrollTop =
        this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {
      this.logger.error('scrollToBottom', `Could not scroll to bottom: ${err}`);
    }
  }

  get isRTL(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return document.dir === 'rtl' || this.translate.currentLang === 'ar';
  }

  protected handleEmojiIconMouseLeave(): void {
    setTimeout(() => {
      if (!this.isHoveringOverPicker) {
        this.isEmojiPickerVisible = false;
      }
    }, 150);
  }

  protected addEmoji(event: any): void {
    this.logger.info('addEmoji', `Emoji event received: ${event}`);
    if (!event || !event.emoji || !event.emoji.native) {
      console.warn('Invalid emoji event structure:', event);
      return;
    }

    const chosenEmoji = event.emoji.native;
    this.message += chosenEmoji;
  }
}

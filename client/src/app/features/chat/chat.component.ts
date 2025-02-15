import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session.service';

/**
 * ==========================================================
 * COMPONENT DECORATOR
 * Defines the component's selector, modules, template, and style.
 * ==========================================================
 */
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
    RouterLink,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  /**
   * ==========================================================
   * PRIVATE LOGGER INSTANCE
   * Used for structured logging within this component.
   * ==========================================================
   */
  private _logger: ReturnType<LoggerService['create']> | undefined;

  /**
   * ==========================================================
   * PUBLIC PROPERTIES
   * Bound to the template for data-binding and user interactions.
   * ==========================================================
   */
  message = '';
  newRoomName = '';
  newSessionCode = '';

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

  /**
   * ==========================================================
   * PRIVATE SUBSCRIPTIONS
   * Handles RxJS subscriptions to clean up on destroy.
   * ==========================================================
   */
  private subscriptions: Subscription[] = [];
  private emojiPickerTimeout: any;
  public isHoveringOverPicker: boolean = false;

  /**
   * ==========================================================
   * VIEWCHILD REFERENCES
   * Direct references to DOM elements for scrolling, focusing, etc.
   * ==========================================================
   */
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('messageInput', { static: true }) messageInput!: ElementRef;

  /**
   * ==========================================================
   * LOGGER GETTER
   * Creates or returns an existing logger instance for this component.
   * ==========================================================
   */
  private get logger() {
    if (!this._logger) {
      this._logger = this.loggerService.create('ChatService');
    }
    return this._logger;
  }

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection, TranslateService setup, and any
   * other initial tasks that run before ngOnInit.
   * ==========================================================
   */
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
    private sessionService: SessionService,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.translate.setDefaultLang('en');

    // Detect browser language and set if it matches supported languages
    const browserLang = this.translate.getBrowserLang() || 'en';
    const languageToUse = browserLang.match(/en|ar/) ? browserLang : 'en';
    this.translate.use(languageToUse);
  }

  /**
   * ==========================================================
   * LIFECYCLE HOOK: NGONINIT
   * Called once after component construction. Used here
   * to configure theme, subscribe to route params, and
   * initialize chat data once the user is set.
   * ==========================================================
   */
  ngOnInit(): void {
    // Abort if not in the browser (SSR scenario)
    if (!isPlatformBrowser(this.platformId)) return;

    // Load Flowbite (if needed)
    this.flowbiteService.loadFlowbite(() => {
      this.logger.debug('ngOnInit', `Flowbite loaded`);
    });

    // Check if route has a session code in URL
    this.route.paramMap.subscribe((params) => {
      const sessionCode = params.get('code') ?? undefined;
      if (sessionCode) {
        this.connect(sessionCode);
      } else {
        this.chatService.clearMessages();
        this.messages = [];
      }
    });

    // Listen to changes in the user's name
    this.subscriptions.push(
      this.userService.user$.subscribe((username: any) => {
        if (username) {
          this.logger.info('ngOnInit', `Username is set to: ${username}`);
          this.initializeChat();
        }
      })
    );

    // Load theme preference from localStorage
    const themePreference = localStorage.getItem('themePreference');
    this.isDarkMode = themePreference === 'dark';
    this.applyTheme(this.isDarkMode);
  }

  /**
   * ==========================================================
   * LANGUAGE SWITCHER
   * Allows runtime switching between English and Arabic.
   * ==========================================================
   */
  switchLanguage(language: string) {
    this.translate.use(language);
  }

  /**
   * ==========================================================
   * HANDLE ENTER KEY
   * Prevents default behavior if shift isn't pressed
   * and sends the message instead.
   * ==========================================================
   */
  onEnterKey(event: KeyboardEvent, messageForm: NgForm): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage(messageForm);
    }
  }

  /**
   * ==========================================================
   * INITIALIZE CHAT
   * Subscribes to relevant observables and updates local
   * properties to reflect chat state (messages, rooms, etc.).
   * ==========================================================
   */
  private initializeChat() {
    // Listen for new messages
    this.subscriptions.push(
      this.chatService.messages$.subscribe((messages: ChatMessage[]) => {
        this.messages = [...messages];
        this.cdr.detectChanges();
        this.scrollToBottom();
      })
    );

    // Listen for available rooms
    this.subscriptions.push(
      this.roomService.rooms$.subscribe((rooms: string[]) => {
        this.rooms = rooms;
        this.cdr.detectChanges();
      })
    );

    // Listen for current members in the room
    this.subscriptions.push(
      this.roomService.members$.subscribe((allMembers: string[]) => {
        // Filter out the local user's own name
        this.members = allMembers.filter((m) => m !== this.userService.user);
        this.cdr.detectChanges();
        this.initiateConnectionsWithMembers();
      })
    );

    // Listen for active file uploads
    this.subscriptions.push(
      this.fileTransferService.activeUploads$.subscribe((uploads: any[]) => {
        this.activeUploads = uploads;
        this.cdr.detectChanges();
      })
    );

    // Listen for active file downloads
    this.subscriptions.push(
      this.fileTransferService.activeDownloads$.subscribe((downloads: any[]) => {
        this.activeDownloads = downloads;
        this.cdr.detectChanges();
      })
    );

    // Listen for incoming file offers
    this.subscriptions.push(
      this.fileTransferService.incomingFileOffers$.subscribe((incomingFiles: any[]) => {
        this.incomingFiles = incomingFiles;
        this.cdr.detectChanges();
      })
    );
  }

  /**
   * ==========================================================
   * LIFECYCLE HOOK: NGAFTERVIEWINIT
   * Called after view initialization to handle focus, route
   * checks (if no code, default to main session).
   * ==========================================================
   */
  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.route.paramMap.pipe(take(1)).subscribe((params) => {
      const sessionCode = params.get('code');
      if (!sessionCode) {
        this.connect();
      }
    });

    this.cdr.detectChanges();
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.focus();
    }
  }

  /**
   * ==========================================================
   * THEME TOGGLER
   * Toggles between dark and light modes, applying CSS classes.
   * ==========================================================
   */
  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.setThemePreference(this.isDarkMode);
    this.applyTheme(this.isDarkMode);
    this.cdr.detectChanges();
  }

  /**
   * ==========================================================
   * APPLY THEME
   * Sets the <html> data-theme attribute to "dark" or "light".
   * ==========================================================
   */
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

  /**
   * ==========================================================
   * CONNECT
   * Establishes a WebSocket connection to a session (if provided).
   * Upon success, lists rooms and grabs the username.
   * ==========================================================
   */
  connect(code?: string): void {
    this.wsConnectionService
      .connect(code)
      .then(() => {
        this.logger.info('connect', `Connected to session: ${code || 'No code provided'}`);
        this.roomService.listRooms();
        this.chatService.getUsername();
      })
      .catch((error) => {
        this.logger.error('connect', `WebSocket connection failed: ${error}`);
      });
  }

  /**
   * ==========================================================
   * SEND MESSAGE
   * Sends the chat message to other members, then clears
   * the input field and scrolls chat down.
   * ==========================================================
   */
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
      messageForm.resetForm({ message: '' });
      this.scrollToBottom();
    }
  }

  /**
   * ==========================================================
   * SEND ATTACHMENTS
   * Triggers file sending to other users via FileTransferService.
   * Attempts to establish WebRTC connections if not already open.
   * ==========================================================
   */
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

  /**
   * ==========================================================
   * ACCEPT INCOMING FILE
   * User confirms file download from another user.
   * ==========================================================
   */
  public acceptIncomingFile(fileDownload: any): void {
    this.fileTransferService.startSavingFile(fileDownload.fromUser);
  }

  /**
   * ==========================================================
   * DECLINE INCOMING FILE
   * User declines file transfer request from another user.
   * ==========================================================
   */
  public declineIncomingFile(fileDownload: any): void {
    this.fileTransferService.declineFileOffer(fileDownload.fromUser);
  }

  /**
   * ==========================================================
   * JOIN ROOM
   * Joins a given chat room if it's not the current one.
   * ==========================================================
   */
  joinRoom(room: string): void {
    if (room !== this.currentRoom) {
      this.roomService.joinRoom(room);
      this.currentRoom = room;
      this.isMenuOpen = false;
    }
  }

  /**
   * ==========================================================
   * CREATE ROOM
   * Creates or joins a new room based on the room name input.
   * ==========================================================
   */
  createRoom(): void {
    if (this.newRoomName.trim() && this.newRoomName !== this.currentRoom) {
      this.joinRoom(this.newRoomName.trim());
      this.newRoomName = '';
    }
  }

  /**
   * ==========================================================
   * CREATE PRIVATE SESSION
   * Requests a new session code from the server, then navigates to it.
   * ==========================================================
   */
  createPrivateSession(): void {
    this.sessionService.createNewSessionCode().subscribe({
      next: (res) => {
        const code = res.code;
        this.openChatSession(code);
      },
      error: (err) => {
        console.error('Failed to create new session code:', err);
        this.snackBar.open('Could not create session', 'Close', { duration: 3000 });
      },
    });
  }

  /**
   * ==========================================================
   * JOIN PRIVATE SESSION
   * Navigates to an existing session code entered by the user.
   * ==========================================================
   */
  joinPrivateSession(): void {
    const code = this.newSessionCode.trim();
    if (!code) {
      console.error('Session code is required to join a session.');
      return;
    }
    this.openChatSession(code);
  }

  /**
   * ==========================================================
   * OPEN CHAT SESSION
   * Redirects the user to /chat/:code in the same browser tab.
   * ==========================================================
   */
  private openChatSession(code: string): void {
    window.open(`/chat/${code}`, '_self');
  }

  /**
   * ==========================================================
   * CHECK IF MESSAGE IS FROM CURRENT USER
   * Useful for styling: returns true if this user's message.
   * ==========================================================
   */
  isMyMessage(msg: ChatMessage): boolean {
    return msg.from === this.userService.user;
  }

  /**
   * ==========================================================
   * LIFECYCLE HOOK: NGONDESTROY
   * Cleans up all subscriptions and closes any WebRTC connections
   * when the component is torn down.
   * ==========================================================
   */
  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.webrtcService.closeAllConnections();
    this.wsConnectionService.disconnect();
    this.chatService.clearMessages();
    clearTimeout(this.emojiPickerTimeout);
    this.messages = [];
  }

  /**
   * ==========================================================
   * INITIATE CONNECTIONS WITH ROOM MEMBERS
   * Attempts to open a WebRTC connection with each peer.
   * ==========================================================
   */
  private initiateConnectionsWithMembers(): void {
    if (!this.members || this.members.length === 0) {
      this.logger.info(
        'initiateConnectionsWithMembers',
        'No members in the room, skipping WebRTC.'
      );
      return;
    }

    this.logger.info('initiateConnectionsWithMembers', 'Initiating connections with other members');
    const otherMembers = this.members.filter((m) => m !== this.userService.user);

    if (otherMembers.length === 0) {
      this.logger.warn('initiateConnectionsWithMembers', 'No other members to connect to');
      return;
    }

    otherMembers.forEach((member) => {
      this.webrtcService.initiateConnection(member);
    });
  }

  /**
   * ==========================================================
   * CANCEL UPLOAD
   * Invoked by the user to cancel an ongoing file upload.
   * ==========================================================
   */
  public cancelUpload(upload: any): void {
    this.fileTransferService.cancelUpload(upload.targetUser);
  }

  /**
   * ==========================================================
   * CANCEL DOWNLOAD
   * Invoked by the user to cancel an ongoing file download.
   * ==========================================================
   */
  public cancelDownload(download: any): void {
    this.fileTransferService.cancelDownload(download.fromUser);
  }

  /**
   * ==========================================================
   * SCROLL TO BOTTOM
   * Ensures the latest messages are visible in the chat area.
   * ==========================================================
   */
  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.messageContainer.nativeElement.scrollTop =
        this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {
      this.logger.error('scrollToBottom', `Could not scroll to bottom: ${err}`);
    }
  }

  /**
   * ==========================================================
   * RTL CHECK
   * Determines if the current language is RTL (e.g., Arabic).
   * ==========================================================
   */
  get isRTL(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return document.dir === 'rtl' || this.translate.currentLang === 'ar';
  }

  /**
   * ==========================================================
   * HANDLE EMOJI ICON MOUSE LEAVE
   * Delays hiding the emoji picker if the pointer left the icon.
   * ==========================================================
   */
  protected handleEmojiIconMouseLeave(): void {
    setTimeout(() => {
      if (!this.isHoveringOverPicker) {
        this.isEmojiPickerVisible = false;
      }
    }, 150);
  }

  /**
   * ==========================================================
   * ADD EMOJI
   * Inserts the selected emoji into the current message text.
   * ==========================================================
   */
  protected addEmoji(event: any): void {
    this.logger.info('addEmoji', `Emoji event received: ${event}`);
    if (!event || !event.emoji || !event.emoji.native) {
      console.warn('Invalid emoji event structure:', event);
      return;
    }

    const chosenEmoji = event.emoji.native;
    this.message = (this.message || '') + chosenEmoji;
  }
}

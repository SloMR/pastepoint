import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  Inject,
  NgZone,
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
  NgClass,
  NgForOf,
  NgIf,
  NgOptimizedImage,
  NgStyle,
  SlicePipe,
  UpperCasePipe,
} from '@angular/common';

import { ThemeService } from '../../core/services/ui/theme.service';
import { ChatService } from '../../core/services/communication/chat.service';
import { RoomService } from '../../core/services/room-management/room.service';
import { FileTransferService } from '../../core/services/file-management/file-transfer.service';
import { WebRTCService } from '../../core/services/communication/webrtc.service';
import { WebSocketConnectionService } from '../../core/services/communication/websocket-connection.service';
import { UserService } from '../../core/services/user-management/user.service';
import { take } from 'rxjs/operators';
import { FormsModule, NgForm } from '@angular/forms';
import { FlowbiteService } from '../../core/services/ui/flowbite.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatMessage, FileDownload, FileUpload, MB } from '../../utils/constants';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session/session.service';
import { ToastrService } from 'ngx-toastr';
import packageJson from '../../../../package.json';
import { NGXLogger } from 'ngx-logger';
import { MigrationService } from '../../core/services/migration/migration.service';
import { MetaService } from '../../core/services/ui/meta.service';

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
    NgClass,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  /**
   * ==========================================================
   * PUBLIC PROPERTIES
   * Bound to the template for data-binding and user interactions.
   * ==========================================================
   */
  protected readonly MB: number = MB;
  message = '';
  newRoomName = '';
  SessionCode = '';
  newSessionCode = '';

  messages: ChatMessage[] = [];
  rooms: string[] = [];
  members: string[] = [];

  currentRoom = 'main';
  isDarkMode = false;
  isMenuOpen = false;
  isEmojiPickerVisible = false;
  isDragging = false;
  showSessionInfo = true;

  activeUploads: FileUpload[] = [];
  activeDownloads: FileDownload[] = [];
  incomingFiles: FileDownload[] = [];

  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat: number = Date.now();
  private readonly HEARTBEAT_INTERVAL_MS = 1000;
  private readonly HEARTBEAT_TIMEOUT_MS = 2000;

  appVersion: string = packageJson.version;

  private visibilityChangeListener = () => {
    if (
      document.visibilityState === 'visible' &&
      this.SessionCode &&
      !this.wsConnectionService.isConnected()
    ) {
      this.logger.info('visibilitychange', 'Page visible, reconnecting if needed');
      void this.connect(this.SessionCode);
    }
  };
  private beforeUnloadHandler = () => {
    this.clearSessionCode();
  };

  /**
   * ==========================================================
   * PRIVATE SUBSCRIPTIONS
   * Handles RxJS subscriptions to clean up on destroy.
   * ==========================================================
   */
  private subscriptions: Subscription[] = [];
  private emojiPickerTimeout: ReturnType<typeof setTimeout> | null = null;
  public isHoveringOverPicker = false;

  /**
   * ==========================================================
   * VIEWCHILD REFERENCES
   * Direct references to DOM elements for scrolling, focusing, etc.
   * ==========================================================
   */
  @ViewChild('messageContainer') messageContainer!: ElementRef;
  @ViewChild('messageInput', { static: true }) messageInput!: ElementRef;

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection, TranslateService setup, and any
   * other initial tasks that run before ngOnInit.
   * ==========================================================
   */
  constructor(
    public userService: UserService,
    private chatService: ChatService,
    private roomService: RoomService,
    private fileTransferService: FileTransferService,
    private webrtcService: WebRTCService,
    private wsConnectionService: WebSocketConnectionService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private toaster: ToastrService,
    private flowbiteService: FlowbiteService,
    public translate: TranslateService,
    private sessionService: SessionService,
    private route: ActivatedRoute,
    private logger: NGXLogger,
    private migrationService: MigrationService,
    private metaService: MetaService,
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
    if (!isPlatformBrowser(this.platformId)) {
      this.route.paramMap.subscribe((params) => {
        const privateSession = params.get('code');

        if (privateSession) {
          this.metaService.updateChatMetadata(true);
        } else {
          this.metaService.updateChatMetadata(false);
        }
      });
      return;
    }

    // Initialize the chat service and set up the heartbeat monitor
    this.startHeartbeatMonitor();

    // Check if migration is needed due to version change
    const migrationPerformed = this.migrationService.checkAndMigrateIfNeeded(this.appVersion, true);
    if (migrationPerformed) {
      this.logger.debug('ngOnInit', 'Migration performed due to version change');
    } else {
      this.logger.debug('ngOnInit', 'No migration needed');
    }

    // Load Flowbite (if needed)
    this.flowbiteService.loadFlowbite(() => {
      this.logger.debug('ngOnInit', `Flowbite loaded`);
    });

    // Check if route has a session code in URL but don't connect yet
    this.route.paramMap.subscribe((params) => {
      const sessionCode = params.get('code');
      const storedSessionCode = localStorage.getItem('SessionCode');

      if (sessionCode) {
        this.SessionCode = sessionCode;
        this.metaService.updateChatMetadata(true);
      } else if (storedSessionCode) {
        this.SessionCode = storedSessionCode;
        this.metaService.updateChatMetadata(true);
      } else {
        this.chatService.clearMessages();
        this.messages = [];
        this.metaService.updateChatMetadata(false);
      }
    });

    // Listen to changes in the user's name
    this.subscriptions.push(
      this.userService.user$.subscribe((username: unknown) => {
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
   * LIFECYCLE HOOK: NGONDESTROY
   * Cleans up all subscriptions and closes any WebRTC connections
   * when the component is torn down.
   * ==========================================================
   */
  ngOnDestroy(): void {
    this.unsubscribeAll();
    this.closeConnections();
    this.clearMessages();
    if (this.emojiPickerTimeout) {
      clearTimeout(this.emojiPickerTimeout);
    }

    if (this.SessionCode) {
      this.clearSessionCode();
    }

    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.logger.debug('ngOnDestroy', 'Heartbeat monitor cleared');
    }

    if (isPlatformBrowser(this.platformId) && this.visibilityChangeListener) {
      document.removeEventListener('visibilitychange', this.visibilityChangeListener);
    }

    if (isPlatformBrowser(this.platformId) && this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  /**
   * ==========================================================
   * UNSUBSCRIBE ALL
   * Cleans up all subscriptions to prevent memory leaks.
   * ==========================================================
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.subscriptions = [];
  }

  /**
   * ==========================================================
   * CLEAR MESSAGES
   * Clears the chat messages and resets the local messages array.
   * ==========================================================
   */
  clearMessages(): void {
    this.chatService.clearMessages();
    this.messages = [];
  }

  /**
   * ==========================================================
   * CLOSE ALL CONNECTIONS
   * Closes all WebRTC connections and disconnects the WebSocket.
   * ==========================================================
   */
  closeConnections(): void {
    this.webrtcService.closeAllConnections();
    this.wsConnectionService.disconnect(true);
    this.logger.debug('closeConnections', 'All WebRTC connections closed');
  }

  /**
   * ==========================================================
   * HEARTBEAT MONITOR
   * Monitors the heartbeat to detect if the app is hidden or suspended.
   * If the heartbeat is missed, it closes all connections and notifies the user.
   * ==========================================================
   */
  private startHeartbeatMonitor(): void {
    this.heartbeatIntervalId = setInterval(() => {
      const now = Date.now();
      const diff = now - this.lastHeartbeat;

      // Simulate heartbeat update
      this.lastHeartbeat = now;
      this.logger.debug('Heartbeat', `Last heartbeat: ${this.lastHeartbeat}`);

      // Detect suspension
      if (diff > this.HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn('Heartbeat', `Suspension detected: last beat was ${diff}ms ago.`);
        this.toaster.warning(
          this.translate.instant('CONNECTION_LOST'),
          this.translate.instant('AUTO_REFRESH_NOTICE')
        );

        // Force page refresh to completely reset the app state if needed
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);
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
      void this.sendMessage(messageForm);
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
      this.fileTransferService.activeUploads$.subscribe((uploads: FileUpload[]) => {
        this.logger.info('activeUploads', `Active uploads: ${uploads.length} (length)`);
        this.ngZone.run(() => {
          this.activeUploads = uploads;
          this.cdr.detectChanges();
        });
      })
    );

    // Listen for active file downloads
    this.subscriptions.push(
      this.fileTransferService.activeDownloads$.subscribe((downloads: FileDownload[]) => {
        this.logger.info('activeDownloads', `Active downloads: ${downloads.length} (length)`);
        this.ngZone.run(() => {
          this.activeDownloads = downloads;
          this.cdr.detectChanges();
        });
      })
    );

    // Listen for incoming file offers
    this.subscriptions.push(
      this.fileTransferService.incomingFileOffers$.subscribe((incomingFiles: FileDownload[]) => {
        this.logger.info(
          'incomingFileOffers',
          `Incoming file offers: ${incomingFiles.length} (length)`
        );
        this.ngZone.run(() => {
          this.incomingFiles = incomingFiles;
          this.cdr.detectChanges();
        });
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

    if (this.SessionCode) {
      this.connect(this.SessionCode);
    } else {
      void this.connect();
    }

    document.addEventListener('visibilitychange', this.visibilityChangeListener);
    window.addEventListener('beforeunload', this.beforeUnloadHandler);

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
  connect(code?: string): Promise<void> {
    // Store session code in component for later reconnection
    if (code) {
      this.SessionCode = code;
    }

    if (this.wsConnectionService.isConnected()) {
      this.logger.debug('connect', 'Already connected, skipping connection');
      return Promise.resolve();
    }

    return this.wsConnectionService
      .connect(code)
      .then(() => {
        this.logger.info('connect', `Connected to session: ${code ?? 'No code provided'}`);
        this.roomService.listRooms();
        this.chatService.getUsername();
      })
      .catch((error: unknown) => {
        this.logger.error('connect', `WebSocket connection failed: ${error}`);
        throw error;
      });
  }

  /**
   * ==========================================================
   * SEND MESSAGE
   * Sends the chat message to other members, then clears
   * the input field and scrolls chat down.
   * ==========================================================
   */
  async sendMessage(messageForm: NgForm): Promise<void> {
    if (this.message?.trim()) {
      const tempMessage: ChatMessage = {
        from: this.userService.user,
        text: this.message,
        timestamp: new Date(),
      };
      this.messages = [...this.messages, tempMessage];

      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      otherMembers.forEach(async (member) => {
        await this.chatService.sendMessage(this.message, member);
      });

      this.message = '';
      messageForm.resetForm({ message: '' });
      this.scrollToBottom();
    } else {
      this.toaster.warning(this.translate.instant('MESSAGE_REQUIRED'));
    }
  }

  /**
   * ==========================================================
   * SEND ATTACHMENTS
   * Triggers file sending to other users via FileTransferService.
   * Attempts to establish WebRTC connections if not already open.
   * ==========================================================
   */
  async sendAttachments(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const filesToSend = Array.from(input.files);

      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      if (otherMembers.length === 0) {
        this.toaster.warning(this.translate.instant('NO_USERS_FOR_UPLOAD'));
        return;
      }

      // First prepare all files for all members
      for (const fileToSend of filesToSend) {
        for (const member of otherMembers) {
          await this.fileTransferService.prepareFileForSending(fileToSend, member);
          if (!this.webrtcService.isConnected(member)) {
            this.webrtcService.initiateConnection(member);
          }
        }
      }

      // Then send all file offers once per member
      for (const member of otherMembers) {
        await new Promise<void>((resolve) => {
          this.webrtcService.dataChannelOpen$.pipe(take(1)).subscribe(async (isOpen: unknown) => {
            if (isOpen) {
              await this.fileTransferService.sendAllFileOffers(member);
              this.logger.debug('sendAttachments', `Sent ${filesToSend.length} files to ${member}`);
            } else {
              this.toaster.warning(this.translate.instant('DATA_CHANNEL_CLOSED'));
            }
            resolve();
          });
        });
      }

      input.value = '';
    } else {
      this.toaster.warning(this.translate.instant('NO_FILES_SELECTED'));
    }
  }

  /**
   * ==========================================================
   * ACCEPT INCOMING FILE
   * User confirms file download from another user.
   * ==========================================================
   */
  public async acceptIncomingFile(fileDownload: FileDownload): Promise<void> {
    await this.fileTransferService.acceptFileOffer(fileDownload.fromUser, fileDownload.fileId);
  }

  /**
   * ==========================================================
   * DECLINE INCOMING FILE
   * User declines file transfer request from another user.
   * ==========================================================
   */
  public async declineIncomingFile(fileDownload: FileDownload): Promise<void> {
    await this.fileTransferService.declineFileOffer(fileDownload.fromUser, fileDownload.fileId);
  }

  /**
   * ==========================================================
   * CANCEL UPLOAD
   * Invoked by the user to cancel an ongoing file upload.
   * ==========================================================
   */
  public async cancelUpload(upload: FileUpload): Promise<void> {
    await this.fileTransferService.cancelFileUpload(upload.targetUser, upload.fileId);
  }

  /**
   * ==========================================================
   * CANCEL DOWNLOAD
   * Invoked by the user to cancel an ongoing file download.
   * ==========================================================
   */
  public async cancelDownload(download: FileDownload): Promise<void> {
    await this.fileTransferService.cancelFileDownload(download.fromUser, download.fileId);
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
    } else {
      this.toaster.warning(this.translate.instant('ALREADY_IN_ROOM'));
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
    } else {
      this.toaster.warning(this.translate.instant('ENTER_VALID_ROOM'));
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
        this.showSessionInfo = true;
        const code = res.code;
        this.openChatSession(code);
      },
      error: (err) => {
        console.error('Failed to create new session code:', err);
        this.toaster.error(
          this.translate.instant('SESSION_CREATION_FAILED'),
          this.translate.instant('ERROR')
        );
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
    this.showSessionInfo = true;
    if (!code) {
      console.error('Session code is required to join a session.');
      return;
    }
    this.openChatSession(code);
  }

  /**
   * ==========================================================
   * OPEN CHAT SESSION
   * Redirects the user to /private/:code in the same browser tab.
   * ==========================================================
   */
  private openChatSession(code: string): void {
    if (this.SessionCode) {
      this.clearSessionCode();
      this.wsConnectionService.disconnect();
    }

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('SessionCode', code);
      window.open(`/private/${code}`, '_self');
    }
  }

  /**
   * ==========================================================
   * COPY SESSION CODE
   * Copies the current session code to the user's clipboard.
   * ==========================================================
   */
  copySessionCode(): void {
    if (!this.SessionCode) {
      this.toaster.warning(this.translate.instant('NO_SESSION_TO_COPY'));
      return;
    }

    navigator.clipboard.writeText(this.SessionCode).then(
      () => this.toaster.success(this.translate.instant('COPY_SESSION_SUCCESS')),
      (err) => {
        console.error('Failed to copy session code:', err);
        this.toaster.error(
          this.translate.instant('COPY_SESSION_FAILED'),
          this.translate.instant('ERROR')
        );
      }
    );
  }

  /**
   * ==========================================================
   * CLEAR SESSION CODE
   * Removes the session code from localStorage and resets
   * the SessionCode property.
   * =========================================================
   */
  private clearSessionCode(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('SessionCode');
    }

    this.SessionCode = '';
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
  protected addEmoji(event: { emoji: { native: string } }): void {
    if (event?.emoji?.native) {
      this.message += event.emoji.native;
      this.isEmojiPickerVisible = false;
      this.emojiPickerTimeout = setTimeout(() => {
        if (this.messageInput?.nativeElement) {
          this.messageInput.nativeElement.focus();
        }
      }, 100);
    }
  }

  /**
   * ==========================================================
   * SHOW SeSSION INFO
   * Dismisses the session info banner.
   * ==========================================================
   */
  dismissSessionInfo(): void {
    this.showSessionInfo = false;
  }

  /**
   * ==========================================================
   * HANDLE DRAG ENTER
   * Manages the drag enter state
   * ==========================================================
   */
  protected handleDragEnter(): void {
    if (!this.isDragging) {
      this.isDragging = true;
    }
  }

  /**
   * ==========================================================
   * HANDLE DRAG LEAVE
   * Manages the drag leave state
   * ==========================================================
   */
  protected handleDragLeave(event: DragEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      this.isDragging = false;
    }
  }

  /**
   * ==========================================================
   * HANDLE DRAG OVER
   * Provides visual feedback during drag
   * ==========================================================
   */
  protected handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /**
   * ==========================================================
   * HANDLE DROP
   * Processes files dropped into the chat area
   * ==========================================================
   */
  protected async handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragging = false;
    if (!event.dataTransfer?.files) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    const otherMembers = this.members.filter((m) => m !== this.userService.user);
    if (otherMembers.length === 0) {
      this.toaster.info(
        this.translate.instant('NO_USERS_FOR_UPLOAD'),
        this.translate.instant('INFO')
      );
      return;
    }
    // First prepare all files for all members
    for (const fileToSend of files) {
      for (const member of otherMembers) {
        await this.fileTransferService.prepareFileForSending(fileToSend, member);
        if (!this.webrtcService.isConnected(member)) {
          this.webrtcService.initiateConnection(member);
        }
      }
    }

    // Then send all file offers once per member
    for (const member of otherMembers) {
      await new Promise<void>((resolve) => {
        this.webrtcService.dataChannelOpen$.pipe(take(1)).subscribe(async (isOpen: unknown) => {
          if (isOpen) {
            await this.fileTransferService.sendAllFileOffers(member);
            this.logger.debug('sendAttachments', `Sent ${files.length} files to ${member}`);
          } else {
            this.toaster.warning(this.translate.instant('DATA_CHANNEL_CLOSED'));
          }
          resolve();
        });
      });
    }
  }
}

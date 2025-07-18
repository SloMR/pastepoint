import {
  AfterViewInit,
  ChangeDetectionStrategy,
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
import { FormsModule, NgForm } from '@angular/forms';
import { FlowbiteService } from '../../core/services/ui/flowbite.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ChatMessage,
  ChatMessageType,
  FileDownload,
  FileUpload,
  MB,
  NAVIGATION_DELAY_MS,
  SESSION_CODE_KEY,
  THEME_PREFERENCE_KEY,
} from '../../utils/constants';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session/session.service';
import packageJson from '../../../../package.json';
import { NGXLogger } from 'ngx-logger';
import { MigrationService } from '../../core/services/migration/migration.service';
import { MetaService } from '../../core/services/ui/meta.service';
import { LanguageService } from '../../core/services/ui/language.service';
import { LanguageCode } from '../../core/i18n/translate-loader';
import { Router } from '@angular/router';
import { HotToastService } from '@ngneat/hot-toast';
import * as QRCode from 'qrcode';

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
    DecimalPipe,
    PickerComponent,
    TranslateModule,
    NgStyle,
    NgOptimizedImage,
    RouterLink,
    NgClass,
    SlicePipe,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  /**
   * ==========================================================
   * PUBLIC PROPERTIES
   * Bound to the template for data-binding and user interactions.
   * ==========================================================
   */
  protected readonly MB: number = MB;
  protected readonly ChatMessageType = ChatMessageType;
  message = '';
  newRoomName = '';
  SessionCode = '';
  newSessionCode = '';

  messages: ChatMessage[] = [];
  rooms: string[] = [];
  members: string[] = [];

  currentRoom = 'main';
  isDarkMode = false;
  currentLanguage: LanguageCode = 'en';
  isMenuOpen = false;
  isEmojiPickerVisible = false;
  isDragging = false;
  showSessionInfo = true;

  isOpenCreateRoom = false;
  isOpenJoinSessionPopup = false;
  isOpenEndSessionPopup = false;
  isOpenQRCodePopup = false;
  isGeneratingQRCode = false;
  skipDrawerAnim = false;

  activeUploads: FileUpload[] = [];
  activeDownloads: FileDownload[] = [];
  incomingFiles: FileDownload[] = [];

  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat: number = Date.now();
  private readonly HEARTBEAT_INTERVAL_MS = 1000;
  private readonly HEARTBEAT_TIMEOUT_MS = 2000;
  private isNavigatingIntentionally = false;

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
    if (!this.isNavigatingIntentionally) {
      this.clearSessionCode();
    }
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
  @ViewChild('qrCodeContainer', { static: false }) qrCodeContainer!: ElementRef;

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
    private languageService: LanguageService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private toaster: HotToastService,
    private flowbiteService: FlowbiteService,
    @Inject(TranslateService) protected translate: TranslateService,
    private sessionService: SessionService,
    private route: ActivatedRoute,
    private logger: NGXLogger,
    private migrationService: MigrationService,
    private metaService: MetaService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

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
      this.ngZone.run(() => {
        const sessionCode = params.get('code');
        const storedSessionCode = localStorage.getItem(SESSION_CODE_KEY);

        if (sessionCode && this.isValidSessionCode(sessionCode)) {
          this.SessionCode = this.sanitizeSessionCode(sessionCode);
          this.metaService.updateChatMetadata(true);
        } else if (storedSessionCode && this.isValidSessionCode(storedSessionCode)) {
          this.SessionCode = this.sanitizeSessionCode(storedSessionCode);
          this.metaService.updateChatMetadata(true);
        } else {
          if (sessionCode && !this.isValidSessionCode(sessionCode)) {
            this.logger.warn('ngOnInit', 'Invalid session code in URL, clearing');
          }
          if (storedSessionCode && !this.isValidSessionCode(storedSessionCode)) {
            this.logger.warn('ngOnInit', 'Invalid session code in localStorage, clearing');
            this.clearSessionCode();
          }
          this.chatService.clearMessages();
          this.messages = [];
          this.metaService.updateChatMetadata(false);
        }
        this.cdr.detectChanges();
      });
    });

    // Listen to changes in the user's name
    this.subscriptions.push(
      this.userService.user$.subscribe((username: unknown) => {
        if (username) {
          this.ngZone.run(() => {
            this.logger.info('ngOnInit', `Username is set to: ${username}`);
            this.initializeChat();
          });
        }
      })
    );

    // Load theme preference from localStorage
    const themePreference = localStorage.getItem(THEME_PREFERENCE_KEY);
    this.isDarkMode = themePreference === 'dark';
    this.applyTheme(this.isDarkMode);

    // Get current language from language service
    this.currentLanguage = this.languageService.getCurrentLanguage();
    this.logger.debug(
      'ngOnInit',
      'Chat component - initial currentLanguage:',
      this.currentLanguage
    );

    // Add a small delay to ensure language service has fully initialized
    setTimeout(() => {
      this.currentLanguage = this.languageService.getCurrentLanguage();
      this.logger.debug(
        'ngOnInit',
        'Chat component - currentLanguage after timeout:',
        this.currentLanguage
      );
      this.cdr.detectChanges();
    }, 100);
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

    if (!this.isNavigatingIntentionally && this.SessionCode) {
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
    this.wsConnectionService.disconnect(!this.isNavigatingIntentionally);
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
      // Detect suspension
      if (diff > this.HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn('Heartbeat', `Suspension detected: last beat was ${diff}ms ago.`);
        this.toaster.warning(this.translate.instant('AUTO_REFRESH_NOTICE'));

        // Force page refresh to completely reset the app state if needed
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => {
            window.location.reload();
          }, 2000);
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
    this.ngZone.run(() => {
      const languageCode = language as LanguageCode;
      this.languageService.setLanguagePreference(languageCode);
      this.currentLanguage = languageCode;
      this.skipDrawerAnim = true;
      setTimeout(() => (this.skipDrawerAnim = false), 100);
      this.cdr.detectChanges();
    });
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
        this.ngZone.run(() => {
          this.messages = [...messages];
          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      })
    );

    // Listen for available rooms
    this.subscriptions.push(
      this.roomService.rooms$.subscribe((rooms: string[]) => {
        this.ngZone.run(() => {
          this.rooms = rooms;
          this.cdr.detectChanges();
        });
      })
    );

    // Listen for current members in the room
    this.subscriptions.push(
      this.roomService.members$.subscribe((allMembers: string[]) => {
        this.ngZone.run(() => {
          // Filter out the local user's own name
          this.members = allMembers.filter((m) => m !== this.userService.user);
          this.cdr.detectChanges();
          this.initiateConnectionsWithMembers();
        });
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
    this.ngZone.run(() => {
      this.isDarkMode = !this.isDarkMode;
      this.themeService.setThemePreference(this.isDarkMode);
      this.applyTheme(this.isDarkMode);
      this.cdr.detectChanges();
    });
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
        if (code) {
          this.toaster.success(this.translate.instant('CONNECTED_TO_PRIVATE_SESSION'));
        }
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
    if (this.message.trim()) {
      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      if (otherMembers.length === 0) {
        this.toaster.warning(this.translate.instant('NO_MEMBERS_TO_SEND_MESSAGE'));
        return;
      }

      this.ngZone.run(() => {
        const newMessage: ChatMessage = {
          from: this.userService.user,
          text: this.message,
          type: ChatMessageType.TEXT,
          timestamp: new Date(),
        };
        this.messages = [...this.messages, newMessage];
        this.cdr.detectChanges();
      });

      otherMembers.forEach(async (member) => {
        await this.chatService.sendMessage(this.message, member);
      });

      this.ngZone.run(() => {
        this.message = '';
        messageForm.resetForm({ message: '' });
        this.cdr.detectChanges();
        this.scrollToBottom();
      });
    } else {
      this.toaster.warning(this.translate.instant('MESSAGE_REQUIRED'));
    }
  }

  /**
   * ==========================================================
   * TRACK MESSAGE
   * Used to track the messages in the chat.
   * ==========================================================
   */
  trackMessage(index: number, message: ChatMessage): string {
    return message.text + index;
  }

  /**
   * ==========================================================
   * TRUNCATE FILENAME
   * Truncates a filename while preserving the file extension
   * ==========================================================
   */
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

  /**
   * ==========================================================
   * CREATE AND SEND FILE MESSAGES
   * Creates chat messages for files being sent and sends them to all members
   * ==========================================================
   */
  private async createAndSendFileMessages(files: File[], otherMembers: string[]): Promise<void> {
    for (const file of files) {
      const fileSizeInMB = (file.size / MB).toFixed(2);
      const truncatedFilename = this.truncateFilename(file.name);
      const fileMessageText = `${this.translate.instant('FILE_SENT')}: ${truncatedFilename} (${fileSizeInMB} MB)`;

      // Add file message to local messages immediately
      this.ngZone.run(() => {
        const fileMessage: ChatMessage = {
          from: this.userService.user,
          text: fileMessageText,
          type: ChatMessageType.ATTACHMENT,
          timestamp: new Date(),
        };
        this.messages = [...this.messages, fileMessage];
        this.cdr.detectChanges();
        this.scrollToBottom();
      });

      // Send file message to all other members
      for (const member of otherMembers) {
        await this.chatService.sendMessage(fileMessageText, member, ChatMessageType.ATTACHMENT);
      }
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

      // Create chat messages for each file being sent
      await this.createAndSendFileMessages(filesToSend, otherMembers);

      // First prepare all files for all members
      for (const fileToSend of filesToSend) {
        for (const member of otherMembers) {
          await this.fileTransferService.prepareFileForSending(fileToSend, member);
          if (!this.webrtcService.isConnectedOrConnecting(member)) {
            this.logger.info(
              'sendAttachments',
              `Initiating connection to ${member} for file transfer`
            );
            this.webrtcService.initiateConnection(member);
          }
        }
      }

      // Then send all file offers once per member
      for (const member of otherMembers) {
        const connectionReady = await this.waitForFileTransferConnection(member);

        if (connectionReady) {
          await this.fileTransferService.sendAllFileOffers(member);
          this.logger.debug('sendAttachments', `Sent ${filesToSend.length} files to ${member}`);
        }
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
      this.ngZone.run(() => {
        this.roomService.joinRoom(room);
        this.currentRoom = room;
        this.isMenuOpen = false;
        this.toaster.success(this.translate.instant('ROOM_JOINED_SUCCESS', { roomName: room }));
        this.cdr.detectChanges();
      });
    } else {
      this.logger.debug('joinRoom', `User already in room: ${room}`);
    }
  }

  /**
   * ==========================================================
   * OPEN CREATE ROOM POPUP
   * Opens the create room popup with proper DOM timing.
   * ==========================================================
   */
  openCreateRoomPopup(): void {
    this.isOpenCreateRoom = true;
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      const input = document.querySelector(
        'input[ng-reflect-model="newRoomName"]'
      ) as HTMLInputElement;
      input?.focus();
    });
  }

  /**
   * ==========================================================
   * OPEN JOIN SESSION POPUP
   * Opens the join session popup with proper DOM timing.
   * ==========================================================
   */
  openJoinSessionPopup(): void {
    this.isOpenJoinSessionPopup = true;
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      const input = document.querySelector(
        'input[ng-reflect-model="newSessionCode"]'
      ) as HTMLInputElement;
      input?.focus();
    });
  }

  /**
   * ==========================================================
   * OPEN END SESSION POPUP
   * Opens the end session popup with proper DOM timing.
   * ==========================================================
   */
  openEndSessionPopup(): void {
    this.isOpenEndSessionPopup = true;
    this.cdr.detectChanges();
  }

  /**
   * ==========================================================
   * CLOSE POPUP
   * Closes any popup with proper DOM timing.
   * ==========================================================
   */
  closePopup(popupType: 'create' | 'join' | 'end' | 'qr'): void {
    requestAnimationFrame(() => {
      switch (popupType) {
        case 'create':
          this.isOpenCreateRoom = false;
          this.newRoomName = '';
          break;
        case 'join':
          this.isOpenJoinSessionPopup = false;
          this.newSessionCode = '';
          break;
        case 'end':
          this.isOpenEndSessionPopup = false;
          break;
        case 'qr':
          this.isOpenQRCodePopup = false;
          break;
      }
      this.cdr.detectChanges();
    });
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
      this.ngZone.run(() => {
        this.newRoomName = '';
        requestAnimationFrame(() => {
          this.isOpenCreateRoom = false;
          this.cdr.detectChanges();
        });
      });
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
        this.ngZone.run(() => {
          this.showSessionInfo = true;
          const code = res.code;
          this.openChatSession(code);
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.logger.error('createPrivateSession', 'Failed to create new session code:', err);
        this.toaster.error(this.translate.instant('SESSION_CREATION_FAILED'));
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
    this.ngZone.run(() => {
      this.showSessionInfo = true;
      this.cdr.detectChanges();
    });
    if (!code) {
      this.logger.error('joinPrivateSession', 'Session code is required to join a session.');
      return;
    }

    if (!this.isValidSessionCode(code)) {
      this.logger.error('joinPrivateSession', 'Invalid session code format');
      this.toaster.error(this.translate.instant('INVALID_SESSION_CODE_FORMAT'));
      return;
    }

    requestAnimationFrame(() => {
      this.isOpenJoinSessionPopup = false;
      this.newSessionCode = '';
      this.cdr.detectChanges();
      this.openChatSession(code);
    });
  }

  /**
   * ==========================================================
   * END SESSION
   * Navigates to an existing session code entered by the user.
   * ==========================================================
   */
  endSession(): void {
    requestAnimationFrame(() => {
      this.isOpenEndSessionPopup = false;
      this.cdr.detectChanges();
      this.clearSessionCode();
      this.wsConnectionService.disconnect();
      this.toaster.success(this.translate.instant('SESSION_ENDED_SUCCESS'));
      this.router.navigate([`/`]);
    });
  }

  /**
   * ==========================================================
   * VALIDATE SESSION CODE
   * Validates that the session code contains only allowed characters
   * ==========================================================
   */
  private isValidSessionCode(code: string): boolean {
    const sessionCodeRegex = /^[a-zA-Z0-9]+$/;
    return sessionCodeRegex.test(code) && code.length === 10;
  }

  /**
   * ==========================================================
   * OPEN CHAT SESSION
   * Redirects the user to /private/:code in the same browser tab.
   * ==========================================================
   */
  private openChatSession(code: string): void {
    if (!this.isValidSessionCode(code)) {
      this.logger.error('openChatSession', 'Invalid session code format, navigation aborted');
      this.toaster.error(this.translate.instant('INVALID_SESSION_CODE_FORMAT'));
      return;
    }

    if (this.SessionCode) {
      // Close all WebRTC connections
      this.webrtcService.closeAllConnections();

      // Clear all state
      this.clearSessionCode();
      this.clearMessages();
      this.members = [];
      this.rooms = [];
      this.activeUploads = [];
      this.activeDownloads = [];
      this.incomingFiles = [];

      // Disconnect WebSocket
      this.wsConnectionService.disconnect();

      // Reset room to default
      this.currentRoom = 'main';
    }

    if (isPlatformBrowser(this.platformId)) {
      this.logger.debug('openChatSession', `Opening chat session with code: ${code}`);
      this.ngZone.run(() => {
        this.isNavigatingIntentionally = true;
        this.cdr.detectChanges();
      });

      const sanitizedCode = this.sanitizeSessionCode(code);
      localStorage.setItem(SESSION_CODE_KEY, sanitizedCode);

      setTimeout(() => {
        window.open(`/private/${sanitizedCode}`, '_self');
      }, NAVIGATION_DELAY_MS);
    }
  }

  /**
   * ==========================================================
   * SANITIZE SESSION CODE
   * Removes any potentially dangerous characters from the session code
   * ==========================================================
   */
  private sanitizeSessionCode(code: string): string {
    return code.replace(/[^a-zA-Z0-9]/g, '');
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
        this.logger.error('copySessionCode', 'Failed to copy session code:', err);
        this.toaster.error(this.translate.instant('COPY_SESSION_FAILED'));
      }
    );
  }

  /**
   * ==========================================================
   * GET SESSION URL
   * Returns the full URL for the current session.
   * ==========================================================
   */
  private getSessionUrl(): string {
    if (!this.SessionCode) {
      return '';
    }

    const sessionUrl = `${window.location.origin}/private/${this.SessionCode}`;
    return sessionUrl;
  }

  /**
   * ==========================================================
   * GENERATE QR CODE
   * Generates a QR code for the current session URL.
   * ==========================================================
   */
  private async generateQRCode(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (!this.SessionCode || !this.qrCodeContainer) {
      return;
    }

    try {
      this.isGeneratingQRCode = true;
      this.cdr.detectChanges();

      const sessionUrl = this.getSessionUrl();
      const qrCodeElement = this.qrCodeContainer.nativeElement;
      const isMobile = window.innerWidth < 640;
      while (qrCodeElement.firstChild) {
        qrCodeElement.removeChild(qrCodeElement.firstChild);
      }

      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, sessionUrl, {
        width: isMobile ? 180 : 220,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      qrCodeElement.appendChild(canvas);
      this.logger.info('generateQRCode', 'QR code generated successfully');
    } catch (error) {
      this.logger.error('generateQRCode', 'Failed to generate QR code:', error);
      this.toaster.error(this.translate.instant('QR_CODE_GENERATION_FAILED'));
    } finally {
      this.isGeneratingQRCode = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * ==========================================================
   * OPEN QR CODE POPUP
   * Opens the QR code popup and generates the QR code.
   * ==========================================================
   */
  async openQRCodePopup(): Promise<void> {
    this.isOpenQRCodePopup = true;
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      this.generateQRCode();
    });
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
      localStorage.removeItem(SESSION_CODE_KEY);
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
   * WAIT FOR FILE TRANSFER CONNECTION
   * Waits for WebRTC connection to be ready for file transfer with retry logic
   * ==========================================================
   */
  private async waitForFileTransferConnection(member: string): Promise<boolean> {
    const maxRetries = 50; // 5 seconds total (50 * 100ms)
    let retryCount = 0;

    while (retryCount < maxRetries) {
      if (this.webrtcService.isReadyForFileTransfer(member)) {
        return true;
      }

      if (!this.webrtcService.isConnectedOrConnecting(member)) {
        this.webrtcService.initiateConnection(member);
      }

      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.toaster.warning(
      this.translate.instant('CONNECTION_TIMEOUT_WITH_USER', { userName: member })
    );
    return false;
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

    setTimeout(() => {
      otherMembers.forEach((member) => {
        this.webrtcService.initiateConnection(member);
      });
    }, 1000);
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
    return document.dir === 'rtl' || this.currentLanguage === 'ar';
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
        this.ngZone.run(() => {
          this.isEmojiPickerVisible = false;
          this.cdr.detectChanges();
        });
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
    if (event.emoji.native) {
      this.ngZone.run(() => {
        this.message += event.emoji.native;
        this.isEmojiPickerVisible = false;
        this.cdr.detectChanges();
        this.emojiPickerTimeout = setTimeout(() => {
          if (this.messageInput?.nativeElement) {
            this.messageInput.nativeElement.focus();
          }
        }, 100);
      });
    }
  }

  /**
   * ==========================================================
   * SHOW SeSSION INFO
   * Dismisses the session info banner.
   * ==========================================================
   */
  dismissSessionInfo(): void {
    this.ngZone.run(() => {
      this.showSessionInfo = false;
      this.cdr.detectChanges();
    });
  }

  /**
   * ==========================================================
   * HANDLE DRAG ENTER
   * Manages the drag enter state
   * ==========================================================
   */
  protected handleDragEnter(): void {
    if (!this.isDragging) {
      this.ngZone.run(() => {
        this.isDragging = true;
        this.cdr.detectChanges();
      });
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
      this.ngZone.run(() => {
        this.isDragging = false;
        this.cdr.detectChanges();
      });
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
    const otherMembers = this.members.filter((m) => m !== this.userService.user);

    if (otherMembers.length === 0) {
      this.toaster.info(this.translate.instant('NO_USERS_FOR_UPLOAD'));
      return;
    }

    this.ngZone.run(() => {
      this.isDragging = false;
      this.cdr.detectChanges();
    });
    if (!event.dataTransfer?.files) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    // Create chat messages for each file being sent
    await this.createAndSendFileMessages(files, otherMembers);

    // First prepare all files for all members
    for (const fileToSend of files) {
      for (const member of otherMembers) {
        await this.fileTransferService.prepareFileForSending(fileToSend, member);
        if (!this.webrtcService.isConnectedOrConnecting(member)) {
          this.logger.info('handleDrop', `Initiating connection to ${member} for file transfer`);
          this.webrtcService.initiateConnection(member);
        }
      }
    }

    // Then send all file offers once per member
    for (const member of otherMembers) {
      const connectionReady = await this.waitForFileTransferConnection(member);

      if (connectionReady) {
        await this.fileTransferService.sendAllFileOffers(member);
        this.logger.debug('handleDrop', `Sent ${files.length} files to ${member}`);
      }
    }
  }
}

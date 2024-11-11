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
} from '@angular/core';
import { Subscription } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

import { ThemeService } from '../../core/services/theme.service';
import { ChatService } from '../../core/services/chat.service';
import { RoomService } from '../../core/services/room.service';
import { FileTransferService } from '../../core/services/file-transfer.service';
import { WebRTCService } from '../../core/services/webrtc.service';
import { LoggerService } from '../../core/services/logger.service';
import { WebSocketConnectionService } from '../../core/services/websocket-connection.service';
import { UserService } from '../../core/services/user.service';
import { take } from 'rxjs/operators';
import { NgForm } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FlowbiteService } from '../../core/services/flowbite.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  message = '';
  newRoomName = '';

  messages: string[] = [];
  rooms: string[] = [];
  members: string[] = [];

  currentRoom = 'main';
  isDarkMode = false;

  activeUploads: any[] = [];
  activeDownloads: any[] = [];
  incomingFiles: any[] = [];

  private subscriptions: Subscription[] = [];

  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  constructor(
    public userService: UserService,
    private chatService: ChatService,
    private roomService: RoomService,
    private fileTransferService: FileTransferService,
    private webrtcService: WebRTCService,
    private wsConnectionService: WebSocketConnectionService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private snackBar: MatSnackBar,
    private flowbiteService: FlowbiteService,
    private translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.translate.setDefaultLang('en');

    const browserLang = this.translate.getBrowserLang() || 'en';
    const languageToUse = browserLang.match(/en|ar/) ? browserLang : 'en';
    this.translate.use(languageToUse);
  }

  ngOnInit(): void {
    this.flowbiteService.loadFlowbite(() => {
      this.logger.debug(`Flowbite loaded`);
    });

    this.subscriptions.push(
      this.userService.user$.subscribe((username) => {
        if (username) {
          this.logger.info(`Username is set to: ${username}`);
          this.initializeChat();
        }
      })
    );

    if (isPlatformBrowser(this.platformId)) {
      const themePreference = localStorage.getItem('themePreference');
      this.isDarkMode = themePreference === 'dark';
      this.applyTheme(this.isDarkMode);
    }
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
      this.chatService.messages$.subscribe((messages) => {
        this.messages = messages;
        this.cdr.detectChanges();
        this.scrollToBottom();
      })
    );

    this.subscriptions.push(
      this.roomService.rooms$.subscribe((rooms) => {
        this.rooms = rooms;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.roomService.members$.subscribe((members) => {
        this.members = members;
        this.cdr.detectChanges();
        this.initiateConnectionsWithMembers();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.activeUploads$.subscribe((uploads) => {
        this.activeUploads = uploads;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.activeDownloads$.subscribe((downloads) => {
        this.activeDownloads = downloads;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.incomingFileOffers$.subscribe((incomingFiles) => {
        this.incomingFiles = incomingFiles;
        this.cdr.detectChanges();
      })
    );
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.connect();
      this.cdr.detectChanges();
      this.messageInput.nativeElement.focus();
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.setThemePreference(this.isDarkMode);
    this.applyTheme(this.isDarkMode);
  }

  private applyTheme(isDarkMode: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      if (isDarkMode) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
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
        this.logger.error(`WebSocket connection failed: ${error}`);
      });
  }

  sendMessage(messageForm: NgForm): void {
    if (this.message && this.message.trim()) {
      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      otherMembers.forEach((member) => {
        this.logger.info(`Sending message to ${member}`);
        this.chatService.sendMessage(this.message, member);
      });

      this.message = '';
      messageForm.resetForm();
      this.scrollToBottom();
    } else {
      if (isPlatformBrowser(this.platformId)) {
        this.messageInput.nativeElement.focus();
      }
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

          this.webrtcService.dataChannelOpen$.pipe(take(1)).subscribe((isOpen) => {
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

  listRooms(): void {
    this.roomService.listRooms();
  }

  joinRoom(room: string): void {
    if (room !== this.currentRoom) {
      this.roomService.joinRoom(room);
      this.currentRoom = room;
    }
  }

  createRoom(): void {
    if (this.newRoomName.trim() && this.newRoomName !== this.currentRoom) {
      this.joinRoom(this.newRoomName.trim());
      this.newRoomName = '';
    }
  }

  isMyMessage(msg: string): boolean {
    return msg.startsWith(this.userService.user);
  }

  isMyUser(member: string): boolean {
    return member.trim() === this.userService.user.trim();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.webrtcService.closeAllConnections();
  }

  private initiateConnectionsWithMembers(): void {
    this.logger.info('Initiating connections with other members');
    const otherMembers = this.members.filter((m) => m !== this.userService.user);
    otherMembers.forEach((member, index) => {
      setTimeout(() => {
        if (this.userService.user < member) {
          this.webrtcService.initiateConnection(member);
        }
      }, index * 1000);
    });
  }

  public pauseUpload(transfer: any): void {
    this.fileTransferService.pauseTransfer(transfer.targetUser);
  }

  public resumeUpload(transfer: any): void {
    this.fileTransferService.resumeTransfer(transfer.targetUser);
  }

  public cancelUpload(transfer: any): void {
    this.fileTransferService.cancelTransfer(transfer.targetUser);
  }

  private scrollToBottom(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        this.messageContainer.nativeElement.scrollTop =
          this.messageContainer.nativeElement.scrollHeight;
      } catch (err) {
        this.logger.error(`Could not scroll to bottom: ${err}`);
      }
    }
  }
}

import {
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  AfterViewInit,
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

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  message = '';
  newRoomName = '';
  uploadProgress = 0;
  downloadProgress = 0;

  messages: string[] = [];
  rooms: string[] = [];
  members: string[] = [];

  currentRoom = 'main';
  isDarkMode = false;

  incomingFile: { fileName: string; fileSize: number } | null = null;
  private subscriptions: Subscription[] = [];

  constructor(
    private chatService: ChatService,
    private roomService: RoomService,
    private fileTransferService: FileTransferService,
    private webrtcService: WebRTCService,
    private wsConnectionService: WebSocketConnectionService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private userService: UserService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
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

  private initializeChat() {
    this.subscriptions.push(
      this.chatService.messages$.subscribe((messages) => {
        this.messages = messages;
        this.cdr.detectChanges();
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
      this.fileTransferService.uploadProgress$.subscribe((progress) => {
        this.uploadProgress = progress;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.downloadProgress$.subscribe((progress) => {
        this.downloadProgress = progress;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.fileTransferService.incomingFile$.subscribe((fileInfo) => {
        this.incomingFile = fileInfo;
        this.cdr.detectChanges();
      })
    );
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.connect();
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.setThemePreference(this.isDarkMode);
    this.applyTheme(this.isDarkMode);
  }

  private applyTheme(isDarkMode: boolean): void {
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);
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

  sendMessage(): void {
    const otherMembers = this.members.filter((m) => m !== this.userService.user);
    otherMembers.forEach((member) => {
      this.logger.info(`Sending message to ${member}`);
      if (this.message.trim()) {
        this.chatService.sendMessage(this.message, member);
      }
    });
    this.message = '';
  }

  sendAttachments(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const fileToSend = input.files[0];

      const otherMembers = this.members.filter((m) => m !== this.userService.user);
      if (otherMembers.length === 0) {
        alert('No other users available to send the file.');
        return;
      }
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
      input.value = '';
    }
  }

  public acceptIncomingFile(): void {
    this.fileTransferService.startSavingFile();
    this.incomingFile = null;
  }

  public declineIncomingFile(): void {
    this.incomingFile = null;
    this.fileTransferService.incomingFile$.next(null);

    const fromUser = this.fileTransferService.incomingFile$.value?.fromUser;
    if (fromUser) {
      const message = {
        type: 'file-decline',
        payload: {},
      };
      this.webrtcService.sendData(message, fromUser);
    }
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
}

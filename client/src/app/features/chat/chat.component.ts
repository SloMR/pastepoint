import {
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID, AfterViewInit,
} from "@angular/core";
import { Subscription } from "rxjs";
import { isPlatformBrowser } from "@angular/common";

import { ThemeService } from "../../core/services/theme.service";
import { WebsocketService } from "../../core/services/websocket.service";
import { LoggerService } from "../../core/services/logger.service";

@Component({
  selector: "app-chat",
  templateUrl: "./chat.component.html",
  styleUrls: ["./chat.component.css"],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  message = "";
  newRoomName = "";
  uploadProgress = 0;
  downloadProgress = 0;

  messages: string[] = [];
  rooms: string[] = [];
  members: string[] = [];

  currentRoom = "main";
  isDarkMode = false;

  private messageSubscription: Subscription = new Subscription();
  private roomSubscription: Subscription = new Subscription();
  private membersSubscription: Subscription = new Subscription();
  private progressSubscription: Subscription = new Subscription();

  constructor(
    private chatService: WebsocketService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    this.messageSubscription = this.chatService.message$.subscribe({
      next: (message) => {
        if (message.trim()) {
          this.messages.push(message);
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error("WebSocket error:", error);
      },
      complete: () => {
        console.warn("WebSocket connection closed");
      },
    });

    this.roomSubscription = this.chatService.rooms$.subscribe({
      next: (room) => {
        this.rooms = room;
      },
      error: (error) => {
        console.error("WebSocket error:", error);
      },
      complete: () => {
        console.warn("WebSocket connection closed");
      },
    });

    this.membersSubscription = this.chatService.members$.subscribe({
      next: (member) => {
        this.members = member;
      },
      error: (error) => {
        console.error("WebSocket error:", error);
      },
      complete: () => {
        console.warn("WebSocket connection closed");
      },
    });

    this.progressSubscription = this.chatService.uploadProgress$.subscribe({
      next: (progress) => {
        this.uploadProgress = progress;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error("WebSocket error:", error);
      },
      complete: () => {
        console.warn("WebSocket connection closed");
      },
    });

    this.progressSubscription.add(
      this.chatService.downloadProgress$.subscribe({
        next: (progress) => {
          this.downloadProgress = progress;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error("Download Progress error:", error);
        },
      })
    );

    if (isPlatformBrowser(this.platformId)) {
      const themePreference = localStorage.getItem("themePreference");
      this.isDarkMode = themePreference === "dark";
    }
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
    document.body.classList.toggle("dark-mode", isDarkMode);
    document.body.classList.toggle("light-mode", !isDarkMode);
  }

  connect(): void {
    this.chatService
      .connect()
      .then(() => {
        this.listRooms();
      })
      .catch((error) => {
        console.error("WebSocket connection failed:", error);
      });
  }

  sendMessage(): void {
    if (this.message.trim()) {
      const userMessage = "[UserMessage] " + this.message.trim();
      this.chatService.sendMessage(userMessage);
      this.message = "";
    }
  }

  sendAttachments(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.chatService.sendAttachments(input.files);
      input.value = "";
    }
  }

  listRooms(): void {
    this.logger.log("Listing rooms");
    this.chatService.listRooms();
  }

  joinRoom(room: string): void {
    if (room !== this.currentRoom) {
      this.chatService.joinRoom(room);
      this.currentRoom = room;
    }
  }

  createRoom(): void {
    if (this.newRoomName.trim() && this.newRoomName !== this.currentRoom) {
      this.joinRoom(this.newRoomName.trim());
      this.newRoomName = "";
    }
  }

  isMyMessage(msg: string): boolean {
    return msg.startsWith(this.chatService.user);
  }

  isMyUser(member: string): boolean {
    return member.trim() === this.chatService.user.trim();
  }

  ngOnDestroy(): void {
    this.messageSubscription.unsubscribe();
    this.roomSubscription.unsubscribe();
    this.progressSubscription.unsubscribe();
    this.membersSubscription.unsubscribe();
  }
}

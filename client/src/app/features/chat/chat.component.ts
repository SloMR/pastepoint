import {Component, Inject, OnDestroy, OnInit, PLATFORM_ID} from '@angular/core';
import {Subscription} from 'rxjs';
import {isPlatformBrowser} from "@angular/common";

import {ThemeService} from "../../core/services/theme.service";
import {WebsocketService} from "../../core/services/websocket.service";

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy {
  message: string = '';

  messages: string[] = [];
  rooms: string[] = [];

  newRoomName: string = '';
  currentRoom: string = 'main';
  isDarkMode: boolean = false;

  private messageSubscription: Subscription = new Subscription();
  private roomSubscription: Subscription = new Subscription();

  constructor(
    private chatService: WebsocketService,
    private themeService: ThemeService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
  }

  ngOnInit(): void {
    this.messageSubscription = this.chatService.message$.subscribe({
      next: (message) => {
        if (message.trim()) {
          this.messages.push(message);
        }
      }, error: (error) => {
        console.error('WebSocket error:', error);
      }, complete: () => {
        console.warn('WebSocket connection closed');
      }
    })
    this.roomSubscription = this.chatService.rooms$.subscribe({
      next: (room) => {
        this.rooms = room;
      }, error: (error) => {
        console.error('WebSocket error:', error);
      }, complete: () => {
        console.warn('WebSocket connection closed');
      }
    })

    if (isPlatformBrowser(this.platformId)) {
      const themePreference = localStorage.getItem('themePreference');
      this.isDarkMode = themePreference === 'dark';
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
  }

  connect(): void {
    this.chatService.connect()
      .then(() => {
        this.listRooms();
      })
      .catch((error) => {
        console.error('WebSocket connection failed:', error);
      });
  }

  sendMessage(): void {
    if (this.message.trim()) {
      this.chatService.sendMessage(this.message.trim());
      this.message = '';
    }
  }

  sendAttachment(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.chatService.sendAttachment(file);
      input.value = '';
    }
  }

  listRooms(): void {
    console.log('Listing rooms');
    this.chatService.listRooms()
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
      this.newRoomName = '';
    }
  }

  ngOnDestroy(): void {
    this.messageSubscription.unsubscribe();
    this.roomSubscription.unsubscribe();
  }
}
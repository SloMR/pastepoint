import {Component, Inject, OnDestroy, OnInit, PLATFORM_ID} from '@angular/core';
import {WebsocketService} from "../../core/services/websocket.service";
import {Subscription} from 'rxjs';
import {isPlatformBrowser} from "@angular/common";

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
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.connect();
    }

  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
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

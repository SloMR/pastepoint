import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChatService } from '../chat.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy {
  message: string = '';
  messages: string[] = [];
  private messageSubscription: Subscription = new Subscription();

  constructor(
    private chatService: ChatService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.messageSubscription = this.chatService.message$.subscribe(
      (message) => {
        this.messages.push(message);
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => {
            const logElement = document.getElementById('log');
            if (logElement) {
              logElement.scrollTop = logElement.scrollHeight;
            }
          }, 100);
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
      },
      () => {
        console.warn('WebSocket connection closed');
      }
    );
  }

  connect(): void {
    this.chatService.connect();
  }

  disconnect(): void {
    this.chatService.disconnect();
  }

  sendMessage(): void {
    this.chatService.sendMessage(this.message);
    this.message = '';
  }

  ngOnDestroy(): void {
    this.messageSubscription.unsubscribe();
  }
}

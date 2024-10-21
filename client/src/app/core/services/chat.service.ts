import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebSocketConnectionService } from './websocket-connection.service';
import { WebRTCService } from './webrtc.service';
import { UserService } from './user.service';
import {DATA_CHANNEL_MESSAGE_TYPES} from "../../utils/constants";

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  public messages$ = new BehaviorSubject<string[]>([]);
  private messages: string[] = [];

  constructor(
    private logger: LoggerService,
    private wsService: WebSocketConnectionService,
    private webrtcService: WebRTCService,
    private userService: UserService
  ) {
    this.webrtcService.chatMessages$.subscribe((message) => {
      this.handleUserMessage(message);
    });

    this.wsService.systemMessages$.subscribe((message) => {
      this.handleSystemMessage(message);
    });
  }

  public get user(): string {
    return this.userService.user;
  }

  public set user(value: string) {
    this.userService.user = value;
  }

  public sendMessage(content: string, targetUser: string): void {
    if (content.trim()) {
      const message = {
        type: DATA_CHANNEL_MESSAGE_TYPES.CHAT,
        payload: `${this.user}: ${content.trim()}`,
      };
      this.webrtcService.sendData(message, targetUser);
      this.messages.push(`${this.user}: ${content.trim()}`);
      this.messages$.next(this.messages);
    }
  }

  private handleUserMessage(message: string): void {
    this.messages.push(message);
    this.messages$.next(this.messages);
  }

  private handleSystemMessage(message: string): void {
    if (message.includes('[SystemName]')) {
      const matchName = message.match(/\[SystemName\]\s*(.*?)$/);
      if (matchName && matchName[1]) {
        const userName = matchName[1].trim();
        this.logger.info(`Username updated from: ${this.user}, to: ${userName}`);
        this.user = userName;
      }
    }
  }

  public getUsername(): void {
    this.wsService.send('[UserCommand] /name');
  }
}

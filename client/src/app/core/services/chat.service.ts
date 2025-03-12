import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WebSocketConnectionService } from './websocket-connection.service';
import { WebRTCService } from './webrtc.service';
import { UserService } from './user.service';
import { ChatMessage, DATA_CHANNEL_MESSAGE_TYPES } from '../../utils/constants';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  public messages$ = new BehaviorSubject<ChatMessage[]>([]);
  private messages: ChatMessage[] = [];

  constructor(
    private wsService: WebSocketConnectionService,
    private webrtcService: WebRTCService,
    private userService: UserService,
    private logger: NGXLogger
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
      const chatMsg: ChatMessage = {
        from: this.user,
        text: content.trim(),
        timestamp: new Date(),
      };

      const dataChannelMsg = {
        type: DATA_CHANNEL_MESSAGE_TYPES.CHAT,
        payload: chatMsg,
      };
      this.webrtcService.sendData(dataChannelMsg, targetUser);

      const alreadyExists = this.messages.find(
        (m) => m.from === chatMsg.from && m.text === chatMsg.text
      );
      if (!alreadyExists) {
        this.messages.push(chatMsg);
        this.messages$.next(this.messages);
      } else {
        this.logger.warn('sendMessage', `Message already exists: ${chatMsg.text}`);
      }
    } else {
      this.logger.warn('sendMessage', 'Empty message content');
    }
  }

  private handleUserMessage(incoming: ChatMessage): void {
    this.messages.push(incoming);
    this.messages$.next(this.messages);
  }

  private handleSystemMessage(message: string): void {
    if (message.includes('[SystemName]')) {
      const matchName = message.match(/\[SystemName]\s*(.*?)$/);
      if (matchName && matchName[1]) {
        const userName = matchName[1].trim();
        this.logger.info(
          'handleSystemMessage',
          `Username updated from: ${this.user}, to: ${userName}`
        );
        this.user = userName;
      } else {
        this.logger.warn('handleSystemMessage', `No username found in message: ${message}`);
      }
    }
  }

  public getUsername(): void {
    this.wsService.send('[UserCommand] /name');
  }

  public clearMessages(): void {
    this.messages = [];
    this.messages$.next(this.messages);
  }
}

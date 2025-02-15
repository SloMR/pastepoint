import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebSocketConnectionService } from './websocket-connection.service';
import { WebRTCService } from './webrtc.service';
import { UserService } from './user.service';
import { ChatMessage, DATA_CHANNEL_MESSAGE_TYPES } from '../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private _logger: ReturnType<LoggerService['create']> | undefined;

  public messages$ = new BehaviorSubject<ChatMessage[]>([]);
  private messages: ChatMessage[] = [];

  private get logger() {
    if (!this._logger) {
      this._logger = this.loggerService.create('ChatService');
    }
    return this._logger;
  }

  constructor(
    private loggerService: LoggerService,
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
      }
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

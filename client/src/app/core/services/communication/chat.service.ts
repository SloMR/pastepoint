import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WebRTCService } from './webrtc.service';
import { UserService } from '../user-management/user.service';
import { ChatMessage, ChatMessageType, DATA_CHANNEL_MESSAGE_TYPES } from '../../../utils/constants';
import { IChatService } from '../../interfaces/chat.interface';
import { WebSocketConnectionService } from './websocket-connection.service';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class ChatService implements IChatService {
  /**
   * ==========================================================
   * PROPERTIES & OBSERVABLES
   * BehaviorSubject for message state and private message storage
   * ==========================================================
   */
  public messages$ = new BehaviorSubject<ChatMessage[]>([]);
  private messages: ChatMessage[] = [];

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection and subscription setup
   * ==========================================================
   */
  constructor(
    private wsService: WebSocketConnectionService,
    private webrtcService: WebRTCService,
    private userService: UserService,
    private logger: NGXLogger,
    private ngZone: NgZone
  ) {
    this.webrtcService.chatMessages$.subscribe((message) => {
      this.handleUserMessage(message);
    });

    this.wsService.systemMessages$.subscribe((message) => {
      this.handleSystemMessage(message);
    });
  }

  /**
   * ==========================================================
   * USER MANAGEMENT
   * Getter and setter for the current user
   * ==========================================================
   */
  public get user(): string {
    return this.userService.user;
  }

  public set user(value: string) {
    this.userService.user = value;
  }

  /**
   * ==========================================================
   * PUBLIC METHODS
   * Methods for sending messages and managing chat state
   * ==========================================================
   */

  /**
   * Sends message data only to target user without adding to local messages
   * @param content Message content
   * @param targetUser Target user to send to
   * @param messageType Type of message (default: TEXT)
   */
  public async sendMessage(
    content: string,
    targetUser: string,
    messageType: ChatMessageType = ChatMessageType.TEXT
  ): Promise<void> {
    if (content.trim()) {
      const chatMsg: ChatMessage = {
        from: this.user,
        text: content.trim(),
        type: messageType,
        timestamp: new Date(),
      };

      const dataChannelMsg = {
        type: DATA_CHANNEL_MESSAGE_TYPES.CHAT,
        payload: chatMsg,
      };
      this.webrtcService.sendData(dataChannelMsg, targetUser);
      this.logger.info('sendMessage', `Message sent to ${targetUser}: ${chatMsg.text}`);
    } else {
      this.logger.warn('sendMessage', 'Empty message content');
    }
  }

  /**
   * Adds a message to local chat only (UI display)
   * @param content Message content
   * @param messageType Type of message (default: TEXT)
   */
  public addMessageToLocal(
    content: string,
    messageType: ChatMessageType = ChatMessageType.TEXT
  ): void {
    if (content.trim()) {
      const chatMsg: ChatMessage = {
        from: this.user,
        text: content.trim(),
        type: messageType,
        timestamp: new Date(),
      };

      this.ngZone.run(() => {
        this.messages.push(chatMsg);
        this.messages$.next(this.messages);
      });
      this.logger.info('addMessageToLocal', `Message added to local chat: ${chatMsg.text}`);
    }
  }

  public getUsername(): void {
    this.wsService.send('[UserCommand] /name');
  }

  public clearMessages(): void {
    this.ngZone.run(() => {
      this.messages = [];
      this.messages$.next(this.messages);
    });
  }

  /**
   * ==========================================================
   * PRIVATE METHODS
   * Handlers for incoming messages
   * ==========================================================
   */
  private handleUserMessage(incoming: ChatMessage): void {
    this.ngZone.run(() => {
      this.messages.push(incoming);
      this.messages$.next(this.messages);
    });
  }

  private handleSystemMessage(message: string): void {
    if (message.includes('[SystemName]')) {
      const matchName = message.match(/\[SystemName]\s*(.*?)$/);
      if (matchName?.[1]) {
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
}

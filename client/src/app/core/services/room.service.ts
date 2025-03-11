import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebSocketConnectionService } from './websocket-connection.service';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private _logger: ReturnType<LoggerService['create']> | undefined;

  public rooms$ = new BehaviorSubject<string[]>([]);
  public members$ = new BehaviorSubject<string[]>([]);
  public currentRoom = 'main';

  constructor(
    private loggerService: LoggerService,
    private wsService: WebSocketConnectionService
  ) {
    this.wsService.systemMessages$.subscribe((message) => {
      this.handleSystemMessage(message);
    });
  }

  private get logger() {
    if (!this._logger) {
      this._logger = this.loggerService.create('RoomService');
    }
    return this._logger;
  }

  public listRooms(): void {
    this.logger.info('listRooms', 'Listing rooms');
    this.wsService.send('[UserCommand] /list');
  }

  public joinRoom(room: string): void {
    if (room !== this.currentRoom) {
      this.wsService.send(`[UserCommand] /join ${room}`);
      this.currentRoom = room;
    } else {
      this.logger.warn('joinRoom', `Already in room: ${room}`);
    }
  }

  private handleSystemMessage(message: string): void {
    if (message.includes('[SystemRooms]')) {
      const matchRooms = message.match(/\[SystemRooms]\s*(.*?)$/);
      if (matchRooms) {
        const rooms = matchRooms[1].split(',').map((room: string) => room.trim());
        this.rooms$.next(rooms);
      } else {
        this.logger.warn('handleSystemMessage', `No rooms found in message: ${message}`);
      }
    } else if (message.includes('[SystemMembers]')) {
      const matchMembers = message.match(/\[SystemMembers]\s*(.*?)$/);
      if (matchMembers) {
        const members = matchMembers[1].split(',').map((member: string) => member.trim());
        this.members$.next(members);
      } else {
        this.logger.warn('handleSystemMessage', `No members found in message: ${message}`);
      }
    } else if (message.includes('[SystemJoin]')) {
      const matchJoin = message.match(/^(.*?)\s*\[SystemJoin]\s*(.*?)$/);
      if (matchJoin) {
        this.logger.info('handleSystemMessage', `User joined room ${matchJoin[2]}`);
        this.currentRoom = matchJoin[2];
      } else {
        this.logger.warn('handleSystemMessage', `No room to join found in message: ${message}`);
      }
    }
  }
}

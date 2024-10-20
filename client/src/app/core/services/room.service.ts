import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from './logger.service';
import { WebSocketConnectionService } from './websocket-connection.service';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  public rooms$ = new BehaviorSubject<string[]>([]);
  public members$ = new BehaviorSubject<string[]>([]);
  public currentRoom = 'main';

  constructor(
    private logger: LoggerService,
    private wsService: WebSocketConnectionService
  ) {
    this.wsService.systemMessages$.subscribe((message) => {
      this.handleSystemMessage(message);
    });
  }

  public listRooms(): void {
    this.logger.log('Listing rooms');
    this.wsService.send('[UserCommand] /list');
  }

  public joinRoom(room: string): void {
    if (room !== this.currentRoom) {
      this.wsService.send(`[UserCommand] /join ${room}`);
      this.currentRoom = room;
    }
  }

  private handleSystemMessage(message: string): void {
    if (message.includes('[SystemRooms]')) {
      const matchRooms = message.match(/\[SystemRooms\]:\s*(.*?)$/);
      if (matchRooms) {
        const rooms = matchRooms[1].split(',').map((room: string) => room.trim());
        this.rooms$.next(rooms);
      }
    } else if (message.includes('[SystemMembers]')) {
      const matchMembers = message.match(/\[SystemMembers\]:\s*(.*?)$/);
      if (matchMembers) {
        const members = matchMembers[1].split(',').map((member: string) => member.trim());
        this.members$.next(members);
      }
    } else if (message.includes('[SystemJoin]')) {
      const matchJoin = message.match(/^(.*?)\s*\[SystemJoin\]\s*(.*?)$/);
      if (matchJoin) {
        this.logger.log(`User joined room ${matchJoin[2]}`);
        this.currentRoom = matchJoin[2];
      }
    }
  }
}

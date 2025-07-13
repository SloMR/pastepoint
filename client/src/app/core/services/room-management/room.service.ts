import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WebSocketConnectionService } from '../communication/websocket-connection.service';
import { NGXLogger } from 'ngx-logger';
import { IRoomService } from '../../interfaces/room.interface';

@Injectable({
  providedIn: 'root',
})
export class RoomService implements IRoomService {
  /**
   * ==========================================================
   * PROPERTIES & OBSERVABLES
   * BehaviorSubjects for room and member state
   * ==========================================================
   */
  public rooms$ = new BehaviorSubject<string[]>([]);
  public members$ = new BehaviorSubject<string[]>([]);
  public currentRoom = 'main';

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection and subscription setup
   * ==========================================================
   */
  constructor(
    private wsService: WebSocketConnectionService,
    private logger: NGXLogger,
    private ngZone: NgZone
  ) {
    this.wsService.systemMessages$.subscribe((message) => {
      this.handleSystemMessage(message);
    });
  }

  /**
   * ==========================================================
   * PUBLIC METHODS
   * Methods for room management operations
   * ==========================================================
   */
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

  /**
   * ==========================================================
   * PRIVATE METHODS
   * Handlers for system messages
   * ==========================================================
   */
  private handleSystemMessage(message: string): void {
    if (message.includes('[SystemRooms]')) {
      const matchRooms = message.match(/\[SystemRooms]\s*(.*?)$/);
      if (matchRooms) {
        const rooms = matchRooms[1].split(',').map((room: string) => room.trim());
        this.ngZone.run(() => {
          this.rooms$.next(rooms);
        });
      } else {
        this.logger.warn('handleSystemMessage', `No rooms found in message: ${message}`);
      }
    } else if (message.includes('[SystemMembers]')) {
      const matchMembers = message.match(/\[SystemMembers]\s*(.*?)$/);
      if (matchMembers) {
        const members = matchMembers[1].split(',').map((member: string) => member.trim());
        this.ngZone.run(() => {
          this.members$.next(members);
        });
      } else {
        this.logger.warn('handleSystemMessage', `No members found in message: ${message}`);
      }
    } else if (message.includes('[SystemJoin]')) {
      const matchJoin = message.match(/^(.*?)\s*\[SystemJoin]\s*(.*?)$/);
      if (matchJoin) {
        this.logger.info('handleSystemMessage', `User joined room ${matchJoin[2]}`);
        this.ngZone.run(() => {
          this.currentRoom = matchJoin[2];
        });
      } else {
        this.logger.warn('handleSystemMessage', `No room to join found in message: ${message}`);
      }
    }
  }
}

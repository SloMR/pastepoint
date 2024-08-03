import {Injectable} from '@angular/core';
import {BehaviorSubject} from "rxjs";

import {environment} from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  public message$: BehaviorSubject<string> = new BehaviorSubject('');
  public rooms$: BehaviorSubject<string []> = new BehaviorSubject(['']);

  private socket: WebSocket | undefined;

  private user: string = 'User';
  private room: string = 'main';

  private webSocketProto = 'wss';
  private host = environment.apiUrl;

  private wsUri = `${this.webSocketProto}://${this.host}/ws`;

  constructor() {
  }

  public connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        this.socket = new WebSocket(this.wsUri);

        this.socket.onopen = () => {
          this.log('Connected', false);
          this.log(`User: ${this.user}, joined room: ${this.room}`, false);
          resolve();
        };

        this.socket.onmessage = (ev) => {
          const message = ev.data.trim();
          this.log(`Received: ${message}`, false);

          if (this.isSystemMessage(message)) {
            this.handleSystemMessage(message);
          } else {
            this.handleUserMessage(message);
          }
        };

        this.socket.onclose = () => {
          this.log('Disconnected', false);
        };

        this.socket.onerror = (error) => {
          this.log('WebSocket Error: ' + error, false);
          reject(error);
        };
      }
    );
  }

  public sendMessage(message: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && message.trim()) {
      this.log(`${this.user}: ${message}`, false);
      this.socket.send(message.trim());
    } else {
      this.log('WebSocket is not open or message is empty. Ready state: ' + this.socket?.readyState, false);
    }
  }

  public listRooms(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send('/list');
    } else {
      this.log('WebSocket is not open. Ready state: ' + this.socket?.readyState, false);
    }
  }

  public joinRoom(room: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(`Leaving room: ${this.room}, joining room: ${room}<br>`);
      this.socket.send(`/join ${room}`);
    } else {
      this.log('WebSocket is not open. Ready state: ' + this.socket?.readyState, false);
    }
  }

  private isSystemMessage(message: string): boolean {
    return (
      message.includes('Rooms available:') ||
      message.includes('left the room')
    );
  }

  private handleSystemMessage(message: string): void {
    const match = message.match(/([\w-]+) joined (\w+)/);
    if (match) {
      this.user = match[1];
      this.room = match[2];
      return;
    }

    const matchRooms = message.match(/Rooms available: (.*)/);
    if (matchRooms) {
      this.rooms$.next(matchRooms[1].split(',').map((room: string) => room.trim()));
      return;
    }
  }

  private handleUserMessage(message: string): void {
    if (message.trim()) {
      this.message$.next(`${message}`);
    }
  }

  private log(msg: string, show: boolean): void {
    if (show) {
      this.message$.next(`${msg}`);
    }
    console.log(`[WebSocket] ${msg}`);
  }
}

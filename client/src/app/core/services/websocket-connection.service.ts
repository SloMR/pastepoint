import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from './logger.service';

// WebSocket Message Interface
export interface WebSocketMessage {
  type: string;
  payload: any;
}

@Injectable({
  providedIn: 'root',
})
export class WebSocketConnectionService {
  private socket: WebSocket | undefined;
  private webSocketProto = 'wss';
  private host = environment.apiUrl;
  private wsUri = `${this.webSocketProto}://${this.host}/ws`;

  public messages$ = new BehaviorSubject<string>('');
  public systemMessages$ = new BehaviorSubject<string>('');
  public signalMessages$ = new BehaviorSubject<any>(null);

  constructor(private logger: LoggerService) {}

  public connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = new WebSocket(this.wsUri);

      this.socket.onopen = () => {
        this.logger.info('WebSocket connected');
        resolve();
      };

      this.socket.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const message = ev.data.trim();

          if (message.startsWith('[SignalMessage]')) {
            const signalMessage = JSON.parse(
              message.replace('[SignalMessage]', '').trim()
            );
            this.signalMessages$.next(signalMessage);
          } else if (this.isSystemMessage(message)) {
            this.systemMessages$.next(message);
          } else {
            this.messages$.next(message);
          }
        }
      };

      this.socket.onclose = (event) => {
        this.logger.error(
          `WebSocket disconnected: code ${event.code}, reason ${event.reason}`
        );
        setTimeout(() => this.reconnect(), 1000);
      };

      this.socket.onerror = (error) => {
        this.logger.error('WebSocket error: ' + error);
        reject(error);
      };
    });
  }

  private reconnect() {
    this.logger.warn('Attempting to reconnect WebSocket...');
    this.connect().catch((err) =>
      this.logger.error(`WebSocket reconnection failed: ${err}`)
    );
  }

  public send(message: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    } else {
      this.logger.error('WebSocket is not open. Message not sent.');
    }
  }

  public sendSignalMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const signalMessage = `[SignalMessage] ${JSON.stringify(message)}`;
      this.socket.send(signalMessage);
    }
  }

  private isSystemMessage(message: string): boolean {
    return (
      message.includes('[SystemMessage]') ||
      message.includes('[SystemJoin]') ||
      message.includes('[SystemRooms]') ||
      message.includes('[SystemMembers]') ||
      message.includes('[SystemName]')
    );
  }
}

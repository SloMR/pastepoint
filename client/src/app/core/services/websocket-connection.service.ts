import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class WebSocketConnectionService {
  private _logger: ReturnType<LoggerService['create']> | undefined;

  private socket: WebSocket | undefined;
  private webSocketProto = 'wss';
  private host = environment.apiUrl;

  public messages$ = new BehaviorSubject<string>('');
  public systemMessages$ = new BehaviorSubject<string>('');
  public signalMessages$ = new BehaviorSubject<any>(null);

  private get logger() {
    if (!this._logger) {
      this._logger = this.loggerService.create('WebSocketConnectionService');
    }
    return this._logger;
  }

  constructor(
    private loggerService: LoggerService,
    private router: Router
  ) {}

  public connect(code?: string): Promise<void> {
    if (!code) {
      const urlSegments = window.location.pathname.split('/');
      code = urlSegments.length > 2 ? urlSegments[2] : undefined;
    }

    const wsUri = `${this.webSocketProto}://${this.host}/ws${code ? `/${code}` : ''}`;
    return new Promise<void>((resolve, reject) => {
      this.logger.info('connect', `Connecting to WebSocket at ${wsUri}`);
      this.socket = new WebSocket(wsUri);

      this.socket.onopen = () => {
        this.logger.info('connect', 'WebSocket connected');
        resolve();
      };

      this.socket.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const message = ev.data.trim();

          if (message.startsWith('[SignalMessage]')) {
            const signalMessage = JSON.parse(message.replace('[SignalMessage]', '').trim());
            this.signalMessages$.next(signalMessage);
          } else if (this.isSystemMessage(message)) {
            this.systemMessages$.next(message);
          } else {
            this.messages$.next(message);
          }
        }
      };

      this.socket.onclose = (event) => {
        if (event.code === 1006) {
          this.router.navigate(['/404']).then(() => {
            this.logger.warn(
              'connect',
              `WebSocket closed with code ${event.code}. Navigating to 404.`
            );
          });
        } else {
          // handle normal closure or attempt reconnect
          this.logger.warn('connect', `WebSocket closed with code ${event.code}`);
        }
      };

      this.socket.onerror = (error) => {
        this.logger.error('connect', 'WebSocket error: ' + error);
        reject(error);
      };
    });
  }

  public disconnect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.logger.info('disconnect', 'Closing WebSocket connection.');
      this.socket.close();
      this.socket = undefined;
    }
  }

  public send(message: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    } else {
      this.logger.error('send', 'WebSocket is not open. Message not sent.');
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

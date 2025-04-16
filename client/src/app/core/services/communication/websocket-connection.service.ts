import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Router } from '@angular/router';
import { NGXLogger } from 'ngx-logger';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class WebSocketConnectionService {
  /**
   * ==========================================================
   * PRIVATE PROPERTIES
   * Core WebSocket connection and configuration
   * ==========================================================
   */
  private socket: WebSocket | undefined;
  private webSocketProto = 'wss';
  private host = environment.apiUrl;
  private sessionCode: string | undefined;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimer: any;
  private manualDisconnect = false;
  private isConnecting = false;

  /**
   * ==========================================================
   * PUBLIC OBSERVABLES
   * BehaviorSubjects for communication with other services
   * ==========================================================
   */
  public messages$ = new BehaviorSubject<string>('');
  public systemMessages$ = new BehaviorSubject<string>('');
  public signalMessages$ = new BehaviorSubject<any>(null);

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection
   * ==========================================================
   */
  constructor(
    private router: Router,
    private logger: NGXLogger,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  /**
   * ==========================================================
   * CONNECTION MANAGEMENT
   * Methods for establishing and managing WebSocket connection
   * ==========================================================
   */
  public connect(code?: string): Promise<void> {
    if (this.isConnecting) {
      this.logger.warn('connect', 'Connection already in progress, ignoring duplicate request');
      return Promise.resolve();
    }

    if (this.isConnected() && this.sessionCode === code) {
      this.logger.info('connect', `Already connected to session ${code}, skipping connection`);
      return Promise.resolve();
    }

    if (this.socket) {
      this.logger.info('connect', 'Disconnecting existing connection before creating a new one');
      this.disconnect(true);
      return new Promise((resolve) => {
        setTimeout(() => {
          this.establishConnection(code).then(resolve);
        }, 100);
      });
    }

    return this.establishConnection(code);
  }

  private establishConnection(code?: string): Promise<void> {
    this.isConnecting = true;
    this.manualDisconnect = false;

    if (!code) {
      const urlSegments = window.location.pathname.split('/');
      code = urlSegments.length > 2 ? urlSegments[2] : undefined;
    }

    this.sessionCode = code;

    const wsUri = `${this.webSocketProto}://${this.host}/ws${code ? `/${code}` : ''}`;
    return new Promise<void>((resolve, reject) => {
      this.logger.info('connect', `Connecting to WebSocket at ${wsUri}`);
      this.socket = new WebSocket(wsUri);

      this.socket.onopen = () => {
        this.logger.info('connect', 'WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
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
        } else {
          this.logger.warn('connect', 'Received non-string message from WebSocket');
        }
      };

      this.socket.onclose = (event) => {
        this.isConnecting = false;

        // Only treat 1006 as an invalid session if it's not the first attempt
        if (event.code === 1006 && this.reconnectAttempts > 0) {
          this.logger.warn('connect', 'WebSocket closed: Invalid session code (1006)');
          this.clearSessionCode();
          this.router.navigate(['/404']);
          return;
        }

        if (event.code === 1006) {
          if (!this.manualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            this.logger.warn(
              'connect',
              `WebSocket closed with code ${event.code}. Navigating to 404 after max reconnect attempts.`
            );
            this.router.navigate(['/404']);
          }
        } else {
          this.logger.warn('connect', `WebSocket closed with code ${event.code}`);
          if (!this.manualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        }
      };

      this.socket.onerror = (error) => {
        this.logger.error('connect', 'WebSocket error: ' + error);
        this.isConnecting = false;
        reject(error);
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const currentDelay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.logger.info(
      'scheduleReconnect',
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${currentDelay}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.isConnected()) {
        this.logger.info('scheduleReconnect', 'Already connected, skipping reconnect');
        return;
      } else {
        this.connect(this.sessionCode).catch((error) => {
          this.logger.error('scheduleReconnect', `Reconnect failed: ${error}`);

          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.warn('scheduleReconnect', 'Maximum reconnect attempts reached');
            this.router.navigate(['/404']);
          }
        });
      }
    }, currentDelay);
  }

  private clearSessionCode(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('SessionCode');
    }
    this.sessionCode = undefined;
  }

  public disconnect(isManual: boolean = true): void {
    if (isManual) {
      this.manualDisconnect = true;
      this.clearSessionCode();
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.logger.info('disconnect', 'Closing WebSocket connection.');
      this.socket.close();
      this.socket = undefined;
    } else {
      this.logger.warn('disconnect', 'WebSocket is already closed or not initialized.');
    }
  }

  /**
   * ==========================================================
   * MESSAGE SENDING
   * Methods for sending different types of messages
   * ==========================================================
   */
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
    } else {
      this.logger.error('sendSignalMessage', 'WebSocket is not open. Message not sent.');
    }
  }

  /**
   * ==========================================================
   * UTILITY METHODS
   * Helper methods for WebSocket operations
   * ==========================================================
   */
  private isSystemMessage(message: string): boolean {
    return (
      message.includes('[SystemMessage]') ||
      message.includes('[SystemJoin]') ||
      message.includes('[SystemRooms]') ||
      message.includes('[SystemMembers]') ||
      message.includes('[SystemName]')
    );
  }

  /**
   * Check if the WebSocket connection is currently active
   */
  public isConnected(): boolean {
    return this.socket !== undefined && this.socket.readyState === WebSocket.OPEN;
  }
}

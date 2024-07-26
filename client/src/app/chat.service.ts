import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  public message$: BehaviorSubject<string> = new BehaviorSubject('');
  private socket: WebSocket | undefined;

  constructor() {}

  public connect(): void {
    this.disconnect();

    // const { protocol, host } = window.location;
    // const proto = protocol.startsWith('https') ? 'wss' : 'ws';
    const proto = 'ws';
    const host = '10.10.50.5:9000';
    const wsUri = `${proto}://${host}/ws`;

    this.socket = new WebSocket(wsUri);

    this.socket.onopen = () => {
      this.log('Connected');
      this.updateConnectionStatus(true);
    };

    this.socket.onmessage = (ev) => {
      this.log('Received: ' + ev.data, 'message');
    };

    this.socket.onclose = () => {
      this.log('Disconnected');
      this.updateConnectionStatus(false);
    };
  }

  public disconnect(): void {
    if (this.socket) {
      this.log('Disconnecting...');
      this.socket.close();
      this.updateConnectionStatus(false);
    }
  }

  public sendMessage(message: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.log('Sending: ' + message);
      this.socket.send(message);
    } else {
      this.log('WebSocket is not open. Ready state: ' + this.socket?.readyState, 'error');
    }
  }

  private log(msg: string, type = 'status'): void {
    this.message$.next(`<p class="msg msg--${type}">${msg}</p>`);
  }

  private updateConnectionStatus(isConnected: boolean): void {
    const statusElement = document.getElementById('status');
    const connectButton = document.getElementById('connect');
    const inputElement = document.getElementById('text') as HTMLInputElement;

    if (statusElement && connectButton) {
      if (isConnected) {
        statusElement.style.backgroundColor = 'transparent';
        statusElement.style.color = 'green';
        statusElement.textContent = 'connected';
        connectButton.textContent = 'Disconnect';
        inputElement?.focus();
      } else {
        statusElement.style.backgroundColor = 'red';
        statusElement.style.color = 'white';
        statusElement.textContent = 'disconnected';
        connectButton.textContent = 'Connect';
      }
    }
  }
}

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

  private CHUNK_SIZE = 16 * 1024; // 64 KB per chunk

  private wsUri = `${this.webSocketProto}://${this.host}/ws`;

  constructor() {
  }

  public connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        this.socket = new WebSocket(this.wsUri);

        this.socket.onopen = () => {
          this.log('Connected', false);
          resolve();
        };

        this.socket.onmessage = (ev) => {          
          if (typeof ev.data === 'string') {
            const message = ev.data.trim();

            if (this.isSystemMessage(message)) {
              this.handleSystemMessage(message);
            } else {
              this.handleUserMessage(message);
            }
          } else if (ev.data instanceof Blob) {
            const blob = ev.data;
            this.log(`Received attachment: ${blob.size} bytes`, false);
            return;
          }
        };

        this.socket.onclose = (event) => {
          console.warn('WebSocket closed with code:', event.code, 'reason:', event.reason);
          this.log(`Disconnected with code: ${event.code}, reason: ${event.reason}`, false);
          setTimeout(() => this.reconnect(), 1000); // Attempt to reconnect
        };

        this.socket.onerror = (error) => {
          this.log('WebSocket Error: ' + error, false);
          reject(error);
        };
      }
    );
  }

  private reconnect() {
    console.log('Attempting to reconnect...');
    this.connect().catch(err => console.error('Reconnection failed: ', err));
  }

  public sendMessage(message: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && message.trim()) {
      this.log(`${this.user}: ${message}`, false);
      this.socket.send(message.trim());
    } else {
      this.log('WebSocket is not open or message is empty. Ready state: ' + this.socket?.readyState, false);
    }
  }

  public sendAttachment(file: File): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.log(`Sending file: ${file.name} (${file.size} bytes)`, false);      
      const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
      let currentChunk = 0;

      const sendNextChunk = () => {
        console.log(`Sending chunk ${currentChunk + 1} of ${totalChunks}`);
        const start = currentChunk * this.CHUNK_SIZE;
        const end = Math.min(file.size, start + this.CHUNK_SIZE);
        const chunk = file.slice(start, end);
  
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer === false) {
            console.error('Failed to read file chunk');
            return;
          }
          const arrayBuffer = reader.result;
  
          // Metadata for chunking
          const metadata = JSON.stringify({
            file_name: file.name,
            mime_type: file.type || 'application/octet-stream',
            total_chunks: totalChunks,
            current_chunk: currentChunk,
          });
  
          const metadataBuffer = new TextEncoder().encode(metadata);
          const delimiter = new Uint8Array([0]); // Null byte as delimiter
  
          // Combine metadata and chunk data into a single buffer
          const combinedBuffer = new Uint8Array(
            metadataBuffer.byteLength + delimiter.byteLength + arrayBuffer.byteLength
          );
  
          combinedBuffer.set(metadataBuffer, 0);
          combinedBuffer.set(delimiter, metadataBuffer.byteLength);
          combinedBuffer.set(new Uint8Array(arrayBuffer), metadataBuffer.byteLength + delimiter.byteLength);
  
          this.socket?.send(combinedBuffer);
  
          if (currentChunk < totalChunks - 1) {
            currentChunk++;
            sendNextChunk();
          } else {
            this.log(`File sent: ${file.name}`, false);
          }
        };
        reader.readAsArrayBuffer(chunk);
      };

      sendNextChunk();
    } else {
      this.log('WebSocket is not open. Ready state: ' + this.socket?.readyState, false);
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
      message.includes('left the room') ||
      message.includes('joined') ||
      message.includes('File Sending:')
    );
  }

  private handleSystemMessage(message: string): void {
    const matchJoin = message.match(/([\w-]+) joined (\w+)/);
    if (matchJoin) {
        this.user = matchJoin[1];
        this.room = matchJoin[2];
        return;
    }

    const matchRooms = message.match(/Rooms available: (.*)/);
    if (matchRooms) {
        this.rooms$.next(matchRooms[1].split(',').map((room: string) => room.trim()));
        return;
    }

    // Adjust the regular expression to match the expected format
    const matchFiles = message.match(/File Sending:([^:]+):([^:]+):(.+)/);
    if (matchFiles) {
        const fileName = matchFiles[1];
        const mimeType = matchFiles[2];
        const base64Data = matchFiles[3];

        // Decode the base64 string to get the binary data
        const binaryData = atob(base64Data);
        const len = binaryData.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryData.charCodeAt(i);
        }

        // Create a Blob object from the binary data
        const blob = new Blob([bytes], { type: mimeType });

        // Process the Blob object as needed
        // For example, save it or display it
        this.showFile(blob, fileName);
    } else {
        console.error('File message format is incorrect');
    }
}

// Example function to save the Blob object
private showFile(blob: Blob, fileName: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.textContent = `${this.user} sent a file: ${fileName} [click to download]`;
  link.style.display = 'block';
  link.style.margin = '10px 0';

  // Create a container for the link
  const linkContainer = document.createElement('div');
  linkContainer.appendChild(link);

  // Append the link container's HTML to the message$
  this.message$.next(linkContainer.innerHTML);
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

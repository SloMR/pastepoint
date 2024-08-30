import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { environment } from "../../environments/environment";

@Injectable({
  providedIn: "root",
})
export class WebsocketService {
  public message$: BehaviorSubject<string> = new BehaviorSubject("");
  public rooms$: BehaviorSubject<string[]> = new BehaviorSubject([""]);
  public members$: BehaviorSubject<string[]> = new BehaviorSubject([""]);
  public uploadProgress$: BehaviorSubject<number> = new BehaviorSubject(0);

  private socket: WebSocket | undefined;
  private worker: Worker | undefined;

  public user: string = "user";
  private room: string = "main";

  private webSocketProto = "wss";
  private host = environment.apiUrl;

  private CHUNK_SIZE = 16 * 1024;

  private wsUri = `${this.webSocketProto}://${this.host}/ws`;

  constructor() {}

  public connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = new WebSocket(this.wsUri);

      this.socket.onopen = () => {
        this.log("Connected", false);
        this.getUsername();
        resolve();
      };

      this.socket.onmessage = (ev) => {
        if (typeof ev.data === "string") {
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
        this.sendUserDisconnected();
        this.log(
          `Disconnected with code: ${event.code}, reason: ${event.reason}`,
          false
        );
        setTimeout(() => this.reconnect(), 1000);
      };

      this.socket.onerror = (error) => {
        this.log("WebSocket Error: " + error, false);
        reject(error);
      };
    });
  }

  private reconnect() {
    this.log("Attempting to reconnect...", false);
    this.connect().catch((err) => console.error("Reconnection failed: ", err));
  }

  private sendUserDisconnected(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(`[UserDisconnected] ${this.user}`);
      this.log(`Sent disconnect notification for user: ${this.user}`, false);
    }
  }

  private getUsername(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(`[UserCommand] /name`);
      this.log(`get username`, false);
    }
  }

  public sendMessage(message: string): void {
    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      message.trim()
    ) {
      this.log(`${this.user}: ${message}`, false);
      this.socket.send(message.trim());
    } else {
      this.log(
        "WebSocket is not open or message is empty. Ready state: " +
          this.socket?.readyState,
        false
      );
    }
  }

  public sendAttachments(files: FileList | File[]): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const totalFiles = fileArray.length;
      let currentFileIndex = 0;

      const processNextFile = () => {
        if (currentFileIndex < totalFiles) {
          const file = fileArray[currentFileIndex];
          if (!file) {
            console.error(`File at index ${currentFileIndex} is undefined.`);
            return;
          }

          this.log(
            `Starting upload for file: ${file.name} (${file.size} bytes)`,
            false
          );

          this.sendSingleFile(file, () => {
            currentFileIndex++;
            processNextFile();
          });
        }
      };

      processNextFile();
    } else {
      this.log(
        "WebSocket is not open. Ready state: " + this.socket?.readyState,
        false
      );
    }
  }

  private sendSingleFile(file: File, callback: () => void): void {
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    let currentChunk = 0;

    const sendNextChunk = () => {
      const chunk = this.getChunk(file, currentChunk);
      this.readAndSendChunk(
        chunk,
        currentChunk,
        totalChunks,
        file.name,
        file.type,
        () => {
          currentChunk++;
          if (currentChunk < totalChunks) {
            const progress = Math.floor((currentChunk / totalChunks) * 100);
            this.uploadProgress$.next(progress);
            sendNextChunk();
          } else {
            this.uploadProgress$.next(100);
            this.log(`File sent: ${file.name}`, false);
            this.resetProgressAfterDelay();
            callback();
          }
        }
      );
    };

    sendNextChunk();
  }

  private getChunk(file: File, currentChunk: number): Blob {
    const start = currentChunk * this.CHUNK_SIZE;
    const end = Math.min(file.size, start + this.CHUNK_SIZE);
    return file.slice(start, end);
  }

  private readAndSendChunk(
    chunk: Blob,
    currentChunk: number,
    totalChunks: number,
    fileName: string,
    mimeType: string,
    callback: () => void
  ): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer === false) {
        console.error("Failed to read file chunk");
        return;
      }
      const arrayBuffer = reader.result as ArrayBuffer;
      const combinedBuffer = this.createCombinedBuffer(
        arrayBuffer,
        fileName,
        mimeType,
        currentChunk,
        totalChunks
      );
      this.socket?.send(combinedBuffer);
      callback();
    };
    reader.readAsArrayBuffer(chunk);
  }

  private createCombinedBuffer(
    arrayBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string,
    currentChunk: number,
    totalChunks: number
  ): Uint8Array {
    const metadata = JSON.stringify({
      file_name: fileName,
      mime_type: mimeType || "application/octet-stream",
      total_chunks: totalChunks,
      current_chunk: currentChunk,
    });

    const metadataBuffer = new TextEncoder().encode(metadata);
    const delimiter = new Uint8Array([0]);

    const combinedBuffer = new Uint8Array(
      metadataBuffer.byteLength + delimiter.byteLength + arrayBuffer.byteLength
    );

    combinedBuffer.set(metadataBuffer, 0);
    combinedBuffer.set(delimiter, metadataBuffer.byteLength);
    combinedBuffer.set(
      new Uint8Array(arrayBuffer),
      metadataBuffer.byteLength + delimiter.byteLength
    );

    return combinedBuffer;
  }

  private resetProgressAfterDelay(): void {
    setTimeout(() => {
      this.uploadProgress$.next(0);
    }, 2000);
  }

  public listRooms(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      let message = "[UserCommand] /list";
      this.socket.send(message);
    } else {
      this.log(
        "WebSocket is not open. Ready state: " + this.socket?.readyState,
        false
      );
    }
  }

  public joinRoom(room: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.message$.next(`Leaving room: ${this.room}, joining room: ${room}`);
      let message = `[UserCommand] /join ${room}`;
      this.socket.send(message);
    } else {
      this.log(
        "WebSocket is not open. Ready state: " + this.socket?.readyState,
        false
      );
    }
  }

  private isSystemMessage(message: string): boolean {
    return (
      message.includes("[SystemMessage]") ||
      message.includes("[SystemJoin]") ||
      message.includes("[SystemRooms]") ||
      message.includes("[SystemFile]") ||
      message.includes("[SystemAck]") ||
      message.includes("[SystemMembers]") ||
      message.includes("[SystemName]")
    );
  }

  private handleSystemMessage(message: string): void {
    this.log(`System message: ${message}`, false);
    if (message.startsWith("[SystemAck]:")) {
      this.message$.next("File uploaded successfully");
      return;
    }

    const matchName = message.match(/\[SystemName\]\s*:\s*(.*?)$/);
    if (matchName && matchName[1]) {
      const userName = matchName[1].trim();
      this.log(`Username updated from: ${this.user}, to: ${userName}`, false);
      this.user = userName;
      return;
    }

    const matchJoin = message.match(/^(.*?)\s*\[SystemJoin\]\s*(.*?)$/);
    if (matchJoin) {
      this.room = matchJoin[2];
      return;
    }

    const matchRooms = message.match(/\[SystemRooms\]:\s*(.*?)$/);
    if (matchRooms) {
      this.rooms$.next(
        matchRooms[1].split(",").map((room: string) => room.trim())
      );
      return;
    }

    const matchMeber = message.match(/\[SystemMembers\]:\s*(.*?)$/);
    if (matchMeber) {
      this.members$.next(
        matchMeber[1].split(",").map((room: string) => room.trim())
      );
      return;
    }

    const matchFiles = message.match(/\[SystemFile]:([^:]+):([^:]+):(.+)/);
    if (matchFiles) {
      const fileName = matchFiles[1];
      const mimeType = matchFiles[2];
      const base64Data = matchFiles[3];

      const binaryData = atob(base64Data);
      const len = binaryData.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType });

      this.showFile(blob, fileName);
      return;
    }

    const matchSystemError = message.replace(/^\[SystemError\]\s*/, "");
    if (matchSystemError) {
      console.error(`System Error: ${matchSystemError}`);
      return;
    }

    console.error("Unhandled system message:", message);
  }

  private showFile(blob: Blob, fileName: string): void {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.textContent = `${this.user} sent a file: ${fileName} [click to download];`;
    link.style.display = "block";
    link.style.margin = "10px 0";

    const linkContainer = document.createElement("div");
    linkContainer.appendChild(link);

    this.message$.next(linkContainer.innerHTML);
  }

  private handleUserMessage(message: string): void {
    if (message.trim()) {
      this.message$.next(`${message}`);
    }
  }

  public log(msg: string, show: boolean): void {
    if (environment.production === false) {
      console.log(`[WebSocket] ${msg}`);
    }

    if (show) {
      this.message$.next(`${msg}`);
    }
  }
}

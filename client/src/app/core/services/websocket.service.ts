import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { environment } from "../../environments/environment";
import { LoggerService } from "./logger.service";

@Injectable({
  providedIn: "root",
})
export class WebsocketService {
  public message$ = new BehaviorSubject<string>("");
  public rooms$ = new BehaviorSubject<string[]>([""]);
  public members$ = new BehaviorSubject<string[]>([""]);
  public uploadProgress$ = new BehaviorSubject<number>(0);
  public downloadProgress$ = new BehaviorSubject<number>(0);

  private socket: WebSocket | undefined;
  private worker: Worker | undefined;
  private fileChunks = new Map<string, { chunks: string[], totalChunks: number }>();

  public user = "user";
  private room = "main";

  private webSocketProto = "wss";
  private host = environment.apiUrl;

  private CHUNK_SIZE = 32 * 1024;

  private wsUri = `${this.webSocketProto}://${this.host}/ws`;

  constructor(private logger: LoggerService) {}

  public connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = new WebSocket(this.wsUri);

      this.socket.onopen = () => {
        this.logger.log("Connected");
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
          this.logger.log(`Received attachment: ${blob.size} bytes`);
          return;
        }
      };

      this.socket.onclose = (event) => {
        this.sendUserDisconnected();
        this.logger.log(`Disconnected with code: ${event.code}, reason: ${event.reason}`);
        setTimeout(() => this.reconnect(), 1000);
      };

      this.socket.onerror = (error) => {
        this.logger.log("WebSocket Error: " + error);
        reject(error);
      };
    });
  }

  private reconnect() {
    this.logger.log("Attempting to reconnect...");
    this.connect().catch((err) => console.error("Reconnection failed: ", err));
  }

  private sendUserDisconnected(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(`[UserDisconnected] ${this.user}`);
      this.logger.log(`Sent disconnect notification for user: ${this.user}`);
    }
  }

  private getUsername(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(`[UserCommand] /name`);
      this.logger.log(`get username`);
    }
  }

  public sendMessage(message: string): void {
    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      message.trim()
    ) {
      this.logger.log(`${this.user}: ${message}`);
      this.socket.send(message.trim());
    } else {
      this.logger.log(
        "WebSocket is not open or message is empty. Ready state: " +
          this.socket?.readyState
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
          this.logger.log( `Starting upload for file: ${file.name} (${file.size} bytes)`);
          this.sendSingleFile(file, () => {
            currentFileIndex++;
            processNextFile();
          });
        }
      };

      processNextFile();
    } else {
      this.logger.log("WebSocket is not open. Ready state: " + this.socket?.readyState);
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
            this.logger.log(`File sent: ${file.name}`);
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
      this.downloadProgress$.next(0);
    }, 2000);
  }

  public listRooms(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const message = "[UserCommand] /list";
      this.socket.send(message);
    } else {
      this.logger.log("WebSocket is not open. Ready state: " + this.socket?.readyState);
    }
  }

  public joinRoom(room: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.message$.next(`Leaving room: ${this.room}, joining room: ${room}`);
      const message = `[UserCommand] /join ${room}`;
      this.socket.send(message);
    } else {
      this.logger.log("WebSocket is not open. Ready state: " + this.socket?.readyState);
    }
  }

  private isSystemMessage(message: string): boolean {
    return (
      message.includes("[SystemMessage]") ||
      message.includes("[SystemJoin]") ||
      message.includes("[SystemRooms]") ||
      message.includes("[SystemFile]") ||
      message.includes("[SystemFileChunk]") ||
      message.includes("[SystemAck]") ||
      message.includes("[SystemMembers]") ||
      message.includes("[SystemName]")
    );
  }

  private handleSystemMessage(message: string): void {
    if (message.startsWith("[SystemAck]:")) {
      this.logger.log("Received ack from server");
      this.message$.next("File uploaded successfully");
      return;
    }

    const matchName = message.match(/\[SystemName\]\s*:\s*(.*?)$/);
    if (matchName && matchName[1]) {
      const userName = matchName[1].trim();
      this.logger.log(`Username updated from: ${this.user}, to: ${userName}`);
      this.user = userName;
      return;
    }

    const matchJoin = message.match(/^(.*?)\s*\[SystemJoin\]\s*(.*?)$/);
    if (matchJoin) {
      this.logger.log(`User joined room ${matchJoin[2]}`);
      this.room = matchJoin[2];
      return;
    }

    const matchRooms = message.match(/\[SystemRooms\]:\s*(.*?)$/);
    if (matchRooms) {
      this.logger.log(`Rooms: ${matchRooms[1]}`);
      this.rooms$.next(
        matchRooms[1].split(",").map((room: string) => room.trim())
      );
      return;
    }

    const matchMeber = message.match(/\[SystemMembers\]:\s*(.*?)$/);
    if (matchMeber) {
      this.logger.log(`Members: ${matchMeber[1]}`);
      this.members$.next(
        matchMeber[1].split(",").map((room: string) => room.trim())
      );
      return;
    }

    const matchFileChunk = message.match(/\[SystemFileChunk\]:(.*?):(.*?):(\d+):(\d+):(.+)/);
    if (matchFileChunk) {
      this.logger.log("Received file chunk");
      const fileName = matchFileChunk[1];
      const mimeType = matchFileChunk[2];
      const currentChunk = parseInt(matchFileChunk[3], 10);
      const totalChunks = parseInt(matchFileChunk[4], 10);
      const base64Data = matchFileChunk[5];

      this.receiveFileChunk(fileName, mimeType, currentChunk, totalChunks, base64Data);
      return;
    }

    const matchSystemError = message.replace(/^\[SystemError\]\s*/, "");
    if (matchSystemError) {
      this.logger.log(`System Error: ${matchSystemError}`);
      console.error(`System Error: ${matchSystemError}`);
      return;
    }

    console.error("Unhandled system message:", message);
  }

  private receiveFileChunk(
    fileName: string,
    mimeType: string,
    currentChunk: number,
    totalChunks: number,
    base64Data: string
  ): void {
    if (!this.fileChunks.has(fileName)) {
      this.fileChunks.set(fileName, { chunks: new Array(totalChunks), totalChunks });
    }

    const fileData = this.fileChunks.get(fileName);
    if (!fileData) return;

    fileData.chunks[currentChunk - 1] = base64Data;
    this.logger.log(`Received chunk ${currentChunk}/${totalChunks} for file: ${fileName}`);

    const receivedChunksCount = fileData.chunks.filter(chunk => !!chunk).length;
    const progress = Math.floor((receivedChunksCount / totalChunks) * 100);
    this.downloadProgress$.next(progress);

    if (fileData.chunks.filter(chunk => !!chunk).length === totalChunks) {
      this.logger.log(`All chunks received for file: ${fileName}. Reassembling...`);
      this.assembleAndDownloadFile(fileName, mimeType, fileData.chunks);
      this.fileChunks.delete(fileName);
      this.downloadProgress$.next(100);

      this.resetProgressAfterDelay();
    }
  }

  private assembleAndDownloadFile(fileName: string, mimeType: string, chunks: string[]): void {
    const byteArrays = chunks.map(chunk => {
      const binaryString = atob(chunk);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });

    const blob = new Blob(byteArrays, { type: mimeType });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.textContent = `${fileName} [click to download]`;
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
}

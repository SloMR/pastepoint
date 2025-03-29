import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ChatMessage, DataChannelMessage } from '../../../utils/constants';
import { TranslateService } from '@ngx-translate/core';
import { IWebRTCService } from '../../interfaces/webrtc.interface';
import { WebRTCSignalingService } from './webrtc-signaling.service';
import { WebRTCCommunicationService } from './webrtc-communication.service';

@Injectable({
  providedIn: 'root',
})
export class WebRTCService implements IWebRTCService {
  constructor(
    public translate: TranslateService,
    private signalingService: WebRTCSignalingService,
    private communicationService: WebRTCCommunicationService
  ) {}

  // =============== Public Properties ===============
  /**
   * Gets the data channel open subject
   */
  public get dataChannelOpen$(): BehaviorSubject<boolean> {
    return this.communicationService.dataChannelOpen$;
  }

  /**
   * Gets the chat messages subject
   */
  public get chatMessages$(): Subject<ChatMessage> {
    return this.communicationService.chatMessages$;
  }

  /**
   * Gets the file offers subject
   */
  public get fileOffers$(): Subject<{
    fileName: string;
    fileSize: number;
    fromUser: string;
    fileId: string;
  }> {
    return this.communicationService.fileOffers$;
  }

  /**
   * Gets the file responses subject
   */
  public get fileResponses$(): Subject<{ accepted: boolean; fromUser: string; fileId: string }> {
    return this.communicationService.fileResponses$;
  }

  /**
   * Gets the file upload cancelled subject
   */
  public get fileUploadCancelled$(): Subject<{ fromUser: string; fileId: string }> {
    return this.communicationService.fileUploadCancelled$;
  }

  /**
   * Gets the file download cancelled subject
   */
  public get fileDownloadCancelled$(): Subject<{ fromUser: string; fileId: string }> {
    return this.communicationService.fileDownloadCancelled$;
  }

  /**
   * Gets the buffered amount low subject
   */
  public get bufferedAmountLow$(): Subject<string> {
    return this.communicationService.bufferedAmountLow$;
  }

  /**
   * Gets the incoming file chunk subject
   */
  public get incomingFileChunk$(): Subject<{
    fromUser: string;
    fileId: string;
    chunk: ArrayBuffer;
  }> {
    return this.communicationService.incomingFileChunk$;
  }

  // =============== Public Methods ===============
  /**
   * Initiates a new WebRTC connection with a target user
   * @param targetUser The user to connect with
   */
  public initiateConnection(targetUser: string): void {
    this.signalingService.initiateConnection(targetUser);
  }

  /**
   * Sends a message to a target user
   * @param message The message to send
   * @param targetUser The user to send the message to
   */
  public sendData(message: DataChannelMessage, targetUser: string): void {
    if (!this.communicationService.isConnected(targetUser)) {
      this.signalingService.initiateConnection(targetUser);
    }
    this.communicationService.sendData(message, targetUser);
  }

  /**
   * Sends raw data to a target user
   * @param data The raw data to send
   * @param targetUser The user to send the data to
   */
  public sendRawData(data: ArrayBuffer, targetUser: string): boolean {
    if (!this.communicationService.isConnected(targetUser)) {
      this.signalingService.initiateConnection(targetUser);
    }
    return this.communicationService.sendRawData(data, targetUser);
  }

  /**
   * Gets the data channel for a target user
   * @param targetUser The user to get the channel for
   */
  public getDataChannel(targetUser: string): RTCDataChannel | null {
    return this.communicationService.getDataChannel(targetUser);
  }

  /**
   * Checks if there is an active connection with a target user
   * @param targetUser The user to check connection with
   */
  public isConnected(targetUser: string): boolean {
    return this.communicationService.isConnected(targetUser);
  }

  /**
   * Closes all connections
   */
  public closeAllConnections(): void {
    this.signalingService.closeAllConnections();
    this.communicationService.closeAllConnections();
  }
}

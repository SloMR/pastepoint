import { BehaviorSubject } from 'rxjs';
import { ChatMessage, ChatMessageType } from '../../utils/constants';

export interface IChatService {
  messages$: BehaviorSubject<ChatMessage[]>;
  user: string;

  sendMessage(content: string, targetUser: string, messageType: ChatMessageType): void;
  getUsername(): void;
  clearMessages(): void;
}

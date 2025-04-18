import { BehaviorSubject } from 'rxjs';
import { ChatMessage } from '../../utils/constants';

export interface IChatService {
  messages$: BehaviorSubject<ChatMessage[]>;
  user: string;

  sendMessage(content: string, targetUser: string): void;
  getUsername(): void;
  clearMessages(): void;
}

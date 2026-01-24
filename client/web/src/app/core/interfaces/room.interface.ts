import { BehaviorSubject } from 'rxjs';

export interface IRoomService {
  rooms$: BehaviorSubject<string[]>;
  members$: BehaviorSubject<string[]>;
  currentRoom: string;

  listRooms(): void;
  joinRoom(room: string): void;
}

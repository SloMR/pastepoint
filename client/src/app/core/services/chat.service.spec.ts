import { TestBed } from '@angular/core/testing';
import { ChatService } from './chat.service';
import { TestImports, TestProviders } from '../../testing/test-helper';
import { UserService } from './user.service';
import { WebSocketConnectionService } from './websocket-connection.service';
import { WebRTCService } from './webrtc.service';
import { BehaviorSubject } from 'rxjs';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [
        ...TestProviders,
        {
          provide: WebSocketConnectionService,
          useValue: {
            systemMessages$: new BehaviorSubject(''),
            send: jasmine.createSpy('send'),
          },
        },
        {
          provide: WebRTCService,
          useValue: {
            chatMessages$: new BehaviorSubject({}),
            sendData: jasmine.createSpy('sendData'),
            isConnected: jasmine.createSpy('isConnected').and.returnValue(true),
            dataChannelOpen$: new BehaviorSubject(true),
          },
        },
        {
          provide: UserService,
          useValue: {
            user: 'TestUser',
            user$: new BehaviorSubject('TestUser'),
          },
        },
      ],
    });
    service = TestBed.inject(ChatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

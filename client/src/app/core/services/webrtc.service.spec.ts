import { TestBed } from '@angular/core/testing';
import { WebRTCService } from './webrtc.service';
import { TestImports, TestProviders } from '../../testing/test-helper';
import { UserService } from './user.service';
import { WebSocketConnectionService } from './websocket-connection.service';
import { BehaviorSubject } from 'rxjs';

describe('WebRTCService', () => {
  let service: WebRTCService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [
        ...TestProviders,
        // Mock dependencies
        {
          provide: WebSocketConnectionService,
          useValue: {
            signalMessages$: new BehaviorSubject(null),
            sendSignalMessage: jasmine.createSpy('sendSignalMessage'),
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
    service = TestBed.inject(WebRTCService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from './chat.component';
import { TestImports, TestProviders } from '../../testing/test-helper';
import { PLATFORM_ID } from '@angular/core';
import { ChatService } from '../../core/services/chat.service';
import { RoomService } from '../../core/services/room.service';
import { FileTransferService } from '../../core/services/file-transfer.service';
import { WebRTCService } from '../../core/services/webrtc.service';
import { WebSocketConnectionService } from '../../core/services/websocket-connection.service';
import { UserService } from '../../core/services/user.service';
import { ThemeService } from '../../core/services/theme.service';
import { FlowbiteService } from '../../core/services/flowbite.service';
import { SessionService } from '../../core/services/session.service';
import { BehaviorSubject, of } from 'rxjs';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ElementRef } from '@angular/core';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, NoopAnimationsModule, ChatComponent, ...TestImports],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        ...TestProviders,
        provideRouter([]),
        {
          provide: ChatService,
          useValue: {
            messages$: new BehaviorSubject([]),
            clearMessages: jasmine.createSpy('clearMessages'),
            getUsername: jasmine.createSpy('getUsername'),
            sendMessage: jasmine.createSpy('sendMessage'),
          },
        },
        {
          provide: RoomService,
          useValue: {
            rooms$: new BehaviorSubject([]),
            members$: new BehaviorSubject([]),
            currentRoom: 'main',
            listRooms: jasmine.createSpy('listRooms'),
            joinRoom: jasmine.createSpy('joinRoom'),
          },
        },
        {
          provide: FileTransferService,
          useValue: {
            activeUploads$: new BehaviorSubject([]),
            activeDownloads$: new BehaviorSubject([]),
            incomingFileOffers$: new BehaviorSubject([]),
            prepareFileForSending: jasmine.createSpy('prepareFileForSending'),
            sendAllFileOffers: jasmine.createSpy('sendAllFileOffers'),
            startSavingFile: jasmine.createSpy('startSavingFile'),
            declineFileOffer: jasmine.createSpy('declineFileOffer'),
            cancelUpload: jasmine.createSpy('cancelUpload'),
            cancelDownload: jasmine.createSpy('cancelDownload'),
          },
        },
        {
          provide: WebRTCService,
          useValue: {
            initiateConnection: jasmine.createSpy('initiateConnection'),
            dataChannelOpen$: new BehaviorSubject(true),
            isConnected: jasmine.createSpy('isConnected').and.returnValue(true),
            closeAllConnections: jasmine.createSpy('closeAllConnections'),
          },
        },
        {
          provide: WebSocketConnectionService,
          useValue: {
            connect: jasmine.createSpy('connect').and.returnValue(Promise.resolve()),
            disconnect: jasmine.createSpy('disconnect'),
          },
        },
        {
          provide: UserService,
          useValue: {
            user: 'TestUser',
            user$: new BehaviorSubject('TestUser'),
          },
        },
        {
          provide: ThemeService,
          useValue: {
            setThemePreference: jasmine.createSpy('setThemePreference'),
            initializeTheme: jasmine.createSpy('initializeTheme'),
          },
        },
        {
          provide: FlowbiteService,
          useValue: {
            loadFlowbite: jasmine.createSpy('loadFlowbite').and.callFake((cb) => cb({})),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createNewSessionCode: jasmine
              .createSpy('createNewSessionCode')
              .and.returnValue(of({ code: 'test-code' })),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    component.messageContainer = new ElementRef(document.createElement('div'));

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

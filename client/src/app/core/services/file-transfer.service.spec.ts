import { TestBed } from '@angular/core/testing';
import { FileTransferService } from './file-transfer.service';
import { TestImports, TestProviders } from '../../testing/test-helper';
import { WebRTCService } from './webrtc.service';
import { BehaviorSubject, Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

describe('FileTransferService', () => {
  let service: FileTransferService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [
        ...TestProviders,
        // Mock dependencies
        {
          provide: WebRTCService,
          useValue: {
            incomingFileChunk$: new Subject(),
            fileOffers$: new Subject(),
            fileResponses$: new Subject(),
            bufferedAmountLow$: new Subject(),
            fileUploadCancelled$: new Subject(),
            fileDownloadCancelled$: new Subject(),
            dataChannelOpen$: new BehaviorSubject(true),
            sendData: jasmine.createSpy('sendData'),
            sendRawData: jasmine.createSpy('sendRawData').and.returnValue(true),
            isConnected: jasmine.createSpy('isConnected').and.returnValue(true),
            getDataChannel: jasmine.createSpy('getDataChannel').and.returnValue({
              readyState: 'open',
              bufferedAmount: 0,
              send: jasmine.createSpy('send'),
            }),
          },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: (key: string) => key,
          },
        },
      ],
    });
    service = TestBed.inject(FileTransferService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

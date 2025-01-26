import { TestBed } from '@angular/core/testing';

import { WebRTCService } from './webrtc.service';

describe('WebrtcService', () => {
  let service: WebRTCService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebRTCService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

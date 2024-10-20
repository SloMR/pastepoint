import { TestBed } from '@angular/core/testing';

import { WebrtcService } from './webrtc.service';

describe('WebrtcService', () => {
  let service: WebrtcService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebrtcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

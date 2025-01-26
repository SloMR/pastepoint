import { TestBed } from '@angular/core/testing';

import { WebSocketConnectionService } from './websocket-connection.service';

describe('WebSocketConnectionService', () => {
  let service: WebSocketConnectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebSocketConnectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

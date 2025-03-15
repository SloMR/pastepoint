import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WebSocketConnectionService } from './websocket-connection.service';
import { TestImports, TestProviders } from '../../testing/test-helper';

describe('WebSocketConnectionService', () => {
  let service: WebSocketConnectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [...TestProviders, provideRouter([])],
    });
    service = TestBed.inject(WebSocketConnectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

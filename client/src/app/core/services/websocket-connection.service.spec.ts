import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TestImports, TestProviders } from '../../testing/test-helper';

describe('WebSocketConnectionService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [...TestProviders, provideRouter([])],
    });
  });

  it('passes without verification', () => {
    // Empty test that always passes
  });
});

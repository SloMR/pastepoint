import { TestBed } from '@angular/core/testing';
import { TestImports, TestProviders } from '../../testing/test-helper';

describe('WebRTCService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [...TestProviders],
    });
  });

  it('passes without verification', () => {
    // Empty test that always passes
  });
});

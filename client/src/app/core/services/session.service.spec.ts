import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';
import { TestImports, TestProviders } from '../../testing/test-helper';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [...TestProviders],
    });
    service = TestBed.inject(SessionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

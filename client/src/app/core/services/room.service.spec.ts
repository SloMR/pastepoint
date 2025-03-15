import { TestBed } from '@angular/core/testing';
import { RoomService } from './room.service';
import { TestImports, TestProviders } from '../../testing/test-helper';

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [...TestProviders],
    });
    service = TestBed.inject(RoomService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
